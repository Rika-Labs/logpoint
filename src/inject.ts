import { resolve } from "node:path";
import { Effect } from "effect";
import {
  optionalBooleanOption,
  optionalStringOption,
  parseArgs,
  requireStringOption,
} from "./lib/cli-args.js";
import {
  InjectionError,
  ManifestError,
  ValidationError,
  type FileNotFound,
  type FileReadError,
  type FileWriteError,
  type ParseError,
} from "./lib/errors.js";
import { injectContent } from "./lib/injection-engine.js";
import { isLanguage } from "./lib/language.js";
import {
  decodeInjectConfigUnknown,
  decodeManifestUnknown,
  parseJsonString,
  type InjectConfig,
  type LogpointDef,
  type Manifest,
} from "./lib/schema.js";
import { AppLive, FileSystem, Logger } from "./lib/services.js";

const parseInjectConfig = (argv: readonly string[]): Effect.Effect<InjectConfig, ManifestError | ValidationError, never> =>
  Effect.gen(function* () {
    const parsed = parseArgs(argv);
    const manifestFromArg = parsed.positionals[0];
    const manifestFromOption = yield* optionalStringOption(parsed, "manifest");
    const manifest = manifestFromOption ?? manifestFromArg;

    if (manifest === undefined) {
      return yield* requireStringOption(parsed, "manifest").pipe(
        Effect.mapError((error) => new ManifestError({ message: error.message, cause: error })),
        Effect.as(undefined as never),
      );
    }

    const projectRoot = yield* optionalStringOption(parsed, "project-root");
    const dryRun = yield* optionalBooleanOption(parsed, "dry-run");
    const languageRaw = yield* optionalStringOption(parsed, "language");

    if (languageRaw !== undefined && !isLanguage(languageRaw)) {
      return yield* Effect.fail(
        new ValidationError({
          message: `Unsupported language: ${languageRaw}`,
        }),
      );
    }

    return yield* decodeInjectConfigUnknown({
      manifest,
      projectRoot,
      dryRun,
      language: languageRaw,
    });
  });

const groupByFile = (
  manifest: Manifest,
  root: string,
): ReadonlyMap<string, readonly LogpointDef[]> => {
  const grouped = new Map<string, LogpointDef[]>();
  for (const logpoint of manifest.logpoints) {
    const absolutePath = resolve(root, logpoint.file);
    const current = grouped.get(absolutePath) ?? [];
    current.push(logpoint);
    grouped.set(absolutePath, current);
  }

  return grouped;
};

export type InjectRunError =
  | ManifestError
  | ValidationError
  | InjectionError
  | FileNotFound
  | FileReadError
  | FileWriteError
  | ParseError;

export const runInject = (
  config: InjectConfig,
): Effect.Effect<void, InjectRunError, FileSystem | Logger> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const logger = yield* Logger;

    const manifestContent = yield* fs.readFile(config.manifest);
    const manifestJson = yield* parseJsonString(manifestContent);
    const manifest = yield* decodeManifestUnknown(manifestJson);

    const root = resolve(config.projectRoot ?? manifest.projectRoot);
    const grouped = groupByFile(manifest, root);

    const entries = [...grouped.entries()];

    const results = yield* Effect.forEach(
      entries,
      ([filePath, defs]) =>
        Effect.gen(function* () {
          const original = yield* fs.readFile(filePath);

          const injected = yield* injectContent(
            original,
            defs,
            filePath,
            manifest.port,
            config.language ?? manifest.language,
          );

          for (const blocked of injected.blocked) {
            yield* logger.warn(blocked.message);
          }

          if (!config.dryRun && injected.inserted > 0 && original !== injected.content) {
            yield* fs.writeFile(filePath, injected.content);
          }

          return {
            filePath,
            inserted: injected.inserted,
            blocked: injected.blocked.length,
            dryRun: config.dryRun,
          };
        }),
      { concurrency: 8 },
    );

    const summary = {
      files: results.length,
      inserted: results.reduce((total, item) => total + item.inserted, 0),
      blocked: results.reduce((total, item) => total + item.blocked, 0),
      dryRun: config.dryRun,
      manifest: config.manifest,
    };

    yield* logger.json(summary);

    if (config.dryRun) {
      for (const item of results) {
        if (item.inserted > 0) {
          yield* logger.info(`dry-run would inject ${item.inserted} logpoints in ${item.filePath}`);
        }
      }
    }
  });

export const runInjectFromArgs = (
  argv: readonly string[],
): Effect.Effect<void, InjectRunError, FileSystem | Logger> =>
  parseInjectConfig(argv).pipe(Effect.flatMap((config) => runInject(config)));

const execute = (argv: readonly string[]): Promise<void> =>
  Effect.runPromise(runInjectFromArgs(argv).pipe(Effect.provide(AppLive)));

if (import.meta.main) {
  execute(Bun.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
