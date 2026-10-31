// Points the LOCAL test database at the test files in this folder instead of C:\Al Bahriah.
// Run after every prod dump reload:  node test-env/setup-test-env.cjs
// - creates test-env/Al Bahriah/{Quotations,Vessels}
// - creates a TEST "Register of Quotations.xlsx" (only if missing) that continues from the
//   highest quotation number in the database, so approvals in tests take numbers there
// - sets the quotationRegistryPath and file_manager_root settings to these test paths
// Refuses to run against anything but a local database.
const path = require('path')
const fs = require('fs')
const root = path.join(__dirname, '..', 'node_modules')
const mysql = require(path.join(root, 'mysql2/promise'))
const XLSX = require(path.join(root, 'xlsx-js-style'))

const BASE = path.join(__dirname, 'Al Bahriah')
const REGISTER = path.join(BASE, 'Quotations', 'Register of Quotations.xlsx')
const HEADERS = ['Date', 'Quotation Type', 'Branch', 'Seq. Number', 'Reference', 'Managers',
  'Vessel', 'IMO', 'Type', 'Broker', 'Remarks']

;(async () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'db', 'db-config.json'), 'utf8'))
  if (!['localhost', '127.0.0.1', '::1'].includes(String(cfg.host || '').toLowerCase()))
    throw new Error(`Not a local database (${cfg.host}): refusing`)
  const c = await mysql.createConnection({
    host: cfg.host, port: cfg.port || 3306, user: cfg.user, password: cfg.password || '',
    database: cfg.database
  })

  for (const d of ['Quotations', 'Vessels']) fs.mkdirSync(path.join(BASE, d), { recursive: true })

  if (!fs.existsSync(REGISTER)) {
    const year = new Date().getFullYear()
    const yy = String(year).slice(-2)
    const [[row]] = await c.query(
      `SELECT MAX(CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(reference_number, '/', 5), '/', -1) AS UNSIGNED)) AS last
         FROM quotations WHERE reference_number LIKE ?`,
      [`Q/%/${yy}/%`]
    )
    const last = Number(row.last) || 0
    const wb = XLSX.utils.book_new()
    for (const y of [year, year + 1]) {
      const rows = [
        ['TEST REGISTER (local test environment only, not the real register)'],
        HEADERS
      ]
      // Seed row: the next approval in tests continues from the database's last number
      if (y === year && last > 0)
        rows.push(['', 'TEST', 'TEST', last, `Q/N/X/${yy}/${last}`, '', '', '', '', '',
          'Seed row: last number in the test database'])
      const ws = XLSX.utils.aoa_to_sheet(rows)
      ws['!cols'] = HEADERS.map((h) => ({ wch: Math.max(12, h.length + 4) }))
      XLSX.utils.book_append_sheet(wb, ws, String(y))
    }
    XLSX.writeFile(wb, REGISTER)
    console.log(`created ${REGISTER} (next number ${last + 1})`)
  } else console.log(`kept ${REGISTER}`)

  const set = (k, v) =>
    c.execute(
      'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [k, v]
    )
  await set('quotationRegistryPath', REGISTER)
  await set('file_manager_root', BASE)
  console.log('quotationRegistryPath ->', REGISTER)
  console.log('file_manager_root     ->', BASE)
  await c.end()
})().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
