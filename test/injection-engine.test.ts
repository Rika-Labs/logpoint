import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import { injectContent, cleanupContent, countMarkers } from "../src/lib/injection-engine.js";
import type { LogpointDef } from "../src/lib/schema.js";

const def = (overrides: Partial<LogpointDef> & Pick<LogpointDef, "id" | "file" | "line">): LogpointDef => ({
  id: overrides.id,
  file: overrides.file,
  line: overrides.line,
  label: overrides.label ?? `label-${overrides.id}`,
  hypothesis: overrides.hypothesis ?? `hypothesis-${overrides.id}`,
  capture: overrides.capture ?? ["value"],
  maxHits: overrides.maxHits ?? 100,
});

describe("injectContent", () => {
  test("injects multiple logpoints and blocks secret captures", async () => {
    const content = ["const a = 1;", "const b = 2;", "const c = 3;"].join("\n");

    const result = await Effect.runPromise(
      injectContent(
        content,
        [
          def({ id: "hp1", file: "src/a.ts", line: 2, capture: ["a", "password"] }),
          def({ id: "hp2", file: "src/a.ts", line: 3, capture: ["b"] }),
        ],
        "src/a.ts",
        9111,
        "javascript",
      ),
    );

    expect(result.inserted).toBe(2);
    expect(result.blocked.length).toBe(1);
    expect(result.blocked[0]?.variable).toBe("password");
    expect(result.content.includes("LOGPOINT_START [hp1]")).toBe(true);
    expect(result.content.includes("LOGPOINT_START [hp2]")).toBe(true);
    expect(result.content.includes('"a":__lpVal')).toBe(true);
    expect(result.content.includes('"password":__lpVal')).toBe(false);
  });

  test("skips injection when a logpoint id already exists", async () => {
    const content = [
      "const a = 1;",
      "// LOGPOINT_START [hp1] - existing",
      "console.log(a);",
      "// LOGPOINT_END [hp1]",
      "const b = 2;",
    ].join("\n");

    const result = await Effect.runPromise(
      injectContent(content, [def({ id: "hp1", file: "src/a.ts", line: 2 })], "src/a.ts", 9111, "typescript"),
    );

    expect(result.inserted).toBe(0);
    expect(countMarkers(result.content)).toBe(1);
  });

  test("fails with InjectionError when line is out of range", async () => {
    const result = await Effect.runPromise(
      injectContent(
        "const a = 1;",
        [def({ id: "hp9", file: "src/a.ts", line: 99 })],
        "src/a.ts",
        9111,
        "javascript",
      ).pipe(Effect.either),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("InjectionError");
      expect(result.left.message).toContain("Line 99 out of range");
    }
  });

  test("adds missing go imports when none are present", async () => {
    const goContent = [
      "package main",
      "",
      "func main() {",
      "  total := 10",
      "  _ = total",
      "}",
    ].join("\n");

    const result = await Effect.runPromise(
      injectContent(
        goContent,
        [def({ id: "go1", file: "main.go", line: 4, capture: ["total"] })],
        "main.go",
        9111,
        "go",
      ),
    );

    expect(result.inserted).toBe(1);
    expect(result.content.includes("import (")).toBe(true);
    expect(result.content.includes('__lp_bytes "bytes" // LOGPOINT_IMPORT')).toBe(true);
    expect(result.content.includes('__lp_json "encoding/json" // LOGPOINT_IMPORT')).toBe(true);
    expect(result.content.includes('__lp_http "net/http" // LOGPOINT_IMPORT')).toBe(true);
    expect(result.content.includes('__lp_time "time" // LOGPOINT_IMPORT')).toBe(true);
    expect(result.content.includes("__lp_json.Marshal")).toBe(true);
    expect(result.content.includes("__lp_http.Post")).toBe(true);
    expect(result.content.includes("__lp_bytes.NewBuffer")).toBe(true);
    expect(result.content.includes("__lp_time.Now().Format(__lp_time.RFC3339Nano)")).toBe(true);
  });

  test("rewrites single go imports into an import block", async () => {
    const goContent = [
      "package main",
      "import \"fmt\"",
      "",
      "func main() {",
      "  fmt.Println(\"x\")",
      "}",
    ].join("\n");

    const result = await Effect.runPromise(
      injectContent(
        goContent,
        [def({ id: "go2", file: "main.go", line: 5, capture: ["fmt"] })],
        "main.go",
        9111,
        "go",
      ),
    );

    expect(result.content.includes("import (")).toBe(true);
    expect(result.content.includes('\t"fmt"')).toBe(true);
    expect(result.content.includes("LOGPOINT_IMPORT")).toBe(true);
  });

  test("reuses existing go aliases and backfills unsupported dot-import parsing", async () => {
    const goContent = [
      "package main",
      "import (",
      '\t. \"bytes\"',
      '\t_ \"encoding/json\"',
      '\tnethttp \"net/http\"',
      '\t\"time\"',
      ")",
      "func main() {",
      "  x := 1",
      "  _ = x",
      "}",
    ].join("\n");

    const result = await Effect.runPromise(
      injectContent(
        goContent,
        [def({ id: "go3", file: "main.go", line: 9, capture: ["x"] })],
        "main.go",
        9111,
        "go",
      ),
    );

    expect(result.content.includes("LOGPOINT_IMPORT")).toBe(true);
    expect(result.content.includes("json.Marshal")).toBe(true);
    expect(result.content.includes("nethttp.Post")).toBe(true);
    expect(result.content.includes("__lp_bytes.NewBuffer")).toBe(true);
    expect(result.content.includes("time.Now().Format(time.RFC3339Nano)")).toBe(true);
  });
});

describe("cleanupContent", () => {
  test("removes marker spans even with mismatched closing marker first", () => {
    const content = [
      "start",
      "// LOGPOINT_START [hp1] - one",
      "inside-1",
      "// LOGPOINT_END [hp2]",
      "inside-2",
      "// LOGPOINT_END [hp1]",
      "end",
    ].join("\n");

    const result = cleanupContent(content);
    expect(result.removed).toBe(1);
    expect(result.cleaned).toBe(["start", "end"].join("\n"));
  });

  test("handles malformed start markers and preserves import markers in filtered cleanup", () => {
    const content = [
      "keep-1",
      "// LOGPOINT_START []",
      "middle",
      "\t__lp_bytes \"bytes\" // LOGPOINT_IMPORT",
      "keep-2",
    ].join("\n");

    const all = cleanupContent(content);
    expect(all.removed).toBe(0);
    expect(all.cleaned.includes("LOGPOINT_IMPORT")).toBe(false);

    const filtered = cleanupContent(content, ["hp1"]);
    expect(filtered.cleaned.includes("LOGPOINT_IMPORT")).toBe(true);
    expect(filtered.cleaned.includes("middle")).toBe(true);
  });

  test("counts start markers", () => {
    const content = [
      "// LOGPOINT_START [hp1]",
      "// LOGPOINT_END [hp1]",
      "// LOGPOINT_START [hp2]",
      "// LOGPOINT_END [hp2]",
    ].join("\n");

    expect(countMarkers(content)).toBe(2);
  });
});
