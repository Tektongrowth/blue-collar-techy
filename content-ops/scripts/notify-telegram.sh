#!/bin/bash
# Send a Telegram notification.
# Usage: notify-telegram.sh "message text"
#
# Reads TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from ~/Projects/telegram-claude/.env.
# Exits 0 even on failure so cron runs don't abort on notification issues.

set -u

MSG="${1:-No message}"
ENV_FILE="$HOME/Projects/telegram-claude/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "notify: $ENV_FILE not found, skipping" >&2
  exit 0
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
  echo "notify: telegram creds missing, skipping" >&2
  exit 0
fi

curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=${TELEGRAM_CHAT_ID}" \
  --data-urlencode "text=${MSG}" \
  > /dev/null || true

exit 0
