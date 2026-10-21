// Reads a Word (.docx) or text file for the wiki import: the editor's HTML + a title.
// Loaded on demand (import('./wikiImport')): mammoth takes ~0.2 s to load, too much for startup.
import * as mammoth from 'mammoth'
import { readFileSync } from 'fs'
import { basename, extname } from 'path'
import type { WikiImportFile } from '../shared/types'

const esc = (x: string): string =>
  x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function readWikiImportFile(path: string): Promise<WikiImportFile> {
  const fileName = basename(path)
  const ext = extname(path).toLowerCase()
  let title = fileName.slice(0, fileName.length - ext.length).trim()
  try {
    let bodyHtml = ''
    if (ext === '.txt') {
      bodyHtml = readFileSync(path, 'utf8')
        .replace(/^\uFEFF/, '')
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l) => `<p>${esc(l)}</p>`)
        .join('')
    } else if (ext === '.docx') {
      const res = await mammoth.convertToHtml(
        { buffer: readFileSync(path) },
        // Pictures are not kept (the wiki links files instead)
        { convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })) }
      )
      bodyHtml = res.value.replace(/<img[^>]*>/gi, '').replace(/<p>\s*<\/p>/g, '')
      // A heading at the very top is the title
      const head = bodyHtml.match(/^<h[12][^>]*>([\s\S]*?)<\/h[12]>/)
      const headText = head ? head[1].replace(/<[^>]*>/g, '').trim() : ''
      if (head && headText) {
        title = headText
        bodyHtml = bodyHtml.slice(head[0].length)
      }
    } else {
      throw new Error('Old Word files (.doc) cannot be read: save the file as .docx first')
    }
    return { fileName, title: title.slice(0, 255), bodyHtml }
  } catch (err) {
    return {
      fileName,
      title,
      bodyHtml: '',
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
