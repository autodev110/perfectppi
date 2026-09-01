#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="$(dirname "$0")/.env"
PLIST="$(dirname "$0")/PerfectPPI/Resources/AppConfig.plist"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: .env not found at $ENV_FILE — copy .env.example and fill in your keys" >&2
  exit 1
fi

read_env_value() {
  local wanted="$1"
  local key value

  while IFS='=' read -r key value; do
    [[ "$key" == "$wanted" ]] || continue
    value="${value%$'\r'}"
    value="${value%\"}"
    value="${value#\"}"
    printf '%s' "$value"
    return
  done < "$ENV_FILE"
}

# Read only values that are safe to bundle in the client. Server credentials
# must remain in the web app's .env.local and are never exported here.
SUPABASE_URL="${SUPABASE_URL:-$(read_env_value SUPABASE_URL)}"
SUPABASE_URL="${SUPABASE_URL:-$(read_env_value NEXT_PUBLIC_SUPABASE_URL)}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(read_env_value SUPABASE_ANON_KEY)}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-$(read_env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)}"
API_BASE_URL="${API_BASE_URL:-$(read_env_value API_BASE_URL)}"
API_BASE_URL="${API_BASE_URL:-$(read_env_value NEXT_PUBLIC_SITE_URL)}"

: "${SUPABASE_URL:?SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL missing from .env}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env}"
: "${API_BASE_URL:?API_BASE_URL or NEXT_PUBLIC_SITE_URL missing from .env}"

/usr/libexec/PlistBuddy -c "Set :SupabaseURL $SUPABASE_URL" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :SupabaseAnonKey $SUPABASE_ANON_KEY" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :APIBaseURL $API_BASE_URL" "$PLIST"

echo "AppConfig.plist updated."
