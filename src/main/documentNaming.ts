import { existsSync } from 'fs'
import { rename } from 'fs/promises'
import { basename, dirname, extname, join } from 'path'

// Linked vessel / entity documents are renamed in place on upload so the folders read on their
// own: `BARON - COR - 2026-10-31.pdf`, `Safe Sea Services - KYC - 2026-10-31.pdf`

/** Company status words dropped from the end of an entity name (compared without dots) */
const COMPANY_SUFFIXES = new Set(
  (
    'ltd limited co company corp corporation inc incorporated llc llp lp plc sa sal ' +
    'sarl sas sae saog sak sl srl spa bv nv ag gmbh kg oy ab as asa aps pte pty pvt ' +
    'private dmcc dmcest fze fzco fzc fz fzllc fzlle llcfz wll jsc ojsc pjsc cjsc ooo ' +
    'est offshore sociedad anonima sro doo ad ae ike ee ltda sdn bhd kk sp zoo'
  ).split(' ')
)
const JOINERS = new Set(['&', 'and', '-', ','])

/** "Safe Sea Services S.A.R.L." -> "Safe Sea Services"; "X Shipping Co. Ltd" -> "X Shipping" */
export function cleanCompanyName(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const key = (w: string): string => w.toLowerCase().replace(/[.,()'"]/g, '')
  while (words.length > 1) {
    const k = key(words[words.length - 1])
    if (COMPANY_SUFFIXES.has(k) || JOINERS.has(k) || k === '') words.pop()
    else break
  }
  return words.join(' ').replace(/[\s,.-]+$/, '')
}

/** A piece of a Windows file name: no reserved characters, no trailing dots / spaces */
export function safeFilePart(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex -- Windows file names cannot hold control characters
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/, '')
      .slice(0, 120)
  )
}

/** Local date as YYYY-MM-DD */
function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** The file name (without extension) for a document: `OWNER - CODE - YYYY-MM-DD` */
export function documentFileBase(owner: string, code: string, date = new Date()): string {
  return [safeFilePart(owner), safeFilePart(code), localDate(date)].filter(Boolean).join(' - ')
}

/**
 * Renames the file in its own folder to `base` + its extension (" (2)", " (3)"... when the name is
 * taken; never overwrites). Returns the new path, or the same path when it already has that name.
 */
export async function renameToDocumentName(filePath: string, base: string): Promise<string> {
  const ext = extname(filePath)
  const current = basename(filePath, ext)
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (new RegExp(`^${escaped}( \\(\\d+\\))?$`, 'i').test(current)) return filePath
  const dir = dirname(filePath)
  let target = join(dir, base + ext)
  for (let n = 2; existsSync(target); n++) target = join(dir, `${base} (${n})${ext}`)
  await rename(filePath, target)
  return target
}
