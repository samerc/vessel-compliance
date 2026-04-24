/**
 * Deploy a hot-update to the network share.
 *
 * Usage:
 *   npm run deploy                        # uses path from .deploy-config.json
 *   npm run deploy -- --path "\\server\shared\app-updates"
 *
 * What it does:
 *   1. Reads current version from the network share (or starts at build 0)
 *   2. Increments the build number
 *   3. Copies the out/ directory to the share
 *   4. Writes version.json
 */
const fs = require('fs')
const path = require('path')

const OUT_DIR = path.join(__dirname, '..', 'out')
const CONFIG_FILE = path.join(__dirname, '..', '.deploy-config.json')
const PKG = require('../package.json')

function getNetworkPath() {
  // Check --path argument
  const pathArg = process.argv.indexOf('--path')
  if (pathArg !== -1 && process.argv[pathArg + 1]) {
    return process.argv[pathArg + 1]
  }

  // Check config file
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'))
      if (config.networkPath) return config.networkPath
    } catch { /* ignore */ }
  }

  return null
}

function main() {
  const networkPath = getNetworkPath()
  if (!networkPath) {
    console.error('No network path configured.')
    console.error('')
    console.error('Either:')
    console.error('  1. Create .deploy-config.json with: { "networkPath": "\\\\server\\\\shared\\\\app-updates" }')
    console.error('  2. Pass --path "\\\\server\\\\shared\\\\app-updates" as an argument')
    process.exit(1)
  }

  // Verify out/ exists (must build first)
  if (!fs.existsSync(path.join(OUT_DIR, 'main', 'index.js'))) {
    console.error('out/main/index.js not found. Run "npm run build" first.')
    process.exit(1)
  }

  console.log(`Deploying to: ${networkPath}`)

  // Read current version from share (or default)
  const remoteVersionFile = path.join(networkPath, 'version.json')
  let currentBuild = 0
  if (fs.existsSync(remoteVersionFile)) {
    try {
      const existing = JSON.parse(fs.readFileSync(remoteVersionFile, 'utf-8'))
      currentBuild = existing.buildNumber || 0
    } catch { /* start fresh */ }
  }

  const newBuild = currentBuild + 1
  const version = {
    buildNumber: newBuild,
    version: PKG.version,
    timestamp: new Date().toISOString(),
    notes: ''
  }

  // Ensure destination exists
  const destOut = path.join(networkPath, 'out')
  if (!fs.existsSync(networkPath)) {
    fs.mkdirSync(networkPath, { recursive: true })
  }

  // Remove old out/ on share
  if (fs.existsSync(destOut)) {
    console.log('Removing old files...')
    fs.rmSync(destOut, { recursive: true, force: true })
  }

  // Copy out/ to share
  console.log(`Copying out/ to ${destOut} ...`)
  fs.cpSync(OUT_DIR, destOut, { recursive: true })

  // Write version.json
  fs.writeFileSync(remoteVersionFile, JSON.stringify(version, null, 2), 'utf-8')

  console.log('')
  console.log(`Deployed build ${newBuild} (v${PKG.version})`)
  console.log(`Timestamp: ${version.timestamp}`)
  console.log('')
  console.log('Users will receive the update on next app restart.')

  // Save path to config for next time
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ networkPath }, null, 2), 'utf-8')
    console.log(`Saved path to ${CONFIG_FILE}`)
  }
}

main()
