#!/usr/bin/env bun

import { Effect } from "effect";
import { runAnalyzeFromArgs } from "./analyze.js";
import { runCleanupFromArgs } from "./cleanup.js";
import { runCollectorFromArgs } from "./collector.js";
import { runDoctorFromArgs } from "./doctor.js";
import { CliUsageError } from "./lib/errors.js";
import { AppLive, FileSystem, Logger, RuntimeEnv } from "./lib/services.js";
import { runInjectFromArgs } from "./inject.js";
import { runValidateFromArgs } from "./validate.js";

const helpText = `logpoint - HTTP logpoint debugger CLI

Usage:
  logpoint collector [--port 9111] [--timeout 300] [--output /tmp/debug-logpoints.jsonl] [--cors-origin *]
  logpoint inject --manifest /tmp/logpoints.json [--project-root .] [--language javascript|typescript|python|go|ruby|shell|java|csharp|php|rust|kotlin] [--dry-run]
  logpoint cleanup [--dir .] [--ids hp1,hp2] [--dry-run] [--verify]
  logpoint analyze [--input /tmp/debug-logpoints.jsonl] [--format markdown|json]
  logpoint validate --manifest /tmp/logpoints.json
  logpoint doctor
`;

const dispatch = (
  command: string,
  argv: readonly string[],
): Effect.Effect<void, unknown, FileSystem | Logger | RuntimeEnv> => {
  switch (command) {
    case "collector":
      return runCollectorFromArgs(argv);
    case "inject":
      return runInjectFromArgs(argv);
    case "cleanup":
      return runCleanupFromArgs(argv);
    case "analyze":
      return runAnalyzeFromArgs(argv);
    case "validate":
      return runValidateFromArgs(argv);
    case "doctor":
      return runDoctorFromArgs();
    case "help":
    case "--help":
    case "-h":
      return Effect.sync(() => {
        console.log(helpText);
      });
    default:
      return Effect.fail(new CliUsageError({ message: `Unknown command: ${command}` }));
  }
};

const runCli = (argv: readonly string[]) =>
  Effect.gen(function* () {
    const [command = "help", ...rest] = argv;
    yield* dispatch(command, rest).pipe(
      Effect.catchAll((error) => {
        if (typeof error === "object" && error !== null && "_tag" in error) {
          const tagged = error as { readonly _tag: string; readonly message?: string };
          if (tagged._tag === "CollectorTimeout") {
            return Effect.sync(() => {
              console.error(tagged.message ?? "Collector timeout reached");
            });
          }
        }
        return Effect.fail(error);
      }),
    );
  });

if (import.meta.main) {
  Effect.runPromise(runCli(Bun.argv.slice(2)).pipe(Effect.provide(AppLive))).catch((error) => {
    if (typeof error === "object" && error !== null && "_tag" in error) {
      const tagged = error as { readonly _tag: string; readonly message?: string };
      if (tagged._tag === "CliUsageError") {
        console.error(`${tagged.message ?? "Invalid command"}\n\n${helpText}`);
      } else {
        console.error(error);
      }
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  });
}
