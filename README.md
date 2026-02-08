# @rikalabs/logpoint

`@rikalabs/logpoint` is a Bun + Effect CLI for runtime debugging with non-breaking HTTP logpoints.

It injects temporary logpoints into source files, collects snapshots over HTTP, summarizes anomalies, and removes instrumentation cleanly.

## Install

```bash
bun add -g @rikalabs/logpoint
```

If you do not install globally, use `bunx @rikalabs/logpoint <command>`.

## Commands

```bash
logpoint collector [--port 9111] [--timeout 300] [--output /tmp/debug-logpoints.jsonl] [--cors-origin *]
logpoint inject --manifest /tmp/logpoints.json [--project-root .] [--language <lang>] [--dry-run]
logpoint analyze [--input /tmp/debug-logpoints.jsonl] [--format markdown|json]
logpoint cleanup [--dir .] [--ids hp1,hp2] [--dry-run] [--verify]
logpoint validate --manifest /tmp/logpoints.json
logpoint doctor
```

## Supported Languages

- JavaScript
- TypeScript
- Python
- Go
- Ruby
- Shell (sh/bash/zsh/ksh)
- Java
- C#
- PHP
- Rust
- Kotlin

## Manifest Example

```json
{
  "port": 9111,
  "projectRoot": ".",
  "language": "typescript",
  "logpoints": [
    {
      "id": "hp1",
      "file": "src/cart.ts",
      "line": 42,
      "label": "cart total",
      "hypothesis": "tax applied twice",
      "capture": ["total", "tax", "items"],
      "maxHits": 100
    }
  ]
}
```

## Safety Guarantees

- Logpoint snippets are wrapped in language-specific error guards so app flow is not interrupted.
- Sensitive variable names are blocked before injection.
- Each logpoint enforces `maxHits` locally, and the collector enforces hit limits server-side.
- Cleanup supports verification to ensure markers are fully removed.

## Architecture Notes

- Runtime: Bun CLI and HTTP server.
- Core framework: Effect (typed errors, services, schema decoding, composable effects).
- Architecture guardrails: `repo-lint` in strict mode.
- Type safety: `tsgo` + `tsc` in strict mode.
- Linting/formatting: `oxlint`.

## Testing and Coverage

```bash
bun run test
bun run coverage
bun run coverage:check
```

`coverage:check` enforces a minimum of `95%` line coverage.

## Skill Packaging

The repo includes a portable `SKILL.md` workflow and `agents/debugger.md` persona.

See `docs/cli-compatibility.md` for installation paths and behavior across Claude Code, OpenAI Codex, OpenCode, and Amp.
See `docs/testing-and-quality.md` for the quality gate and coverage workflow.
