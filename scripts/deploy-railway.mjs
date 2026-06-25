#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════
//  Lamp Generator — Railway deploy script
//
//  Automates the full Railway CLI deploy flow:
//    1. Check Railway CLI is installed and authenticated
//    2. Read secrets from local .env (NEVER committed)
//    3. Link to existing project OR create a new one on first run
//    4. Push secrets as Railway variables (idempotent)
//    5. Deploy via `railway up` (uses railway.json → Dockerfile)
//    6. Print the public URL
//
//  Usage:
//    npm run deploy:railway                # interactive project link
//    npm run deploy:railway -- --env prod  # explicit env (dev/staging/prod)
//    npm run deploy:railway -- --no-vars   # skip pushing variables
//    npm run deploy:railway -- --no-open   # don't open browser at the end
//
//  Prereq:
//    - Run `npm install -g @railway/cli` once
//    - Have a local .env with TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, etc.
// ════════════════════════════════════════════════════════════════════
import { execSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ─── Parse CLI args ─────────────────────────────────────────────────
const args = process.argv.slice(2)
const FLAG_NO_VARS   = args.includes('--no-vars')
const FLAG_NO_OPEN   = args.includes('--no-open')
const ENV_NAME = (args.find(a => a.startsWith('--env='))?.split('=')[1]) ?? ''
const SERVICE_NAME = (args.find(a => a.startsWith('--service='))?.split('=')[1]) ?? ''

// ─── Tiny helpers ───────────────────────────────────────────────────
const log = (s) => console.log(s)
const ok  = (s) => console.log(`\x1b[32m✓\x1b[0m ${s}`)
const err = (s) => { console.error(`\x1b[31m✗\x1b[0m ${s}`); process.exit(1) }
const hdr = (s) => console.log(`\n\x1b[36m━━━ ${s} ━━━\x1b[0m`)

/**
 * Run a command, inherit stdio (so user sees live output and can answer prompts).
 * Returns the exit code. Throws on cd errors.
 */
function run(cmd, opts = {}) {
  return spawnSync(cmd, {
    shell: true,
    stdio: 'inherit',
    cwd: ROOT,
    ...opts,
  }).status
}

/**
 * Run a command and capture stdout (trimmed). Returns '' on failure.
 */
function capture(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

// ─── .env parser (mirrors dotenv semantics — KEY=VALUE, # comments) ─
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const rawLine of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    // Strip surrounding quotes
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

// ════════════════════════════════════════════════════════════════════
//  Main
// ════════════════════════════════════════════════════════════════════
async function main() {
  hdr('Railway deploy — Lamp Generator')

  // ─── Step 1: CLI present? ────────────────────────────────────────
  const version = capture('railway --version')
  if (!version) {
    err('Railway CLI not found. Install with:\n  npm install -g @railway/cli')
  }
  ok(`Railway CLI: ${version}`)

  // ─── Step 2: Authenticated? ──────────────────────────────────────
  hdr('Authentication')
  const whoami = capture('railway whoami')
  if (!whoami || /not logged in|unauthorized/i.test(whoami)) {
    log('  Browser will open to complete Railway login…')
    const code = run('railway login')
    if (code !== 0) err('railway login failed')
    const re = capture('railway whoami')
    if (!re) err('Still not authenticated — aborting')
    ok(`Logged in as: ${re}`)
  } else {
    ok(`Already logged in as: ${whoami}`)
  }

  // ─── Step 3: Link to project ─────────────────────────────────────
  hdr('Project link')
  // `railway link` is interactive (lists projects + environments + services).
  // On first run, user picks project. The choice is persisted to .railway/
  // by the CLI itself, so subsequent runs are no-ops.
  const envArg    = ENV_NAME    ? `--environment ${ENV_NAME}`    : ''
  const serviceArg = SERVICE_NAME ? `--service ${SERVICE_NAME}` : ''
  const linkCmd = `railway link ${envArg} ${serviceArg}`.trim()
  log(`  Running: ${linkCmd}`)
  const linkCode = run(linkCmd)
  if (linkCode !== 0) {
    log('  `railway link` returned non-zero — trying `railway init` (new project)')
    const initCode = run('railway init')
    if (initCode !== 0) err('Could not link or init a Railway project')
  }
  ok('Project linked')

  // ─── Step 4: Push secrets as Railway variables ──────────────────
  if (!FLAG_NO_VARS) {
    hdr('Variables (from local .env)')
    const envPath = path.join(ROOT, '.env')
    const envVars = parseEnv(envPath)
    const secretKeys = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'ALLOWED_ORIGINS', 'PUBLIC_API_KEY']
    const toPush = secretKeys
      .filter(k => envVars[k] != null && envVars[k] !== '')
      .map(k => `${k}=${envVars[k]}`)

    if (toPush.length === 0) {
      log('  No secrets found in .env — skipping (use --no-vars to silence)')
    } else {
      // Use `railway variables --kv` to set all at once (works on Railway CLI 5+).
      // Note: this DOES NOT print values to the terminal — only keys.
      const setCmd = `railway variables --kv ${toPush.map(v => `"${v}"`).join(' ')}`
      log(`  Pushing ${toPush.length} secrets: ${secretKeys.filter(k => envVars[k]).join(', ')}`)
      const code = run(setCmd)
      if (code !== 0) {
        // Fallback: set them one at a time
        log('  Bulk set failed — retrying one-by-one')
        for (const kv of toPush) {
          run(`railway variables set "${kv}"`)
        }
      }
      ok('Variables synced')
    }

    // PORT — Railway injects automatically, but make explicit for clarity.
    // Don't override if user already set it.
    if (!envVars.PORT) {
      log('  PORT not in .env — Railway will inject automatically')
    }
  } else {
    log('\n  (skipping variables — --no-vars)')
  }

  // ─── Step 5: Deploy! ─────────────────────────────────────────────
  hdr('Deploy')
  // `railway up` reads railway.json → uses Dockerfile builder.
  // --detach returns immediately (don't stream build logs to keep output clean).
  // The build will continue on Railway's servers; we'll poll the status.
  log('  Uploading source + building on Railway…')
  const upCode = run('railway up --detach')
  if (upCode !== 0) err('railway up failed')

  // ─── Step 6: Get the public URL ──────────────────────────────────
  hdr('Public URL')
  // `railway domain` prints the deployed URL (and can provision one if missing).
  if (!FLAG_NO_OPEN) {
    const url = capture('railway domain --random')
    if (url) {
      ok(`Deployed at: ${url}`)
      // Open in default browser
      const openCmd = process.platform === 'win32'
        ? `start ""`
        : process.platform === 'darwin'
        ? `open`
        : `xdg-open`
      run(`${openCmd} "${url}" >nul 2>&1`, { stdio: 'ignore' })
    } else {
      log('  No domain found — run `railway domain` manually to provision one')
    }
  } else {
    log('  (skipping browser open — --no-open)')
  }

  hdr('Done')
  log('  Monitor the build:  railway logs')
  log('  Open dashboard:     railway open')
  log('  Redeploy:           npm run deploy:railway')
  console.log()
}

main().catch((e) => {
  console.error('\n💥 Deploy failed:', e)
  process.exit(1)
})