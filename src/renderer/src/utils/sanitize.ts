import DOMPurify from 'dompurify'

/** Sanitize HTML to prevent XSS — strips scripts, event handlers, etc. */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'b', 'i', 'u', 'strong', 'em', 'span', 'div', 'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'sub', 'sup', 'hr'],
    ALLOWED_ATTR: ['style', 'class', 'href', 'target', 'rel', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false
  })
}
