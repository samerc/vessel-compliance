// Builds src/renderer/src/assets/sea-routes.json for the Sea Transit calculator.
// Source: the data folder of the Python "searoute" package (Apache-2.0,
// https://github.com/genthalili/searoute-py), whose sea lane network comes from
// Eurostat's SeaRoute (EUPL-1.2). Usage:
//   pip download searoute --no-deps, unpack it, then
//   node scripts/build-sea-routes.js <path to searoute/data>
const fs = require('fs')
const path = require('path')

const dir = process.argv[2]
if (!dir) throw new Error('Usage: node scripts/build-sea-routes.js <searoute/data folder>')
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).features

const round = (n) => Math.round(n * 10000) / 10000
const SMALL = new Set(['and', 'of', 'the', 'da', 'de', 'del'])
const country = (s) =>
  s
    .split('_')
    .map((w, i) => (i > 0 && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')

// Ports: [UN/LOCODE, name, country, lon, lat], one per code
const seen = new Set()
const ports = []
for (const f of read('ports.geojson')) {
  const p = f.properties
  if (!p.port || seen.has(p.port)) continue
  seen.add(p.port)
  const [lon, lat] = f.geometry.coordinates
  ports.push([p.port, p.name, country(p.cty || ''), round(lon), round(lat)])
}
ports.sort((a, b) => a[1].localeCompare(b[1]))

// Sea lanes: [flat lon,lat list, passage or ''] per line
const lanes = []
for (const f of read('marnet_searoute.geojson')) {
  const g = f.geometry
  const lines =
    g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
  for (const l of lines)
    lanes.push([l.flatMap(([x, y]) => [round(x), round(y)]), f.properties.passage || ''])
}

const out = path.join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'sea-routes.json')
fs.writeFileSync(out, JSON.stringify({ ports, lanes }))
console.log(
  `${ports.length} ports, ${lanes.length} lanes -> ${out} (${fs.statSync(out).size} bytes)`
)
