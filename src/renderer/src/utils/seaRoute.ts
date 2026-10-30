/**
 * Port to port sea distances for the Sea Transit calculator.
 * The data (assets/sea-routes.json, built by scripts/build-sea-routes.js) is the
 * searoute sea lane network and port list; it loads on first use. Distances are
 * estimates, usually within about 5% of the published port distance tables.
 */

export type Passage =
  | 'suez'
  | 'panama'
  | 'babalmandab'
  | 'gibraltar'
  | 'bosporus'
  | 'dardanelles'
  | 'ormuz'
  | 'malacca'
  | 'sunda'
  | 'south_africa'
  | 'chili'
  | 'bering'
  | 'northwest'

export const PASSAGE_LABELS: Record<Passage, string> = {
  suez: 'Suez Canal',
  panama: 'Panama Canal',
  babalmandab: 'Bab-el-Mandeb (Red Sea)',
  gibraltar: 'Strait of Gibraltar',
  bosporus: 'Bosporus',
  dardanelles: 'Dardanelles',
  ormuz: 'Strait of Hormuz',
  malacca: 'Strait of Malacca',
  sunda: 'Sunda Strait',
  south_africa: 'Cape of Good Hope',
  chili: 'Cape Horn / Strait of Magellan',
  bering: 'Bering Strait',
  northwest: 'Northwest Passage'
}

export interface SeaPort {
  code: string
  name: string
  country: string
  lon: number
  lat: number
}

export interface SeaRoute {
  /** Nautical miles, port to port */
  distanceNm: number
  /** Passages in the order sailed */
  passages: Passage[]
  /** [lon, lat] points along the route */
  path: [number, number][]
}

interface Graph {
  ports: SeaPort[]
  coords: [number, number][]
  adj: { to: number; nm: number; passage: Passage | null }[][]
}

const EARTH_RADIUS_NM = 3440.065

export function distanceNm(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180
  const dLat = (b[1] - a[1]) * r
  const dLon = (b[0] - a[0]) * r
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)))
}

// Some lanes cross the 180th meridian as longitudes above 180: fold them back so
// both sides meet at the same node
const foldLon = (x: number): number => (x >= 180 ? x - 360 : x < -180 ? x + 360 : x)

let graphPromise: Promise<Graph> | null = null

export function loadSeaRoutes(): Promise<Graph> {
  if (!graphPromise) {
    graphPromise = import('../assets/sea-routes.json').then((mod) => {
      const data = (mod.default ?? mod) as {
        ports: [string, string, string, number, number][]
        lanes: [number[], string][]
      }
      const ports = data.ports.map(([code, name, country, lon, lat]) => ({
        code,
        name,
        country,
        lon,
        lat
      }))
      const ids = new Map<string, number>()
      const coords: [number, number][] = []
      const adj: Graph['adj'] = []
      const node = (x: number, y: number): number => {
        const lon = foldLon(x)
        const key = `${lon.toFixed(4)},${y.toFixed(4)}`
        let i = ids.get(key)
        if (i === undefined) {
          i = coords.length
          ids.set(key, i)
          coords.push([lon, y])
          adj.push([])
        }
        return i
      }
      for (const [flat, passage] of data.lanes) {
        for (let j = 2; j < flat.length; j += 2) {
          const a = node(flat[j - 2], flat[j - 1])
          const b = node(flat[j], flat[j + 1])
          if (a === b) continue
          const nm = distanceNm(coords[a], coords[b])
          const p = (passage || null) as Passage | null
          adj[a].push({ to: b, nm, passage: p })
          adj[b].push({ to: a, nm, passage: p })
        }
      }
      return { ports, coords, adj }
    })
    graphPromise.catch(() => {
      graphPromise = null
    })
  }
  return graphPromise
}

function nearestNode(g: Graph, at: [number, number]): number {
  let best = 0
  let bestNm = Infinity
  for (let i = 0; i < g.coords.length; i++) {
    const d = distanceNm(at, g.coords[i])
    if (d < bestNm) {
      bestNm = d
      best = i
    }
  }
  return best
}

/** Shortest sea route between two ports, or null when the passages avoided leave no way through */
export function findSeaRoute(
  g: Graph,
  from: SeaPort,
  to: SeaPort,
  avoid: Passage[]
): SeaRoute | null {
  const start = nearestNode(g, [from.lon, from.lat])
  const end = nearestNode(g, [to.lon, to.lat])
  const n = g.coords.length
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const prevPassage: (Passage | null)[] = new Array(n).fill(null)
  const done = new Uint8Array(n)
  const blocked = new Set(avoid)

  // Dijkstra with a binary heap of [distance, node]
  const heap: [number, number][] = [[0, start]]
  const push = (item: [number, number]): void => {
    heap.push(item)
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = (): [number, number] => {
    const top = heap[0]
    const last = heap.pop() as [number, number]
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }

  dist[start] = 0
  while (heap.length) {
    const [d, u] = pop()
    if (done[u]) continue
    done[u] = 1
    if (u === end) break
    for (const e of g.adj[u]) {
      if (e.passage && blocked.has(e.passage)) continue
      const nd = d + e.nm
      if (nd < dist[e.to]) {
        dist[e.to] = nd
        prev[e.to] = u
        prevPassage[e.to] = e.passage
        push([nd, e.to])
      }
    }
  }
  if (!isFinite(dist[end])) return null

  const nodes: number[] = []
  const passages: Passage[] = []
  for (let v = end; v !== -1; v = prev[v]) {
    nodes.push(v)
    const p = prevPassage[v]
    if (p && passages[passages.length - 1] !== p) passages.push(p)
  }
  nodes.reverse()
  passages.reverse()

  const path: [number, number][] = [[from.lon, from.lat], ...nodes.map((i) => g.coords[i])]
  path.push([to.lon, to.lat])
  let total = 0
  for (let i = 1; i < path.length; i++) total += distanceNm(path[i - 1], path[i])
  return { distanceNm: Math.round(total), passages, path }
}

/** Ports whose name, country or UN/LOCODE match the text typed, best matches first */
export function searchPorts(ports: SeaPort[], typed: string, limit = 50): SeaPort[] {
  const q = typed.trim().toLowerCase()
  if (!q) return []
  const scored: [number, SeaPort][] = []
  for (const p of ports) {
    const name = p.name.toLowerCase()
    const code = p.code.toLowerCase()
    let score = -1
    if (code === q) score = 0
    else if (name === q) score = 1
    else if (name.startsWith(q)) score = 2
    else if (code.startsWith(q)) score = 3
    else if (name.includes(q)) score = 4
    else if (p.country.toLowerCase().startsWith(q)) score = 5
    if (score >= 0) scored.push([score, p])
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.localeCompare(b[1].name))
  return scored.slice(0, limit).map((s) => s[1])
}
