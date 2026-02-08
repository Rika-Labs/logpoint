import { Effect } from "effect";
import { optionalStringOption, parseArgs } from "./lib/cli-args.js";
import {
  ManifestError,
  ValidationError,
  type FileNotFound,
  type FileReadError,
  type ParseError,
} from "./lib/errors.js";
import { decodeManifestUnknown, parseJsonString } from "./lib/schema.js";
import { AppLive, FileSystem, Logger } from "./lib/services.js";

const parseManifestPath = (argv: readonly string[]): Effect.Effect<string, ValidationError, never> =>
  Effect.gen(function* () {
    const parsed = parseArgs(argv);
    const manifest = (yield* optionalStringOption(parsed, "manifest")) ?? parsed.positionals[0];
    if (manifest === undefined || manifest.length === 0) {
      return yield* Effect.fail(new ValidationError({ message: "Manifest path is required" }));
    }
    return manifest;
  });

export type ValidateRunError =
  | ValidationError
  | ManifestError
  | FileNotFound
  | FileReadError
  | ParseError;

export const runValidateFromArgs = (
  argv: readonly string[],
): Effect.Effect<void, ValidateRunError, FileSystem | Logger> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const logger = yield* Logger;

    const manifestPath = yield* parseManifestPath(argv);
    const content = yield* fs.readFile(manifestPath);
    const raw = yield* parseJsonString(content);
    const manifest = yield* decodeManifestUnknown(raw);

    yield* logger.info(JSON.stringify(manifest, null, 2));
  });

const execute = (argv: readonly string[]): Promise<void> =>
  Effect.runPromise(runValidateFromArgs(argv).pipe(Effect.provide(AppLive)));

if (import.meta.main) {
  execute(Bun.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
