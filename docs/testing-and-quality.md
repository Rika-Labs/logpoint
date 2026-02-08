# Testing and Quality Gates

## Local Quality Pipeline

Run the full project gate:

```bash
bun run check
```

This runs:

1. `oxlint` for lint + formatting policy.
2. `tsgo` and `tsc` for strict type checks.
3. Coverage gate with minimum line coverage of `95%`.
4. `repo-lint` strict architecture validation.

## Coverage Commands

```bash
bun run coverage
bun run coverage:check
```

`coverage:check` generates LCOV and fails if combined line coverage is below `95%`.

## Test Scope

Current tests cover:

- schema decoding and defaulting behavior
- CLI argument parsing edge cases
- JSONL append/read failure paths
- injection and cleanup logic (including Go import mutation paths)
- anomaly detection and markdown/json rendering
- service layer behavior (`FileSystem`, `Logger`, `Clock`, `RuntimeEnv`)

## CI Recommendation

Use `bun run check` as the required CI status for pull requests.
