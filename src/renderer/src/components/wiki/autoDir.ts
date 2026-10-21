/**
 * Every block reads its own direction (dir="auto"), so Arabic paragraphs run right to left
 * whatever wrote the HTML (the editor adds it, Word imports and older text do not).
 */
export function withAutoDir(html: string): string {
  return html.replace(/<(p|h[1-6]|li|td|th|ul|ol)(?=[\s>])([^>]*)>/gi, (m, tag, attrs) =>
    /\sdir\s*=/i.test(attrs) ? m : `<${tag} dir="auto"${attrs}>`
  )
}
