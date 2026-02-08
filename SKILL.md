---
name: debug-logpoints
description: >
  Debug runtime bugs using HTTP logpoints that capture variable state
  without breakpoints. Use when the user describes a bug involving wrong
  values, race conditions, unexpected state, timing issues, or says
  "debug this", "why is this value wrong", "trace this", or "instrument
  this code". Works with JavaScript, TypeScript, Python, Go, Ruby, Shell,
  Java, C#, PHP, Rust, and Kotlin.
disable-model-invocation: true
compatibility:
  - claude-code
  - codex
  - opencode
  - amp
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
---

## Phase 1 - Hypothesize
1. Read files mentioned by the user.
2. Compare expected behavior with observed behavior.
3. Produce 3 to 5 ranked hypotheses.
4. For each hypothesis identify file, line, and variable captures.
5. Confirm the proposed manifest with the user.

## Phase 2 - Instrument
1. Write `/tmp/logpoints.json` manifest from hypotheses.
2. Start collector: `logpoint collector --port 9111 --timeout 300 --output /tmp/debug-logpoints.jsonl`.
3. Inject logpoints: `logpoint inject --manifest /tmp/logpoints.json`.
4. Show an injection summary and touched files.
5. Ask the user to reproduce and confirm when complete.

## Phase 3 - Analyze
1. Run: `logpoint analyze --input /tmp/debug-logpoints.jsonl --format markdown`.
2. Read markdown results.
3. Confirm or refute each hypothesis with direct evidence.
4. Present findings with hit-by-hit data.

## Phase 4 - Fix
1. Propose the smallest fix supported by evidence.
2. Show diff and apply on confirmation.

## Phase 5 - Verify
1. Reproduce again with collector running.
2. Confirm the anomaly no longer appears.
3. If unresolved, return to Phase 2 with updated hypotheses.

## Phase 6 - Cleanup
1. Run: `logpoint cleanup --dir . --verify`.
2. Stop collector with PID file or by port.
3. Remove `/tmp/debug-logpoints.jsonl`, `/tmp/logpoints.json`, `/tmp/debug-logpoints.port`, `/tmp/debug-logpoints.pid`.
4. Verify no `LOGPOINT_START` or `LOGPOINT_END` markers remain.
5. Summarize root cause, fix, and validating evidence.

## Error Playbooks
- `PortInUse`: increment port and retry up to 10 times.
- `SecretVarBlocked`: warn, drop that variable, continue.
- `FileNotFound`: ask user to verify path.
- `InjectionError`: show file, line, and reason; skip failed item and continue.
- `CollectorTimeout`: restart collector with higher timeout if needed.

## Runtime Fallback
- Preferred runtime is Bun.
- If `logpoint` is not on PATH, run `bunx @rikalabs/logpoint <command>`.
