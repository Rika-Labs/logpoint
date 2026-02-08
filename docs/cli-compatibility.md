# Skill Compatibility Across Claude Code, Codex, OpenCode, and Amp

This package is designed so one `SKILL.md` workflow can be reused across major agent CLIs.

The workflow calls the global `logpoint` command, so the Skill file does not need local script paths or symlinks.

## Compatibility Matrix

| CLI | `SKILL.md` support | Skill directories | `AGENTS.md` support | Notes |
| --- | --- | --- | --- | --- |
| Claude Code | Yes | `.claude/skills/<name>/SKILL.md`, `~/.claude/skills/<name>/SKILL.md` | Project guidance uses Claude docs conventions; Skill system is separate | Model-invoked skills; Claude decides when to load skill instructions. |
| OpenAI Codex | Yes | Repo and user skill scan includes `.agents/skills` and `$HOME/.agents/skills` | Yes (`AGENTS.md` layering from global and project scopes) | Skills are available in CLI, IDE extension, and Codex app. |
| OpenCode | Yes | `.opencode/skill`, `~/.config/opencode/skills`, plus `.claude/skills` and `.agents/skills` compatibility paths | Yes (`AGENTS.md` in repo and home) | OpenCode loads skills via its native `skill` tool. |
| Amp | Yes | `.agents/skills`, `~/.config/agents/skills`, and compatible `.claude/skills` / `.opencode/skill` | Yes | Amp documents both AGENTS and SKILL.md compatibility modes. |

## Installation Without File Linking

Copy, do not symlink:

```bash
# from this package root
mkdir -p ~/.claude/skills/debug-logpoints
cp SKILL.md ~/.claude/skills/debug-logpoints/SKILL.md

mkdir -p ~/.agents/skills/debug-logpoints
cp SKILL.md ~/.agents/skills/debug-logpoints/SKILL.md

mkdir -p ~/.config/opencode/skills/debug-logpoints
cp SKILL.md ~/.config/opencode/skills/debug-logpoints/SKILL.md

mkdir -p ~/.config/agents/skills/debug-logpoints
cp SKILL.md ~/.config/agents/skills/debug-logpoints/SKILL.md
```

Optional:

```bash
cp -R agents ~/.claude/skills/debug-logpoints/
cp -R agents ~/.agents/skills/debug-logpoints/
cp -R agents ~/.config/opencode/skills/debug-logpoints/
cp -R agents ~/.config/agents/skills/debug-logpoints/
```

## Recommended Project Layout

- Keep one canonical `SKILL.md` in this package.
- Keep CLI behavior in the `logpoint` binary (`@rikalabs/logpoint`) instead of hardcoded filesystem paths.
- Use project `AGENTS.md` only for repository-specific policy and constraints, not for duplicating the full debugging workflow.

## Primary References

- Claude Code Skill docs: https://docs.claude.com/en/docs/claude-code/skills
- OpenAI Codex Skills docs: https://developers.openai.com/codex/skills
- OpenAI Codex AGENTS docs: https://developers.openai.com/codex/guides/agents-md
- OpenAI skills catalog (`openai/skills`): https://github.com/openai/skills
- OpenCode Skills docs: https://opencode.ai/docs/skills/
- OpenCode Agents docs: https://opencode.ai/docs/agents/
- Amp AGENTS docs: https://ampcode.com/manual#agentsmd
- Amp Skills docs: https://ampcode.com/reference/skills
