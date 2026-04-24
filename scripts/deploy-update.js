/**
 * Deploy a hot-update to GitHub as a code-only release.
 *
 * Usage:
 *   npm run deploy          # builds + uploads code-update.zip to GitHub
 *
 * What it does:
 *   1. Runs npm run build (via the "deploy" npm script)
 *   2. Zips the out/ directory
 *   3. Uploads to a pinned GitHub release tagged "code-latest"
 *   4. Auto-increments the build number
 *
 * Requires: gh CLI authenticated (https://cli.github.com)
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const OUT_DIR = path.join(__dirname, '..', 'out')
const PKG = require('../package.json')
const REPO = 'samerc/vessel-compliance'
const TAG = 'code-latest'
const ZIP_NAME = 'code-update.zip'
const ZIP_PATH = path.join(__dirname, '..', 'dist', ZIP_NAME)

function exec(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  return execSync(cmd, { stdio: 'inherit', cwd: path.join(__dirname, '..'), ...opts })
}

function execOutput(cmd) {
  return execSync(cmd, { cwd: path.join(__dirname, '..'), encoding: 'utf-8' }).trim()
}

function main() {
  // Verify out/ exists
  if (!fs.existsSync(path.join(OUT_DIR, 'main', 'index.js'))) {
    console.error('out/main/index.js not found. Build failed or not run.')
    process.exit(1)
  }

  // Verify gh CLI is available
  try {
    execSync('gh --version', { stdio: 'pipe' })
  } catch {
    console.error('gh CLI not found. Install from https://cli.github.com')
    process.exit(1)
  }

  // Get current build number from existing release (if any)
  let currentBuild = 0
  try {
    const body = execOutput(`gh release view ${TAG} --repo ${REPO} --json body -q .body`)
    const match = body.match(/\{[^}]*"buildNumber"\s*:\s*(\d+)/)
    if (match) currentBuild = parseInt(match[1], 10)
  } catch {
    // No existing release — start at 0
  }

  const newBuild = currentBuild + 1
  const versionInfo = JSON.stringify({
    buildNumber: newBuild,
    version: PKG.version,
    timestamp: new Date().toISOString()
  })

  console.log(`\nPreparing build ${newBuild} (v${PKG.version})...\n`)

  // Ensure dist/ exists for the zip
  const distDir = path.join(__dirname, '..', 'dist')
  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true })

  // Create zip of out/ directory
  if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH)

  // Use PowerShell to create zip (available on all Windows machines)
  const outAbsolute = path.resolve(OUT_DIR)
  const zipAbsolute = path.resolve(ZIP_PATH)
  exec(`powershell -Command "Compress-Archive -Path '${outAbsolute}\\*' -DestinationPath '${zipAbsolute}' -Force"`)

  const zipSize = (fs.statSync(ZIP_PATH).size / (1024 * 1024)).toFixed(1)
  console.log(`\nCreated ${ZIP_NAME} (${zipSize} MB)`)

  // Create or update the code-latest release
  const releaseBody = `${versionInfo}\n\nCode-only update. Build ${newBuild} — v${PKG.version}\nDeployed: ${new Date().toISOString()}`

  try {
    // Try to delete existing release first (gh release edit can't replace assets)
    execSync(`gh release delete ${TAG} --repo ${REPO} --yes --cleanup-tag`, { stdio: 'pipe' })
  } catch {
    // Release doesn't exist yet — fine
  }

  // Create fresh release with the zip
  exec(`gh release create ${TAG} "${zipAbsolute}" --repo ${REPO} --title "Code Update (build ${newBuild})" --notes "${releaseBody.replace(/"/g, '\\"')}" --prerelease`)

  console.log(`\n✓ Deployed build ${newBuild} (v${PKG.version})`)
  console.log('  Users will see "Update available" within 30 minutes.')
  console.log('  Or they can check manually in Admin Panel → File Paths → Check Now.')

  // Clean up zip
  fs.unlinkSync(ZIP_PATH)
}

main()
