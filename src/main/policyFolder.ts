import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'

/**
 * Policy folders: the converter asks for a vessel's folder and the policy's exports are saved in
 * a year folder inside it ({base}\2026). A year folder that already holds a policy (also one made
 * by hand) is left alone and the next free one is used: 2026-2, 2026-3...
 */

// A policy file is named after its number: type letter + YY + code + 4-digit serial, no spaces
// (H26210015 - JULIA AK - Debit Advice.docx). The code part is also accepted without its 2 digits.
// A draft exported before its number was given (POL-DRAFT-H-0015 - ...) is a policy too
const POLICY_FILE_RE = /^(?:[A-Z]\d{2}(?:\d{2})?\d{4}(?!\d)|POL-DRAFT-)/i

export function folderHasPolicy(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some(
    (e) => e.isFile() && POLICY_FILE_RE.test(e.name)
  )
}

function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** The year folder exports would go to: the first of {year}, {year}-2... without a policy */
export function findYearFolder(base: string, year: number): { folder: string; exists: boolean } {
  if (!isDir(base)) throw new Error(`The folder ${base} was not found`)
  for (let n = 1; n < 1000; n++) {
    const folder = join(base, n === 1 ? String(year) : `${year}-${n}`)
    if (!existsSync(folder)) return { folder, exists: false }
    if (isDir(folder) && !folderHasPolicy(folder)) return { folder, exists: true }
  }
  throw new Error(`No free ${year} folder in ${base}`)
}

/** Finds the year folder and creates it when it is new */
export function prepareYearFolder(base: string, year: number): string {
  const { folder, exists } = findYearFolder(base, year)
  if (!exists) mkdirSync(folder, { recursive: true })
  return folder
}

/** Writes the file into the folder without asking; an existing name gets " (2)", " (3)"... */
export function writeIntoFolder(folder: string, fileName: string, data: Uint8Array): string {
  const name = basename(fileName).replace(/[<>:"/\\|?*]/g, '_')
  const ext = extname(name)
  const stem = name.slice(0, name.length - ext.length)
  let target = join(folder, name)
  for (let n = 2; existsSync(target); n++) target = join(folder, `${stem} (${n})${ext}`)
  writeFileSync(target, Buffer.from(data))
  return target
}
