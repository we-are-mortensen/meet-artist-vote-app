#!/usr/bin/env bash
# Manual backup of the Supabase Postgres database into ./backups/.
#
# Usage:
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@...supabase.com:5432/postgres' \
#     ./scripts/backup.sh
#
# Get the connection string from: Supabase Dashboard → Project Settings →
# Database → Connection string (URI). Use the "Session" or direct connection,
# not the transaction pooler — pg_dump needs a real session.
#
# Requires pg_dump (brew install postgresql).
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "error: SUPABASE_DB_URL is not set" >&2
  exit 1
fi

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="${repo_root}/backups"
mkdir -p "${out_dir}"

stamp="$(date +%Y%m%d-%H%M%S)"
out_file="${out_dir}/artist-vote-${stamp}.dump"

echo "Dumping database to ${out_file} ..."
pg_dump "${SUPABASE_DB_URL}" \
  --schema=public \
  --no-owner \
  --no-privileges \
  -Fc \
  -f "${out_file}"

echo "Done: ${out_file}"
echo "Restore later with:"
echo "  pg_restore --no-owner --no-privileges -d \"<target connection string>\" ${out_file}"
