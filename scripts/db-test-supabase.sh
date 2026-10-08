#!/usr/bin/env bash
# Esegue supabase/tests/database.test.sql sul database dello stack Supabase
# locale (`npm run db:start`), con i veri schemi auth e storage. Tutto avviene
# in una transazione annullata alla fine: il database resta pulito.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:55322/postgres}"

OUTPUT="$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 \
  -c 'begin' \
  -f "$ROOT/supabase/tests/database.test.sql" \
  -c 'rollback' 2>&1)" || {
  echo "$OUTPUT" | sed 's/^psql:[^ ]* NOTICE:  //'
  echo "✗ test database (Supabase locale) FALLITI" >&2
  exit 1
}
PASSED="$(echo "$OUTPUT" | grep -c 'NOTICE:  ok - ' || true)"
echo "✓ $PASSED test database superati su Supabase locale"
