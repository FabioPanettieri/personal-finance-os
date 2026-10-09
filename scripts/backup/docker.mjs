// Esecuzione di comandi nei container di Supabase locale (docker exec), con input e output binari.
import { spawn } from 'node:child_process'

export function dockerExec(container, args, { input, interactive = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', ...(interactive ? ['-i'] : []), container, ...args], {
      stdio: [interactive ? 'pipe' : 'ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    const out = []
    const err = []
    child.stdout.on('data', (c) => out.push(c))
    child.stderr.on('data', (c) => err.push(c))
    child.on('error', (e) => reject(new Error(`docker non disponibile: ${e.message}. Docker Desktop è aperto?`)))
    child.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(out))
      else reject(new Error(`${args[0]} nel container ${container} è terminato con codice ${code}: ${Buffer.concat(err).toString().trim()}`))
    })
    if (interactive) child.stdin.end(input ?? Buffer.alloc(0))
  })
}

export async function psql(container, sql) {
  const out = await dockerExec(container, ['psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql])
  return out.toString().trim()
}

/** Tutte le tabelle degli schemi indicati, come "schema.tabella". */
export async function listTables(container, schemas) {
  const list = schemas.map((s) => `'${s}'`).join(', ')
  const out = await psql(container, `select schemaname || '.' || tablename from pg_tables where schemaname in (${list}) order by 1`)
  return out ? out.split('\n') : []
}

/** Ultima migration applicata: il ripristino va fatto sulla stessa versione o una più recente. */
export async function schemaVersion(container) {
  return psql(container, 'select coalesce(max(version), \'\') from supabase_migrations.schema_migrations')
}
