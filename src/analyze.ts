import { Chunk, Effect, Stream } from "effect";
import {
  optionalStringOption,
  parseArgs,
} from "./lib/cli-args.js";
import {
  ManifestError,
  ValidationError,
  type FileReadError,
  type ParseError,
} from "./lib/errors.js";
import { readJsonLines } from "./lib/jsonl.js";
import { detectAnomalies, groupSnapshots, renderJson, renderMarkdown } from "./lib/render.js";
import { decodeAnalyzeConfigUnknown, decodeSnapshotUnknown, type AnalyzeConfig } from "./lib/schema.js";
import { AppLive, Logger } from "./lib/services.js";

const parseAnalyzeConfig = (argv: readonly string[]): Effect.Effect<AnalyzeConfig, ManifestError | ValidationError, never> =>
  Effect.gen(function* () {
    const parsed = parseArgs(argv);
    const positionalInput = parsed.positionals[0];
    const input = (yield* optionalStringOption(parsed, "input")) ?? positionalInput;
    const format = yield* optionalStringOption(parsed, "format");

    if (format !== undefined && format !== "markdown" && format !== "json") {
      return yield* Effect.fail(new ValidationError({ message: `Unsupported format: ${format}` }));
    }

    return yield* decodeAnalyzeConfigUnknown({
      input,
      format,
    });
  });

export type AnalyzeRunError = ManifestError | ValidationError | FileReadError | ParseError;

export const runAnalyze = (
  config: AnalyzeConfig,
): Effect.Effect<void, AnalyzeRunError | ValidationError, Logger> =>
  Effect.gen(function* () {
    const logger = yield* Logger;
    const lines = yield* readJsonLines(config.input);

    const snapshots = yield* Stream.fromIterable(lines).pipe(
      Stream.mapEffect((line) => decodeSnapshotUnknown(line)),
      Stream.runCollect,
      Effect.map((chunk) => Chunk.toReadonlyArray(chunk)),
    );

    const grouped = groupSnapshots(snapshots);
    const anomalies = detectAnomalies(grouped);

    const output = config.format === "json" ? renderJson(grouped, anomalies) : renderMarkdown(grouped, anomalies);
    yield* logger.info(output);
  });

export const runAnalyzeFromArgs = (
  argv: readonly string[],
): Effect.Effect<void, AnalyzeRunError | ValidationError, Logger> =>
  parseAnalyzeConfig(argv).pipe(Effect.flatMap((config) => runAnalyze(config)));

const execute = (argv: readonly string[]): Promise<void> =>
  Effect.runPromise(runAnalyzeFromArgs(argv).pipe(Effect.provide(AppLive)));

if (import.meta.main) {
  execute(Bun.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
