import { Data } from "effect";

export class FileNotFound extends Data.TaggedError("FileNotFound")<{
  readonly path: string;
}> {
  override get message(): string {
    return `File not found: ${this.path}`;
  }
}

export class FileReadError extends Data.TaggedError("FileReadError")<{
  readonly path: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to read file ${this.path}: ${String(this.cause)}`;
  }
}

export class FileWriteError extends Data.TaggedError("FileWriteError")<{
  readonly path: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to write file ${this.path}: ${String(this.cause)}`;
  }
}

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly input: string;
  readonly cause: unknown;
}> {
  override get message(): string {
    return `Failed to parse input: ${this.input} (${String(this.cause)})`;
  }
}

export class ManifestError extends Data.TaggedError("ManifestError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string;
}> {}

export class PortInUse extends Data.TaggedError("PortInUse")<{
  readonly port: number;
}> {
  override get message(): string {
    return `Port is in use: ${this.port}`;
  }
}

export class InjectionError extends Data.TaggedError("InjectionError")<{
  readonly logpointId: string;
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}> {
  override get message(): string {
    return `Injection failed for ${this.logpointId} at ${this.file}:${this.line} - ${this.reason}`;
  }
}

export class CleanupError extends Data.TaggedError("CleanupError")<{
  readonly file: string;
  readonly reason: string;
}> {
  override get message(): string {
    return `Cleanup failed for ${this.file}: ${this.reason}`;
  }
}

export class SecretVarBlocked extends Data.TaggedError("SecretVarBlocked")<{
  readonly logpointId: string;
  readonly variable: string;
}> {
  override get message(): string {
    return `Blocked secret variable ${this.variable} in ${this.logpointId}`;
  }
}

export class CollectorTimeout extends Data.TaggedError("CollectorTimeout")<{
  readonly seconds: number;
}> {
  override get message(): string {
    return `Collector timeout reached after ${this.seconds} seconds`;
  }
}

export class CliUsageError extends Data.TaggedError("CliUsageError")<{
  readonly message: string;
}> {}

export type LogpointError =
  | FileNotFound
  | FileReadError
  | FileWriteError
  | ParseError
  | ManifestError
  | ValidationError
  | PortInUse
  | InjectionError
  | CleanupError
  | SecretVarBlocked
  | CollectorTimeout
  | CliUsageError;
