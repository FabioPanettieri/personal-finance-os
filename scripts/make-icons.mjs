// Genera le icone PNG dell'app installabile (Android/iOS) da app/icon.svg.
// Uso: node scripts/make-icons.mjs — i PNG generati sono versionati.
import { readFileSync } from 'node:fs'

import sharp from 'sharp'

const svg = readFileSync('app/icon.svg')
// Per iOS e maskable lo sfondo occupa tutto il quadrato (il sistema arrotonda da sé).
const square = Buffer.from(svg.toString().replace('rx="112" fill="#0a0b0f"', 'fill="#0a0b0f"'))
const out = [
  [svg, 192, 'public/icons/icon-192.png'],
  [svg, 512, 'public/icons/icon-512.png'],
  [square, 512, 'public/icons/maskable-512.png'],
  [square, 180, 'app/apple-icon.png'],
]
for (const [source, size, file] of out) {
  await sharp(source, { density: 300 }).resize(size, size).png().toFile(file)
  console.log(`✓ ${file}`)
}
