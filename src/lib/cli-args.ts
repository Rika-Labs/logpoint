import { Effect } from "effect";
import { ValidationError } from "./errors.js";

export type ParsedArgs = {
  readonly positionals: readonly string[];
  readonly options: Readonly<Record<string, string | boolean>>;
};

export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const positionals: string[] = [];
  const options: Record<string, string | boolean> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (!token.startsWith("-")) {
      positionals.push(token);
      continue;
    }

    if (token.startsWith("--")) {
      const raw = token.slice(2);
      if (raw.length === 0) {
        continue;
      }

      const equalsIndex = raw.indexOf("=");
      if (equalsIndex >= 0) {
        const key = raw.slice(0, equalsIndex);
        const value = raw.slice(equalsIndex + 1);
        options[key] = value;
        continue;
      }

      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        options[raw] = next;
        index += 1;
      } else {
        options[raw] = true;
      }
      continue;
    }

    const shortFlags = token.slice(1);
    if (shortFlags.length === 0) {
      continue;
    }

    for (const flag of shortFlags) {
      options[flag] = true;
    }
  }

  return { positionals, options };
};

const getOption = (parsed: ParsedArgs, key: string): string | boolean | undefined => parsed.options[key];

export const requireStringOption = (
  parsed: ParsedArgs,
  key: string,
): Effect.Effect<string, ValidationError, never> => {
  const value = getOption(parsed, key);
  if (typeof value === "string" && value.length > 0) {
    return Effect.succeed(value);
  }
  return Effect.fail(new ValidationError({ message: `Missing required option --${key}` }));
};

export const optionalStringOption = (
  parsed: ParsedArgs,
  key: string,
): Effect.Effect<string | undefined, never, never> => {
  const value = getOption(parsed, key);
  if (typeof value === "string") {
    return Effect.succeed(value);
  }
  return Effect.succeed(undefined);
};

export const optionalBooleanOption = (
  parsed: ParsedArgs,
  key: string,
): Effect.Effect<boolean | undefined, never, never> => {
  const value = getOption(parsed, key);
  if (typeof value === "boolean") {
    return Effect.succeed(value);
  }
  if (typeof value === "string") {
    if (value === "true") {
      return Effect.succeed(true);
    }
    if (value === "false") {
      return Effect.succeed(false);
    }
  }
  return Effect.succeed(undefined);
};

export const optionalNumberOption = (
  parsed: ParsedArgs,
  key: string,
): Effect.Effect<number | undefined, ValidationError, never> => {
  const value = getOption(parsed, key);
  if (value === undefined) {
    return Effect.succeed(undefined);
  }
  if (typeof value === "boolean") {
    return Effect.fail(new ValidationError({ message: `Option --${key} requires a number` }));
  }

  const parsedValue = Number(value);
  if (Number.isNaN(parsedValue)) {
    return Effect.fail(new ValidationError({ message: `Option --${key} is not a valid number` }));
  }

  return Effect.succeed(parsedValue);
};

export const optionalCsvOption = (
  parsed: ParsedArgs,
  key: string,
): Effect.Effect<readonly string[] | undefined, never, never> => {
  const value = getOption(parsed, key);
  if (typeof value !== "string") {
    return Effect.succeed(undefined);
  }
  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (items.length === 0) {
    return Effect.succeed(undefined);
  }
  return Effect.succeed(items);
};
