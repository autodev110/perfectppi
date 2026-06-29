#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="$(dirname "$0")/.env"
PLIST="$(dirname "$0")/PerfectPPI/Resources/AppConfig.plist"

if [ ! -f "$ENV_FILE" ]; then
  echo "error: .env not found at $ENV_FILE — copy .env.example and fill in your keys" >&2
  exit 1
fi

# Load .env (skip blank lines and comments; strip surrounding quotes from values)
while IFS='=' read -r key value; do
  [[ -z "$key" || "$key" =~ ^# ]] && continue
  value="${value%\"}"
  value="${value#\"}"
  export "$key=$value"
done < "$ENV_FILE"

# Accept either mobile-style names or NEXT_PUBLIC_* (so a shared .env works)
SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-${NEXT_PUBLIC_SUPABASE_ANON_KEY:-}}"
API_BASE_URL="${API_BASE_URL:-${NEXT_PUBLIC_SITE_URL:-}}"

: "${SUPABASE_URL:?SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL missing from .env}"
: "${SUPABASE_ANON_KEY:?SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY missing from .env}"
: "${API_BASE_URL:?API_BASE_URL or NEXT_PUBLIC_SITE_URL missing from .env}"

/usr/libexec/PlistBuddy -c "Set :SupabaseURL $SUPABASE_URL" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :SupabaseAnonKey $SUPABASE_ANON_KEY" "$PLIST"
/usr/libexec/PlistBuddy -c "Set :APIBaseURL $API_BASE_URL" "$PLIST"

echo "AppConfig.plist updated."
