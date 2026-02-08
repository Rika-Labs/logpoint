import { Effect } from "effect";
import { InjectionError, SecretVarBlocked } from "./errors.js";
import { detectLanguage, type Language } from "./language.js";
import { isSecretVariable } from "./secrets.js";
import type { LogpointDef } from "./schema.js";
import {
  generateTemplate,
  goImportPaths,
  type GoTemplateRefs,
} from "./templates.js";

const markerStartPattern = /LOGPOINT_START\s*\[([^\]]+)\]/;
const markerEndPattern = /LOGPOINT_END\s*\[([^\]]+)\]/;

const parseMarkerId = (line: string): string | undefined => {
  const matched = line.match(markerStartPattern) ?? line.match(markerEndPattern);
  return matched?.[1];
};

const sanitizeGoAlias = (name: string): string => `__lp_${name.replace(/[^a-zA-Z0-9_]/g, "_")}`;

type GoImportState = {
  readonly lines: readonly string[];
  readonly refs: GoTemplateRefs;
};

type ImportSpec = {
  readonly alias?: string;
  readonly path: string;
  readonly raw: string;
};

const importLinePattern = /^\s*(?:(?<alias>[_A-Za-z][A-Za-z0-9_]*)\s+)?"(?<path>[^"]+)"/;

const parseImportLine = (line: string): ImportSpec | undefined => {
  const match = line.match(importLinePattern);
  if (match === null) {
    return undefined;
  }
  const alias = match.groups?.["alias"];
  const path = match.groups?.["path"];
  if (path === undefined) {
    return undefined;
  }
  if (alias === undefined) {
    return { path, raw: line.trim() };
  }
  return { alias, path, raw: line.trim() };
};

const parseSingleImport = (line: string): ImportSpec | undefined => {
  const statement = line.trim();
  if (!statement.startsWith("import ")) {
    return undefined;
  }
  return parseImportLine(statement.slice("import ".length));
};

const defaultImportName = (path: string): string => {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
};

const importNameFromSpec = (spec: ImportSpec): string => {
  if (spec.alias === undefined) {
    return defaultImportName(spec.path);
  }
  if (spec.alias === "_" || spec.alias === ".") {
    return defaultImportName(spec.path);
  }
  return spec.alias;
};

const ensureGoImports = (content: string): GoImportState => {
  const required = {
    bytes: goImportPaths.bytes,
    json: goImportPaths.json,
    http: goImportPaths.http,
    time: goImportPaths.time,
  } as const;

  const lines = content.split("\n");
  const importsByPath: Record<string, ImportSpec> = {};

  let importStart = -1;
  let importEnd = -1;
  let isBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.trim() ?? "";
    if (line === "import (") {
      importStart = index;
      isBlock = true;
      for (let inner = index + 1; inner < lines.length; inner += 1) {
        const innerLine = lines[inner] ?? "";
        if (innerLine.trim() === ")") {
          importEnd = inner;
          break;
        }
        const spec = parseImportLine(innerLine);
        if (spec !== undefined) {
          importsByPath[spec.path] = spec;
        }
      }
      break;
    }

    if (line.startsWith("import ")) {
      importStart = index;
      importEnd = index;
      isBlock = false;
      const spec = parseSingleImport(line);
      if (spec !== undefined) {
        importsByPath[spec.path] = spec;
      }
      break;
    }
  }

  const refs: GoTemplateRefs = {
    bytesRef: importNameFromSpec(importsByPath[required.bytes] ?? { path: required.bytes, raw: "" }),
    jsonRef: importNameFromSpec(importsByPath[required.json] ?? { path: required.json, raw: "" }),
    httpRef: importNameFromSpec(importsByPath[required.http] ?? { path: required.http, raw: "" }),
    timeRef: importNameFromSpec(importsByPath[required.time] ?? { path: required.time, raw: "" }),
  };

  const missing: Array<{ readonly path: string; readonly alias: string; readonly key: keyof GoTemplateRefs }> = [];

  if (importsByPath[required.bytes] === undefined) {
    const alias = sanitizeGoAlias("bytes");
    refs.bytesRef = alias;
    missing.push({ path: required.bytes, alias, key: "bytesRef" });
  }
  if (importsByPath[required.json] === undefined) {
    const alias = sanitizeGoAlias("json");
    refs.jsonRef = alias;
    missing.push({ path: required.json, alias, key: "jsonRef" });
  }
  if (importsByPath[required.http] === undefined) {
    const alias = sanitizeGoAlias("http");
    refs.httpRef = alias;
    missing.push({ path: required.http, alias, key: "httpRef" });
  }
  if (importsByPath[required.time] === undefined) {
    const alias = sanitizeGoAlias("time");
    refs.timeRef = alias;
    missing.push({ path: required.time, alias, key: "timeRef" });
  }

  if (missing.length === 0) {
    return { lines, refs };
  }

  const importLines = missing.map((item) => `\t${item.alias} "${item.path}" // LOGPOINT_IMPORT`);

  if (importStart >= 0 && importEnd >= importStart && isBlock) {
    const updated = [...lines];
    updated.splice(importEnd, 0, ...importLines);
    return { lines: updated, refs };
  }

  if (importStart >= 0 && importEnd === importStart && !isBlock) {
    const single = lines[importStart] ?? "";
    const spec = parseSingleImport(single.trim());
    const existing = spec === undefined ? [] : [`\t${spec.raw}`];
    const block = ["import (", ...existing, ...importLines, ")"];
    const updated = [...lines];
    updated.splice(importStart, 1, ...block);
    return { lines: updated, refs };
  }

  const packageIndex = lines.findIndex((line) => line.trim().startsWith("package "));
  const updated = [...lines];
  const insertionIndex = packageIndex >= 0 ? packageIndex + 1 : 0;
  updated.splice(insertionIndex, 0, "", "import (", ...importLines, ")", "");
  return { lines: updated, refs };
};

