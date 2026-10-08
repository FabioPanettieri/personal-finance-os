#!/usr/bin/env bash
# Applica le migration su un cluster PostgreSQL temporaneo e lancia la suite
# supabase/tests/database.test.sql. Non richiede Docker né la Supabase CLI.
#
#   PG_BIN=/usr/lib/postgresql/16/bin scripts/db-test-local.sh
#
# In alternativa, con Docker: `supabase start && supabase test db`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORT="${PG_TEST_PORT:-55330}"

if [[ ! -x "$PG_BIN/initdb" ]]; then
  echo "initdb non trovato: imposta PG_BIN" >&2
  exit 1
fi

WORK="$(mktemp -d)"
chmod 755 "$WORK"

# initdb rifiuta di girare come root.
run() {
  if [[ "$(id -u)" == "0" ]]; then
    runuser -u postgres -- "$@"
  else
    "$@"
  fi
}
[[ "$(id -u)" == "0" ]] && chown postgres "$WORK"

cleanup() {
  run "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

run "$PG_BIN/initdb" -D "$WORK/data" -U postgres --auth=trust -E UTF8 --locale=C.UTF-8 >/dev/null
run "$PG_BIN/pg_ctl" -D "$WORK/data" -l "$WORK/pg.log" \
  -o "-p $PORT -k $WORK -c listen_addresses=''" -w start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)

echo "→ stub ambiente Supabase"
"${PSQL[@]}" -f "$ROOT/supabase/tests/local/00_supabase_stub.sql"

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migration $(basename "$migration")"
  "${PSQL[@]}" -f "$migration"
done

echo "→ test"
OUTPUT="$("${PSQL[@]}" -f "$ROOT/supabase/tests/database.test.sql" 2>&1)" || {
  echo "$OUTPUT" | sed 's/^psql:[^ ]* NOTICE:  //'
  echo "✗ test database FALLITI" >&2
  exit 1
}
echo "$OUTPUT" | sed -n 's/.*NOTICE:  \(ok - .*\)/  \1/p'
PASSED="$(echo "$OUTPUT" | grep -c 'NOTICE:  ok - ' || true)"
echo "✓ $PASSED test database superati"
