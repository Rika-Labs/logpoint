import { appendFile } from "node:fs/promises";
import { Duration, Effect } from "effect";
import { optionalNumberOption, optionalStringOption, parseArgs } from "./lib/cli-args.js";
import { CollectorTimeout, ManifestError, PortInUse, ValidationError } from "./lib/errors.js";
import { decodeCollectorConfigUnknown, decodeSnapshotUnknown, type CollectorConfig } from "./lib/schema.js";
import { AppLive, FileSystem, Logger } from "./lib/services.js";

const defaultPortFile = "/tmp/debug-logpoints.port";
const defaultPidFile = "/tmp/debug-logpoints.pid";

const isPortInUseError = (cause: unknown): boolean => {
  const message = String(cause).toLowerCase();
  return message.includes("address already in use") || message.includes("eaddrinuse");
};

const corsHeaders = (origin: string): Record<string, string> => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json",
});

const parseCollectorConfig = (argv: readonly string[]) =>
  Effect.gen(function* () {
    const parsed = parseArgs(argv);
    const port = yield* optionalNumberOption(parsed, "port");
    const timeout = yield* optionalNumberOption(parsed, "timeout");
    const output = yield* optionalStringOption(parsed, "output");
    const corsOrigin = yield* optionalStringOption(parsed, "cors-origin");

    return yield* decodeCollectorConfigUnknown({
      port,
      timeout,
      output,
      corsOrigin,
    });
  });

const startServer = (
  port: number,
  config: CollectorConfig,
  hits: Map<string, number>,
): Effect.Effect<Bun.Server<unknown>, PortInUse | ManifestError, never> =>
  Effect.try({
    try: () =>
      Bun.serve({
        port,
        fetch: async (request: Request): Promise<Response> => {
          if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders(config.corsOrigin) });
          }

          if (request.method !== "POST") {
            return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
              status: 405,
              headers: corsHeaders(config.corsOrigin),
            });
          }

          let body: unknown;
          try {
            body = (await request.json()) as unknown;
          } catch {
            return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
              status: 400,
              headers: corsHeaders(config.corsOrigin),
            });
          }

          const decoded = await Effect.runPromise(decodeSnapshotUnknown(body).pipe(Effect.either));
          if (decoded._tag === "Left") {
            return new Response(JSON.stringify({ ok: false, error: decoded.left.message }), {
              status: 400,
              headers: corsHeaders(config.corsOrigin),
            });
          }

          const snapshot = decoded.right;
          const count = (hits.get(snapshot.id) ?? 0) + 1;
          hits.set(snapshot.id, count);

          const maxHits = snapshot.maxHits;
          if (maxHits !== undefined && count > maxHits) {
            return new Response(JSON.stringify({ ok: true, skipped: true }), {
              status: 202,
              headers: corsHeaders(config.corsOrigin),
            });
          }

          const enriched = {
            ...snapshot,
            hit: snapshot.hit ?? count,
            _receivedAt: new Date().toISOString(),
          };

          try {
            const line = JSON.stringify(enriched);
            await appendFile(config.output, `${line}\n`, "utf8");
            console.log(line);
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: corsHeaders(config.corsOrigin),
            });
          } catch (cause) {
            return new Response(JSON.stringify({ ok: false, error: String(cause) }), {
              status: 500,
              headers: corsHeaders(config.corsOrigin),
            });
          }
        },
      }),
    catch: (cause) => {
      if (isPortInUseError(cause)) {
        return new PortInUse({ port });
      }
      return new ManifestError({
        message: `Failed to start collector on port ${port}`,
        cause,
      });
    },
  });

export const runCollector = (
  config: CollectorConfig,
): Effect.Effect<void, ManifestError | PortInUse | CollectorTimeout | ValidationError, FileSystem | Logger> =>
  Effect.gen(function* () {
    const logger = yield* Logger;
    const fs = yield* FileSystem;
    const hits = new Map<string, number>();

    let server: Bun.Server<unknown> | undefined;
    let boundPort = config.port;

    for (let attempt = 0; attempt <= 10; attempt += 1) {
      const port = config.port + attempt;
      const started = yield* startServer(port, config, hits).pipe(Effect.either);
      if (started._tag === "Right") {
        server = started.right;
        boundPort = port;
        break;
      }

      if (started.left._tag !== "PortInUse" || attempt === 10) {
        return yield* Effect.fail(started.left);
      }
    }

    if (server === undefined) {
      return yield* Effect.fail(new ManifestError({ message: "Collector failed to start", cause: "no server" }));
    }

    yield* fs.writeFile(defaultPortFile, String(boundPort)).pipe(
      Effect.mapError((error) => new ManifestError({ message: error.message, cause: error })),
    );
    yield* fs.writeFile(defaultPidFile, String(process.pid)).pipe(
      Effect.mapError((error) => new ManifestError({ message: error.message, cause: error })),
    );

    yield* logger.info(
      `collector listening on http://localhost:${boundPort} output=${config.output} timeout=${config.timeout}s`,
    );

    yield* Effect.sleep(Duration.seconds(config.timeout));
    server.stop(true);
    yield* fs.removeFile(defaultPidFile).pipe(Effect.catchAll(() => Effect.void));

    return yield* Effect.fail(new CollectorTimeout({ seconds: config.timeout }));
  });

export const runCollectorFromArgs = (
  argv: readonly string[],
): Effect.Effect<void, ManifestError | PortInUse | CollectorTimeout | ValidationError, FileSystem | Logger> =>
  parseCollectorConfig(argv).pipe(Effect.flatMap((config) => runCollector(config)));

const execute = (argv: readonly string[]): Promise<void> =>
  Effect.runPromise(
    runCollectorFromArgs(argv).pipe(
      Effect.provide(AppLive),
      Effect.catchTag("CollectorTimeout", (error) =>
        Effect.sync(() => {
          console.error(error.message);
        }),
      ),
    ),
  );

if (import.meta.main) {
  execute(Bun.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
