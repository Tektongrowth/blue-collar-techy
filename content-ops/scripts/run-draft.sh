#!/bin/bash
# Entrypoint for the biweekly BCT draft cron.
# - Pulls latest main
# - Invokes Claude Code headless with the /bct-draft skill
# - Captures output to a log
# - Nick gets notified via GitHub mobile push when PR opens

set -euo pipefail

REPO="/Users/nick/Projects/blue-collar-techy"
LOG_DIR="$REPO/content-ops/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)
LOG_FILE="$LOG_DIR/draft-$TIMESTAMP.log"

cd "$REPO"

{
  echo "=== BCT draft cron: $(date) ==="
  echo

  # Ensure we're on main and up to date
  git checkout main
  git pull --rebase origin main
  echo

  # Invoke Claude Code headless with the skill
  # claude CLI picks up login from ~/.claude/
  echo "=== /bct-draft next ==="
  /Users/nick/.local/bin/claude -p "/bct-draft next" --output-format text
  EXIT=$?

  echo
  echo "=== DONE: exit $EXIT at $(date) ==="
} > "$LOG_FILE" 2>&1

# If Claude exited non-zero, leave a breadcrumb on the desktop so Nick sees it next time
if [ "${EXIT:-0}" -ne 0 ]; then
  echo "BCT draft failed $(date). Log: $LOG_FILE" >> "$HOME/Desktop/bct-draft-errors.txt"
fi

exit "${EXIT:-0}"
