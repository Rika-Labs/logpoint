import { Effect } from "effect";
import { ParseResult, Schema, TreeFormatter } from "@effect/schema";
import { ManifestError, ParseError, ValidationError } from "./errors.js";
import { SupportedLanguages, type Language } from "./language.js";

const PositiveInt = Schema.Number.pipe(
  Schema.filter((value): value is number => Number.isInteger(value) && value > 0),
);

const ValidPort = Schema.Number.pipe(
  Schema.filter((value): value is number => Number.isInteger(value) && value >= 1024 && value <= 65535),
);

const NonEmptyString = Schema.String.pipe(Schema.minLength(1));

const NonEmptyStringArray = Schema.Array(Schema.String).pipe(
  Schema.filter((items): items is readonly string[] => items.length > 0),
);

const LogpointId = Schema.String.pipe(Schema.pattern(/^[a-z0-9_-]+$/));

export const LanguageSchema = Schema.Literal(...SupportedLanguages);

export const LogpointDefSchema = Schema.Struct({
  id: LogpointId,
  file: NonEmptyString,
  line: PositiveInt,
  label: Schema.String,
  hypothesis: Schema.String,
  capture: NonEmptyStringArray,
  maxHits: Schema.optional(PositiveInt),
});

export type LogpointDefInput = typeof LogpointDefSchema.Type;

export type LogpointDef = Omit<LogpointDefInput, "maxHits"> & {
  readonly maxHits: number;
};

export const ManifestSchema = Schema.Struct({
  port: Schema.optional(ValidPort),
  projectRoot: Schema.optional(Schema.String),
  language: Schema.optional(LanguageSchema),
  logpoints: Schema.Array(LogpointDefSchema).pipe(
    Schema.filter((items): items is readonly LogpointDefInput[] => items.length > 0),
  ),
});

export type ManifestInput = typeof ManifestSchema.Type;

export type Manifest = {
  readonly port: number;
  readonly projectRoot: string;
  readonly language?: Language;
  readonly logpoints: readonly LogpointDef[];
};

export const SnapshotSchema = Schema.Struct({
  id: Schema.String,
  file: Schema.String,
  line: Schema.Number,
  label: Schema.String,
  hypothesis: Schema.String,
  timestamp: Schema.String,
  vars: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
  hit: Schema.optional(Schema.Number),
  maxHits: Schema.optional(PositiveInt),
});

export type Snapshot = typeof SnapshotSchema.Type;

export const CollectorConfigSchema = Schema.Struct({
  port: Schema.optional(ValidPort),
  output: Schema.optional(Schema.String),
  timeout: Schema.optional(PositiveInt),
  corsOrigin: Schema.optional(Schema.String),
});

export type CollectorConfigInput = typeof CollectorConfigSchema.Type;

export type CollectorConfig = {
  readonly port: number;
  readonly output: string;
  readonly timeout: number;
  readonly corsOrigin: string;
};

export const InjectConfigSchema = Schema.Struct({
  manifest: NonEmptyString,
  projectRoot: Schema.optional(Schema.String),
  language: Schema.optional(LanguageSchema),
  dryRun: Schema.optional(Schema.Boolean),
});

export type InjectConfigInput = typeof InjectConfigSchema.Type;

export type InjectConfig = {
  readonly manifest: string;
  readonly projectRoot?: string;
  readonly language?: Language;
  readonly dryRun: boolean;
};

export const CleanupConfigSchema = Schema.Struct({
  dir: Schema.optional(Schema.String),
  ids: Schema.optional(Schema.Array(LogpointId)),
  dryRun: Schema.optional(Schema.Boolean),
  verify: Schema.optional(Schema.Boolean),
});

export type CleanupConfigInput = typeof CleanupConfigSchema.Type;

export type CleanupConfig = {
  readonly dir: string;
  readonly ids?: readonly string[];
  readonly dryRun: boolean;
  readonly verify: boolean;
};

export const AnalyzeFormatSchema = Schema.Literal("markdown", "json");

export type AnalyzeFormat = typeof AnalyzeFormatSchema.Type;

export const AnalyzeConfigSchema = Schema.Struct({
  input: Schema.optional(Schema.String),
  format: Schema.optional(AnalyzeFormatSchema),
});

export type AnalyzeConfigInput = typeof AnalyzeConfigSchema.Type;

export type AnalyzeConfig = {
  readonly input: string;
  readonly format: AnalyzeFormat;
};

export const formatParseError = (error: ParseResult.ParseError): string => {
  try {
    return TreeFormatter.formatErrorSync(error);
  } catch {
    return error.message;
  }
};

const decode = <T>(
  result: ReturnType<ReturnType<typeof Schema.decodeUnknownEither<T, unknown>>>,
  toError: (message: string, cause: ParseResult.ParseError) => ManifestError | ValidationError,
): Effect.Effect<T, ManifestError | ValidationError, never> => {
  if (result._tag === "Left") {
    return Effect.fail(toError(formatParseError(result.left), result.left));
  }
  return Effect.succeed(result.right);
};

