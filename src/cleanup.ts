import { Effect } from "effect";
import {
  optionalBooleanOption,
  optionalCsvOption,
  optionalStringOption,
  parseArgs,
} from "./lib/cli-args.js";
import {
  CleanupError,
  ManifestError,
  ValidationError,
  type FileNotFound,
  type FileReadError,
  type FileWriteError,
} from "./lib/errors.js";
import { cleanupContent, countMarkers } from "./lib/injection-engine.js";
import { decodeCleanupConfigUnknown, type CleanupConfig } from "./lib/schema.js";
import { AppLive, FileSystem, Logger } from "./lib/services.js";

const sourcePattern = "**/*.{js,jsx,ts,tsx,mjs,cjs,py,go,rb,sh,bash,zsh,ksh,java,cs,php,rs,kt,kts}";

const ignoredSegments = new Set(["node_modules", ".git", "dist", "coverage", ".next", "target"]);

const shouldSkipPath = (path: string): boolean => {
  const parts = path.split("/");
  return parts.some((part) => ignoredSegments.has(part));
};

const parseCleanupConfig = (argv: readonly string[]): Effect.Effect<CleanupConfig, ManifestError | ValidationError, never> =>
  Effect.gen(function* () {
    const parsed = parseArgs(argv);
    const positionalDir = parsed.positionals[0];
    const dir = (yield* optionalStringOption(parsed, "dir")) ?? positionalDir;
    const ids = yield* optionalCsvOption(parsed, "ids");
    const dryRun = yield* optionalBooleanOption(parsed, "dry-run");
    const verify = yield* optionalBooleanOption(parsed, "verify");

    return yield* decodeCleanupConfigUnknown({
      dir,
      ids,
      dryRun,
      verify,
    });
  });

const hasTargetMarkers = (content: string, ids?: readonly string[]): boolean => {
  if (ids === undefined) {
    return countMarkers(content) > 0;
  }

  for (const id of ids) {
    if (content.includes(`LOGPOINT_START [${id}]`)) {
      return true;
    }
  }

  return false;
};

export type CleanupRunError =
  | ManifestError
  | ValidationError
  | CleanupError
  | FileNotFound
  | FileReadError
  | FileWriteError;

export const runCleanup = (
  config: CleanupConfig,
): Effect.Effect<void, CleanupRunError, FileSystem | Logger> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const logger = yield* Logger;

    const allFiles = yield* fs.glob(sourcePattern, config.dir);
    const files = allFiles.filter((path) => !shouldSkipPath(path));

    const cleaned = yield* Effect.forEach(
      files,
      (filePath) =>
        Effect.gen(function* () {
          const content = yield* fs.readFile(filePath);
          if (!content.includes("LOGPOINT_START")) {
            return { filePath, removed: 0 };
          }

          const result = cleanupContent(content, config.ids);

          if (!config.dryRun && result.removed > 0) {
            yield* fs.writeFile(filePath, result.cleaned);
          }

          return { filePath, removed: result.removed };
        }),
      { concurrency: 16 },
    );

    const touched = cleaned.filter((item) => item.removed > 0);
    const totalRemoved = touched.reduce((total, item) => total + item.removed, 0);

    if (config.verify && !config.dryRun) {
      const verification = yield* Effect.forEach(
        touched,
        (entry) =>
          Effect.gen(function* () {
            const content = yield* fs.readFile(entry.filePath);
            return { filePath: entry.filePath, hasMarkers: hasTargetMarkers(content, config.ids) };
          }),
      );

      const failed = verification.find((entry) => entry.hasMarkers);
      if (failed !== undefined) {
        return yield* Effect.fail(
          new CleanupError({
            file: failed.filePath,
            reason: "Verification failed: marker still present",
          }),
        );
      }
    }

    yield* logger.json({
      filesScanned: files.length,
      filesTouched: touched.length,
      removed: totalRemoved,
      dryRun: config.dryRun,
      ids: config.ids,
    });

    for (const item of touched) {
      if (config.dryRun) {
        yield* logger.info(`dry-run would remove ${item.removed} logpoints from ${item.filePath}`);
      }
    }
  });

export const runCleanupFromArgs = (
  argv: readonly string[],
): Effect.Effect<void, CleanupRunError, FileSystem | Logger> =>
  parseCleanupConfig(argv).pipe(Effect.flatMap((config) => runCleanup(config)));

const execute = (argv: readonly string[]): Promise<void> =>
  Effect.runPromise(runCleanupFromArgs(argv).pipe(Effect.provide(AppLive)));

if (import.meta.main) {
  execute(Bun.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
