/**
 * Decodifica di un file CSV in testo. Riconosce BOM (UTF-8, UTF-16 LE/BE),
 * prova UTF-8 rigoroso e, se fallisce, ripiega su Windows-1252 (export di
 * banche italiane su Windows). Nessuna euristica sul contenuto.
 */

export type TextEncodingName = 'utf-8' | 'utf-16le' | 'utf-16be' | 'windows-1252'

export type DecodedText = { text: string; encoding: TextEncodingName; hadBom: boolean }

export class CsvFileError extends Error {
  override name = 'CsvFileError'
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value)
}

function isUtf16(bytes: Uint8Array): boolean {
  return startsWith(bytes, [0xff, 0xfe]) || startsWith(bytes, [0xfe, 0xff])
}

/**
 * Riempimento con byte NUL in coda (es. export ING portati a un multiplo di
 * 4096 byte): non fa parte del contenuto e viene ignorato. Un NUL in mezzo al
 * testo resta invece un segnale di file binario.
 */
export function stripTrailingNul(bytes: Uint8Array): Uint8Array {
  if (isUtf16(bytes)) return bytes
  let end = bytes.length
  while (end > 0 && bytes[end - 1] === 0) end--
  return end === bytes.length ? bytes : bytes.subarray(0, end)
}

export function decodeBytes(input: Uint8Array): DecodedText {
  const bytes = stripTrailingNul(input)
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(3)), encoding: 'utf-8', hadBom: true }
  }
  if (startsWith(bytes, [0xff, 0xfe])) {
    return { text: new TextDecoder('utf-16le').decode(bytes.subarray(2)), encoding: 'utf-16le', hadBom: true }
  }
  if (startsWith(bytes, [0xfe, 0xff])) {
    return { text: new TextDecoder('utf-16be').decode(bytes.subarray(2)), encoding: 'utf-16be', hadBom: true }
  }
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes), encoding: 'utf-8', hadBom: false }
  } catch {
    return { text: new TextDecoder('windows-1252').decode(bytes), encoding: 'windows-1252', hadBom: false }
  }
}

/** Un CSV non contiene byte NUL nel testo (tipici di file binari: xlsx, pdf, immagini). */
export function looksBinary(bytes: Uint8Array): boolean {
  if (isUtf16(bytes)) return false
  return stripTrailingNul(bytes).subarray(0, 4096).includes(0)
}
