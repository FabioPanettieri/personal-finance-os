// Crea .env.local per lo sviluppo con lo stack Supabase LOCALE (`npx supabase start`):
// URL e publishable key letti da `supabase status`. Valori demo della CLI
// locale, mai chiavi reali; .env.local è ignorato da git.
import { execSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'

let raw
try {
  // Comando fisso (nessun input esterno): una stringa evita l'avviso DEP0190 su Windows.
  raw = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
} catch {
  console.error('✗ Supabase locale non attivo: avvia prima `npx supabase start` (con Docker Desktop aperto).')
  process.exit(1)
}
const status = JSON.parse(raw.slice(raw.indexOf('{')))
if (!status.API_URL || !status.PUBLISHABLE_KEY) {
  console.error('✗ `supabase status` non ha restituito URL e publishable key.')
  process.exit(1)
}
if (existsSync('.env.local') && !process.argv.includes('--force')) {
  console.error('✗ .env.local esiste già. Usa `npm run env:local -- --force` per sovrascriverlo.')
  process.exit(1)
}
writeFileSync('.env.local', `NEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY}\n`)
console.log(`✓ .env.local creato (Supabase locale su ${status.API_URL}). Studio: ${status.STUDIO_URL ?? 'http://127.0.0.1:55323'}`)
