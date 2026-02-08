#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="${SKILL_NAME:-debug-logpoints}"
REPO_RAW_BASE="${REPO_RAW_BASE:-https://raw.githubusercontent.com/Rika-Labs/logpoint/main}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

curl -fsSL "$REPO_RAW_BASE/SKILL.md" -o "$TMP_DIR/SKILL.md"
curl -fsSL "$REPO_RAW_BASE/agents/debugger.md" -o "$TMP_DIR/debugger.md"

TARGETS=(
  "$HOME/.claude/skills/$SKILL_NAME"
  "$HOME/.agents/skills/$SKILL_NAME"
  "$HOME/.config/opencode/skills/$SKILL_NAME"
  "$HOME/.config/agents/skills/$SKILL_NAME"
)

for target in "${TARGETS[@]}"; do
  mkdir -p "$target/agents"
  cp "$TMP_DIR/SKILL.md" "$target/SKILL.md"
  cp "$TMP_DIR/debugger.md" "$target/agents/debugger.md"
done

echo "Installed skill '$SKILL_NAME' to:"
for target in "${TARGETS[@]}"; do
  echo "- $target"
done

echo
echo "If logpoint CLI is not installed yet, run:"
echo "bun add -g @rikalabs/logpoint"
