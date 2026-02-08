import { createServer } from "node:net";
import { Effect } from "effect";
import { AppLive, FileSystem, Logger, RuntimeEnv } from "./lib/services.js";

const checkPort = (port: number): Effect.Effect<boolean, never, never> =>
  Effect.async<boolean>((resume) => {
    const server = createServer();

    server.once("error", () => {
      resume(Effect.succeed(false));
    });

    server.listen(port, "127.0.0.1", () => {
      server.close(() => {
        resume(Effect.succeed(true));
      });
    });

    return Effect.sync(() => {
      server.close();
    });
  });

export const runDoctorFromArgs = (): Effect.Effect<void, never, FileSystem | Logger | RuntimeEnv> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const logger = yield* Logger;
    const env = yield* RuntimeEnv;

    const probePath = `${env.tmpDir.replace(/\/$/, "")}/logpoint-doctor-${Date.now()}.tmp`;

    const writable = yield* fs
      .writeFile(probePath, "ok")
      .pipe(
        Effect.flatMap(() => fs.removeFile(probePath)),
        Effect.map(() => true),
        Effect.catchAll(() => Effect.succeed(false)),
      );

    const port9111Free = yield* checkPort(9111);

    yield* logger.info(
      JSON.stringify(
        {
          runtime: "bun",
          bunVersion: Bun.version,
          cwd: env.cwd,
          tmpDir: env.tmpDir,
          tmpWritable: writable,
          port9111Available: port9111Free,
        },
        null,
        2,
      ),
    );
  });

if (import.meta.main) {
  Effect.runPromise(runDoctorFromArgs().pipe(Effect.provide(AppLive))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