export type InjectContentResult = {
  readonly content: string;
  readonly inserted: number;
  readonly blocked: readonly SecretVarBlocked[];
};

const hasLogpointId = (content: string, id: string): boolean =>
  content.includes(`LOGPOINT_START [${id}]`) || content.includes(`LOGPOINT_END [${id}]`);

const sortDescendingByLine = (defs: readonly LogpointDef[]): readonly LogpointDef[] =>
  [...defs].sort((a, b) => b.line - a.line);

const safeCaptureVars = (
  capture: readonly string[],
  logpointId: string,
): {
  readonly safe: readonly string[];
  readonly blocked: readonly SecretVarBlocked[];
} => {
  const safe: string[] = [];
  const blocked: SecretVarBlocked[] = [];

  for (const variable of capture) {
    if (isSecretVariable(variable)) {
      blocked.push(new SecretVarBlocked({ logpointId, variable }));
      continue;
    }
    safe.push(variable);
  }

  return { safe, blocked };
};

export const injectContent = (
  content: string,
  defs: readonly LogpointDef[],
  filePath: string,
  port: number,
  explicitLanguage?: Language,
): Effect.Effect<InjectContentResult, InjectionError, never> =>
  Effect.gen(function* () {
    const language = explicitLanguage ?? detectLanguage(filePath);
    let lines = content.split("\n");
    let goRefs: GoTemplateRefs | undefined;
    const blocked: SecretVarBlocked[] = [];
    let inserted = 0;

    if (language === "go") {
      const goImportState = ensureGoImports(lines.join("\n"));
      lines = [...goImportState.lines];
      goRefs = goImportState.refs;
    }

    for (const def of sortDescendingByLine(defs)) {
      if (hasLogpointId(lines.join("\n"), def.id)) {
        continue;
      }

      if (def.line < 1 || def.line > lines.length + 1) {
        return yield* Effect.fail(
          new InjectionError({
            logpointId: def.id,
            file: filePath,
            line: def.line,
            reason: `Line ${def.line} out of range (1-${lines.length + 1})`,
          }),
        );
      }

      const capture = safeCaptureVars(def.capture, def.id);
      blocked.push(...capture.blocked);

      const template = generateTemplate(
        {
          ...def,
          capture: capture.safe,
          port,
          ...(goRefs === undefined ? {} : { goRefs }),
        },
        language,
      );

      goRefs = template.goRefs ?? goRefs;

      lines.splice(def.line - 1, 0, ...template.lines);
      inserted += 1;
    }

    return {
      content: lines.join("\n"),
      inserted,
      blocked,
    };
  });

export type CleanupContentResult = {
  readonly cleaned: string;
  readonly removed: number;
};

export const cleanupContent = (
  content: string,
  ids?: readonly string[],
): CleanupContentResult => {
  const lines = content.split("\n");
  const filteredIds = ids === undefined ? undefined : new Set(ids);
  const out: string[] = [];

  let inside = false;
  let activeId: string | undefined;
  let removed = 0;

  for (const line of lines) {
    if (inside) {
      if (line.includes("LOGPOINT_END")) {
        const endId = parseMarkerId(line);
        if (activeId === undefined || endId === undefined || endId === activeId) {
          inside = false;
          activeId = undefined;
          continue;
        }
      }
      continue;
    }

    if (line.includes("LOGPOINT_START")) {
      const id = parseMarkerId(line);
      if (id === undefined) {
        continue;
      }

      if (filteredIds === undefined || filteredIds.has(id)) {
        inside = true;
        activeId = id;
        removed += 1;
        continue;
      }
    }

    if (filteredIds === undefined && line.includes("LOGPOINT_IMPORT")) {
      continue;
    }

    out.push(line);
  }

  return { cleaned: out.join("\n"), removed };
};

export const countMarkers = (content: string): number =>
  content.split("\n").reduce((count, line) => count + (line.includes("LOGPOINT_START") ? 1 : 0), 0);