export const parseJsonString = (input: string): Effect.Effect<unknown, ParseError, never> =>
  Effect.try({
    try: () => JSON.parse(input) as unknown,
    catch: (cause) => new ParseError({ input, cause }),
  });

const withLogpointDefaults = (input: LogpointDefInput): LogpointDef => ({
  ...input,
  maxHits: input.maxHits ?? 100,
});

export const withManifestDefaults = (input: ManifestInput): Manifest => ({
  port: input.port ?? 9111,
  projectRoot: input.projectRoot ?? ".",
  ...(input.language === undefined ? {} : { language: input.language }),
  logpoints: input.logpoints.map(withLogpointDefaults),
});

export const withCollectorDefaults = (input: CollectorConfigInput): CollectorConfig => ({
  port: input.port ?? 9111,
  output: input.output ?? "/tmp/debug-logpoints.jsonl",
  timeout: input.timeout ?? 300,
  corsOrigin: input.corsOrigin ?? "*",
});

export const withInjectDefaults = (input: InjectConfigInput): InjectConfig => ({
  manifest: input.manifest,
  ...(input.projectRoot === undefined ? {} : { projectRoot: input.projectRoot }),
  ...(input.language === undefined ? {} : { language: input.language }),
  dryRun: input.dryRun ?? false,
});

export const withCleanupDefaults = (input: CleanupConfigInput): CleanupConfig => ({
  dir: input.dir ?? ".",
  ...(input.ids === undefined ? {} : { ids: input.ids }),
  dryRun: input.dryRun ?? false,
  verify: input.verify ?? true,
});

export const withAnalyzeDefaults = (input: AnalyzeConfigInput): AnalyzeConfig => ({
  input: input.input ?? "/tmp/debug-logpoints.jsonl",
  format: input.format ?? "markdown",
});

export const decodeManifestUnknown = (input: unknown): Effect.Effect<Manifest, ManifestError, never> => {
  const parsed = Schema.decodeUnknownEither(ManifestSchema)(input);
  return decode(parsed, (message, cause) => new ManifestError({ message, cause })).pipe(
    Effect.map((value) => withManifestDefaults(value as ManifestInput)),
    Effect.mapError((error) => (error._tag === "ManifestError" ? error : new ManifestError({ message: error.message, cause: error }))),
  );
};

export const decodeSnapshotUnknown = (input: unknown): Effect.Effect<Snapshot, ValidationError, never> => {
  const parsed = Schema.decodeUnknownEither(SnapshotSchema)(input);
  return decode(parsed, (message) => new ValidationError({ message })).pipe(
    Effect.mapError((error) =>
      error._tag === "ValidationError" ? error : new ValidationError({ message: error.message }),
    ),
  );
};

export const decodeCollectorConfigUnknown = (
  input: unknown,
): Effect.Effect<CollectorConfig, ManifestError, never> => {
  const parsed = Schema.decodeUnknownEither(CollectorConfigSchema)(input);
  return decode(parsed, (message, cause) => new ManifestError({ message, cause })).pipe(
    Effect.map((value) => withCollectorDefaults(value as CollectorConfigInput)),
    Effect.mapError((error) => (error._tag === "ManifestError" ? error : new ManifestError({ message: error.message, cause: error }))),
  );
};

export const decodeInjectConfigUnknown = (input: unknown): Effect.Effect<InjectConfig, ManifestError, never> => {
  const parsed = Schema.decodeUnknownEither(InjectConfigSchema)(input);
  return decode(parsed, (message, cause) => new ManifestError({ message, cause })).pipe(
    Effect.map((value) => withInjectDefaults(value as InjectConfigInput)),
    Effect.mapError((error) => (error._tag === "ManifestError" ? error : new ManifestError({ message: error.message, cause: error }))),
  );
};

export const decodeCleanupConfigUnknown = (
  input: unknown,
): Effect.Effect<CleanupConfig, ManifestError, never> => {
  const parsed = Schema.decodeUnknownEither(CleanupConfigSchema)(input);
  return decode(parsed, (message, cause) => new ManifestError({ message, cause })).pipe(
    Effect.map((value) => withCleanupDefaults(value as CleanupConfigInput)),
    Effect.mapError((error) => (error._tag === "ManifestError" ? error : new ManifestError({ message: error.message, cause: error }))),
  );
};

export const decodeAnalyzeConfigUnknown = (input: unknown): Effect.Effect<AnalyzeConfig, ManifestError, never> => {
  const parsed = Schema.decodeUnknownEither(AnalyzeConfigSchema)(input);
  return decode(parsed, (message, cause) => new ManifestError({ message, cause })).pipe(
    Effect.map((value) => withAnalyzeDefaults(value as AnalyzeConfigInput)),
    Effect.mapError((error) => (error._tag === "ManifestError" ? error : new ManifestError({ message: error.message, cause: error }))),
  );
};
