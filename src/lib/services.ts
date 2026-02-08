import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Context, Effect, Layer } from "effect";
import { FileNotFound, FileReadError, FileWriteError } from "./errors.js";

export class FileSystem extends Context.Tag("FileSystem")<
  FileSystem,
  {
    readonly readFile: (path: string) => Effect.Effect<string, FileNotFound | FileReadError, never>;
    readonly writeFile: (path: string, content: string) => Effect.Effect<void, FileWriteError, never>;
    readonly exists: (path: string) => Effect.Effect<boolean, never, never>;
    readonly glob: (pattern: string, cwd: string) => Effect.Effect<readonly string[], FileReadError, never>;
    readonly removeFile: (path: string) => Effect.Effect<void, FileWriteError, never>;
    readonly mkdirp: (path: string) => Effect.Effect<void, FileWriteError, never>;
  }
>() {}

export class Logger extends Context.Tag("Logger")<
  Logger,
  {
    readonly info: (message: string) => Effect.Effect<void, never, never>;
    readonly warn: (message: string) => Effect.Effect<void, never, never>;
    readonly error: (message: string) => Effect.Effect<void, never, never>;
    readonly json: (value: unknown) => Effect.Effect<void, never, never>;
  }
>() {}

export class Clock extends Context.Tag("Clock")<
  Clock,
  {
    readonly now: () => Effect.Effect<Date, never, never>;
  }
>() {}

export class RuntimeEnv extends Context.Tag("RuntimeEnv")<
  RuntimeEnv,
  {
    readonly cwd: string;
    readonly tmpDir: string;
  }
>() {}

export const FileSystemLive = Layer.succeed(FileSystem, {
  readFile: (path: string) =>
    Effect.gen(function* () {
      const exists = yield* Effect.promise(() => Bun.file(path).exists());
      if (!exists) {
        return yield* Effect.fail(new FileNotFound({ path }));
      }
      return yield* Effect.tryPromise({
        try: () => Bun.file(path).text(),
        catch: (cause) => new FileReadError({ path, cause }),
      });
    }),
  writeFile: (path: string, content: string) =>
    Effect.tryPromise({
      try: async () => {
        await Bun.write(path, content);
      },
      catch: (cause) => new FileWriteError({ path, cause }),
    }),
  exists: (path: string) => Effect.promise(() => Bun.file(path).exists()),
  glob: (pattern: string, cwd: string) =>
    Effect.tryPromise({
      try: async () => {
        const matches: string[] = [];
        const glob = new Bun.Glob(pattern);
        for await (const entry of glob.scan({ cwd, onlyFiles: true, dot: false })) {
          matches.push(join(cwd, entry));
        }
        return matches;
      },
      catch: (cause) => new FileReadError({ path: cwd, cause }),
    }),
  removeFile: (path: string) =>
    Effect.tryPromise({
      try: async () => {
        await Bun.file(path).delete();
      },
      catch: (cause) => new FileWriteError({ path, cause }),
    }),
  mkdirp: (path: string) =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(path, { recursive: true });
      },
      catch: (cause) => new FileWriteError({ path, cause }),
    }),
});

export const LoggerLive = Layer.succeed(Logger, {
  info: (message: string) => Effect.sync(() => console.log(message)),
  warn: (message: string) => Effect.sync(() => console.warn(message)),
  error: (message: string) => Effect.sync(() => console.error(message)),
  json: (value: unknown) => Effect.sync(() => console.log(JSON.stringify(value))),
});

export const ClockLive = Layer.succeed(Clock, {
  now: () => Effect.sync(() => new Date()),
});

export const RuntimeEnvLive = Layer.succeed(RuntimeEnv, {
  cwd: process.cwd(),
  tmpDir: process.env["TMPDIR"] ?? "/tmp",
});

export const AppLive = Layer.mergeAll(FileSystemLive, LoggerLive, ClockLive, RuntimeEnvLive);
