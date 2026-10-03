// Esegue un comando con le variabili dello stack Supabase locale
// (`npm run db:start`): URL API, publishable key e secret key locali.
// Le chiavi della CLI locale sono valori demo fissi, mai segreti reali, e
// vengono passate solo al processo figlio: non si scrivono su disco.
import { execFileSync, spawn } from 'node:child_process'

const raw = execFileSync('npx', ['supabase', 'status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
const status = JSON.parse(raw.slice(raw.indexOf('{')))

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: status.SECRET_KEY,
  SUPABASE_DB_URL: status.DB_URL,
}

const [command, ...args] = process.argv.slice(2)
const child = spawn(command, args, { env, stdio: 'inherit' })
child.on('exit', (code) => process.exit(code ?? 1))
