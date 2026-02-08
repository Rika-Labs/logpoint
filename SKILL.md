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

## Manifest Contract
Use this shape when writing `/tmp/logpoints.json`:

```json
{
  "port": 9111,
  "projectRoot": ".",
  "language": "typescript",
  "logpoints": [
    {
      "id": "hp1",
      "file": "web/src/main.tsx",
      "line": 23,
      "label": "hydrate root branch",
      "hypothesis": "SSR and client trees diverge before hydration",
      "capture": ["rootElement.hasChildNodes()", "rootElement.innerHTML.length"],
      "maxHits": 100
    }
  ]
}
```

Required fields per logpoint:
- `id`: lowercase slug matching `^[a-z0-9_-]+$`
- `file`: target source file path
- `line`: positive integer line number
- `label`: short human-readable label
- `hypothesis`: what this logpoint is testing
- `capture`: non-empty array of variable/expression strings

Optional fields:
- top-level `port` (default `9111`)
- top-level `projectRoot` (default `"."`)
- top-level `language` (auto-detected from extension if omitted)
- per-logpoint `maxHits` (default `100`)

Strict schema notes:
- Use `capture`, not `variables`.
- `label` is required.
- Do not add extra manifest envelope fields unless supported by the CLI.

Validation command:
- `logpoint validate --manifest /tmp/logpoints.json`

Common validation failures:
- missing `label`:
  add `label` to each logpoint object
- missing `capture`:
  rename `variables` to `capture` and ensure it is a non-empty array
- bad `id` format:
  use lowercase letters, numbers, `_`, and `-` only

## Phase 1 - Hypothesize
1. Read files mentioned by the user.
2. Compare expected behavior with observed behavior.
3. Produce 3 to 5 ranked hypotheses.
4. For each hypothesis identify file, line, and variable captures.
5. Confirm the proposed manifest with the user.
6. Ensure each hypothesis maps to concrete `file`, `line`, and `capture` fields in manifest shape above.

## Phase 2 - Instrument
1. Write `/tmp/logpoints.json` manifest from hypotheses.
2. Validate manifest: `logpoint validate --manifest /tmp/logpoints.json`.
3. Start collector: `logpoint collector --port 9111 --timeout 300 --output /tmp/debug-logpoints.jsonl`.
4. Inject logpoints: `logpoint inject --manifest /tmp/logpoints.json`.
5. Show an injection summary and touched files.
6. Ask the user to reproduce and confirm when complete.

Instrumentation quality bar:
- Prefer 3-5 high-signal logpoints first.
- Capture only variables needed to prove or disprove each hypothesis.
- Avoid sensitive variables; if uncertain, exclude and add a safer proxy value.

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
