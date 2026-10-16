// Per-user accent colour. The user picks one colour; the light and dark themes each get a variant
// that reads well on their background, set as CSS variables on <body> (they override the theme's).

export const DEFAULT_ACCENT = '#1F4E9C'

export const ACCENT_PRESETS: { label: string; hex: string }[] = [
  { label: 'Blue', hex: '#1F4E9C' },
  { label: 'Teal', hex: '#0B6E8A' },
  { label: 'Green', hex: '#0F766E' },
  { label: 'Purple', hex: '#5B3FA8' },
  { label: 'Orange', hex: '#B4530F' },
  { label: 'Slate', hex: '#3C4C5E' }
]

type Rgb = [number, number, number]

function parse(hex: string): Rgb | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mix(c: Rgb, to: Rgb, amount: number): Rgb {
  return c.map((v, i) => Math.round(v + (to[i] - v) * amount)) as Rgb
}

function toHex(c: Rgb): string {
  return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')
}

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Sets the accent variables for the current theme (null = the default blue). */
export function applyAccent(hex: string | null | undefined, isLight: boolean): void {
  const base = parse(hex || '') || (parse(DEFAULT_ACCENT) as Rgb)
  const white: Rgb = [255, 255, 255]
  const black: Rgb = [0, 0, 0]
  // On a dark background a dark accent disappears: lighten it
  const main = isLight ? base : mix(base, white, 0.38)
  const secondary = isLight ? mix(base, black, 0.2) : mix(base, white, 0.22)
  // Text on an accent fill: white or near-black, whichever contrasts more
  const l = luminance(main)
  const contrast = 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#0b1220'
  const style = document.body.style
  style.setProperty('--accent-primary', toHex(main))
  style.setProperty('--accent-primary-rgb', main.join(', '))
  style.setProperty('--accent-secondary', toHex(secondary))
  style.setProperty('--accent-contrast', contrast)
}
