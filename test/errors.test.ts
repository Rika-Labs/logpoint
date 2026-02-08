import { describe, expect, test } from "bun:test";
import {
  CleanupError,
  CliUsageError,
  CollectorTimeout,
  FileNotFound,
  FileReadError,
  FileWriteError,
  InjectionError,
  ManifestError,
  ParseError,
  PortInUse,
  SecretVarBlocked,
  ValidationError,
} from "../src/lib/errors.js";

describe("errors", () => {
  test("formats all tagged error messages", () => {
    const fileNotFound = new FileNotFound({ path: "/tmp/missing.txt" });
    const fileReadError = new FileReadError({ path: "/tmp/read.txt", cause: new Error("nope") });
    const fileWriteError = new FileWriteError({ path: "/tmp/write.txt", cause: "denied" });
    const parseError = new ParseError({ input: "{oops", cause: "bad json" });
    const manifestError = new ManifestError({ message: "invalid manifest", cause: "schema" });
    const validationError = new ValidationError({ message: "invalid option" });
    const portInUse = new PortInUse({ port: 9111 });
    const injectionError = new InjectionError({
      logpointId: "hp1",
      file: "src/app.ts",
      line: 42,
      reason: "line out of range",
    });
    const cleanupError = new CleanupError({ file: "src/app.ts", reason: "still has marker" });
    const secretVarBlocked = new SecretVarBlocked({ logpointId: "hp2", variable: "api_token" });
    const collectorTimeout = new CollectorTimeout({ seconds: 30 });
    const cliUsageError = new CliUsageError({ message: "unknown command" });

    expect(fileNotFound.message).toBe("File not found: /tmp/missing.txt");
    expect(fileReadError.message).toContain("Failed to read file /tmp/read.txt");
    expect(fileWriteError.message).toContain("Failed to write file /tmp/write.txt");
    expect(parseError.message).toContain("Failed to parse input: {oops");
    expect(manifestError.message).toBe("invalid manifest");
    expect(validationError.message).toBe("invalid option");
    expect(portInUse.message).toBe("Port is in use: 9111");
    expect(injectionError.message).toBe(
      "Injection failed for hp1 at src/app.ts:42 - line out of range",
    );
    expect(cleanupError.message).toBe("Cleanup failed for src/app.ts: still has marker");
    expect(secretVarBlocked.message).toBe("Blocked secret variable api_token in hp2");
    expect(collectorTimeout.message).toBe("Collector timeout reached after 30 seconds");
    expect(cliUsageError.message).toBe("unknown command");
  });
});
