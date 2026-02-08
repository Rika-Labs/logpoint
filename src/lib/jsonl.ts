import { appendFile, readFile } from "node:fs/promises";
import { Effect } from "effect";
import { FileReadError, FileWriteError, ParseError } from "./errors.js";

export const appendJsonLine = (
  path: string,
  payload: unknown,
): Effect.Effect<void, FileWriteError | ParseError, never> =>
  Effect.try({
    try: () => JSON.stringify(payload),
    catch: (cause) => new ParseError({ input: String(payload), cause }),
  }).pipe(
    Effect.flatMap((line) =>
      Effect.tryPromise({
        try: async () => {
          await appendFile(path, `${line}\n`, "utf8");
        },
        catch: (cause) => new FileWriteError({ path, cause }),
      }),
    ),
  );

export const readJsonLines = (path: string): Effect.Effect<readonly unknown[], FileReadError | ParseError, never> =>
  Effect.tryPromise({
    try: () => readFile(path, "utf8"),
    catch: (cause) => new FileReadError({ path, cause }),
  }).pipe(
    Effect.flatMap((content) => {
      const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
      return Effect.forEach(lines, (line) =>
        Effect.try({
          try: () => JSON.parse(line) as unknown,
          catch: (cause) => new ParseError({ input: line, cause }),
        }),
      );
    }),
  );
