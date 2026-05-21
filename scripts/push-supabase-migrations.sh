#!/usr/bin/env bash
# Push supabase/migrations/*.sql to the linked remote project.
# Requires one of:
#   SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF (recommended)
#   DATABASE_URL (postgres connection string with password)

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-kfdeyggjsmltnmszhtfk}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "Pushing migrations via DATABASE_URL..."
  npx supabase db push --db-url "$DATABASE_URL" --include-all
  exit 0
fi

if [[ -z "${SUPABASE_ACCESS_TOKEN:-}" ]]; then
  echo "Missing SUPABASE_ACCESS_TOKEN (or DATABASE_URL)."
  echo "Create a token: https://supabase.com/dashboard/account/tokens"
  echo "Add it to Cursor Cloud Agent secrets, then re-run this script."
  exit 1
fi

export SUPABASE_ACCESS_TOKEN
echo "Linking project ${PROJECT_REF}..."
npx supabase link --project-ref "$PROJECT_REF"

echo "Pushing migrations..."
npx supabase db push --linked --include-all

echo "Done."
