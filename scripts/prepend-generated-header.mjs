import { readFileSync, writeFileSync } from 'node:fs'

const file = process.argv[2]
const header = '// File GENERATO da `npm run db:types` (supabase gen types typescript --local). Non modificare a mano.\n\n'
const content = readFileSync(file, 'utf8')
if (!content.startsWith(header)) writeFileSync(file, header + content)
