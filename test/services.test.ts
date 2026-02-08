import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "bun:test";
import { Effect } from "effect";
import {
  AppLive,
  Clock,
  ClockLive,
  FileSystem,
  FileSystemLive,
  Logger,
  LoggerLive,
  RuntimeEnv,
  RuntimeEnvLive,
} from "../src/lib/services.js";

describe("services", () => {
  test("filesystem live supports read write exists glob remove mkdirp", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logpoint-fs-"));
    const nestedDir = join(dir, "nested", "more");
    const filePath = join(nestedDir, "sample.txt");

    const data = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        yield* fs.mkdirp(nestedDir);
        yield* fs.writeFile(filePath, "hello");
        const existsBefore = yield* fs.exists(filePath);
        const content = yield* fs.readFile(filePath);
        const matches = yield* fs.glob("**/*.txt", dir);
        yield* fs.removeFile(filePath);
        const existsAfter = yield* fs.exists(filePath);

        return { existsBefore, content, matches, existsAfter };
      }).pipe(Effect.provide(FileSystemLive)),
    );

    expect(data.existsBefore).toBe(true);
    expect(data.content).toBe("hello");
    expect(data.matches.some((entry) => entry.endsWith("sample.txt"))).toBe(true);
    expect(data.existsAfter).toBe(false);
  });

  test("filesystem live returns FileNotFound for missing files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logpoint-fs-"));
    const missing = join(dir, "missing.txt");

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        return yield* fs.readFile(missing);
      })
        .pipe(Effect.provide(FileSystemLive), Effect.either),
    );

    expect(result._tag).toBe("Left");
    if (result._tag === "Left") {
      expect(result.left._tag).toBe("FileNotFound");
    }
  });

  test("logger and clock layers emit and return values", async () => {
    const info: string[] = [];
    const warn: string[] = [];
    const error: string[] = [];
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    console.log = (message: unknown) => {
      info.push(String(message));
    };
    console.warn = (message: unknown) => {
      warn.push(String(message));
    };
    console.error = (message: unknown) => {
      error.push(String(message));
    };

    try {
      const now = await Effect.runPromise(
        Effect.gen(function* () {
          const logger = yield* Logger;
          const clock = yield* Clock;
          yield* logger.info("info-msg");
          yield* logger.warn("warn-msg");
          yield* logger.error("error-msg");
          yield* logger.json({ ok: true });
          return yield* clock.now();
        }).pipe(Effect.provide(LoggerLive), Effect.provide(ClockLive)),
      );

      expect(now instanceof Date).toBe(true);
      expect(info.some((line) => line.includes("info-msg"))).toBe(true);
      expect(info.some((line) => line.includes('"ok":true'))).toBe(true);
      expect(warn).toEqual(["warn-msg"]);
      expect(error).toEqual(["error-msg"]);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    }
  });

  test("runtime and app layers provide environment", async () => {
    const runtime = await Effect.runPromise(
      Effect.gen(function* () {
        const env = yield* RuntimeEnv;
        return env;
      }).pipe(Effect.provide(RuntimeEnvLive)),
    );

    expect(runtime.cwd.length).toBeGreaterThan(0);
    expect(runtime.tmpDir.length).toBeGreaterThan(0);

    const appAccess = await Effect.runPromise(
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        const logger = yield* Logger;
        const env = yield* RuntimeEnv;
        const clock = yield* Clock;

        const checkPath = join(env.tmpDir, `logpoint-app-${Date.now()}.txt`);
        yield* fs.writeFile(checkPath, "ok");
        const content = yield* fs.readFile(checkPath);
        yield* fs.removeFile(checkPath);
        yield* logger.info("app-live");
        const now = yield* clock.now();

        return { content, now };
      }).pipe(Effect.provide(AppLive)),
    );

    expect(appAccess.content).toBe("ok");
    expect(appAccess.now instanceof Date).toBe(true);
  });
});
