import { createServer } from 'vite'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import http from 'node:http'
import net from 'node:net'
import crypto from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const thisFile = fileURLToPath(import.meta.url)
const projectRoot = path.resolve(path.dirname(thisFile), '..')
const lockPath = path.join(projectRoot, '.lamp-generator.lock.json')

function isPidAlive(pid) {
  if (!pid || typeof pid !== 'number') return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function requestJson(url, timeoutMs = 650) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (data += c))
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : null
          resolve({ status: res.statusCode ?? 0, json })
        } catch (e) {
          reject(e)
        }
      })
    })
    req.on('timeout', () => {
      req.destroy(new Error('timeout'))
    })
    req.on('error', reject)
  })
}

function openBrowser(url) {
  const platform = process.platform
  if (platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true })
    return
  }
  if (platform === 'darwin') {
    spawn('open', [url], { stdio: 'ignore' })
    return
  }
  spawn('xdg-open', [url], { stdio: 'ignore' })
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      server.close(() => {
        if (!addr || typeof addr === 'string') return reject(new Error('bad address'))
        resolve(addr.port)
      })
    })
    server.on('error', reject)
  })
}

function readLock() {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'))
  } catch {
    return null
  }
}

function writeLock(lock) {
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2), 'utf8')
}

function removeLock() {
  try {
    fs.unlinkSync(lockPath)
  } catch {
    // ignore
  }
}

// 1) If already running: reuse it, don't spawn another server.
const existing = readLock()
if (existing?.port && isPidAlive(existing.pid)) {
  const url = `http://127.0.0.1:${existing.port}/__app/status`
  try {
    const { status } = await requestJson(url)
    if (status === 200) {
      const appUrl = `http://127.0.0.1:${existing.port}/`
      console.log(`Already running. Opening ${appUrl}`)
      openBrowser(appUrl)
      process.exit(0)
    }
  } catch {
    // fallthrough: stale lock or server not reachable
  }
}

// 2) Start new instance
removeLock()

const port = await findFreePort()
const token = crypto.randomBytes(16).toString('hex')
const startedAt = new Date().toISOString()
const pid = process.pid

const lock = {
  pid,
  port,
  token,
  startedAt,
  hostname: os.hostname(),
}
writeLock(lock)

let isShuttingDown = false

function cleanupAndExit(code = 0) {
  if (isShuttingDown) return
  isShuttingDown = true
  removeLock()
  process.exit(code)
}

process.on('SIGINT', () => cleanupAndExit(0))
process.on('SIGTERM', () => cleanupAndExit(0))
process.on('exit', () => removeLock())

const vite = await createServer({
  root: projectRoot,
  server: {
    host: '127.0.0.1',
    port,
    strictPort: true,
  },
})

vite.middlewares.use('/__app/status', (req, res) => {
  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ pid, port, startedAt, token }))
})

vite.middlewares.use('/__app/shutdown', async (req, res) => {
  const given = req.headers['x-lamp-token']
  if (given !== token) {
    res.statusCode = 401
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ ok: false, error: 'unauthorized' }))
    return
  }

  res.statusCode = 200
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ ok: true }))

  setTimeout(async () => {
    try {
      await vite.close()
    } finally {
      cleanupAndExit(0)
    }
  }, 150)
})

await vite.listen()

const appUrl = `http://127.0.0.1:${port}/`
console.log(`Running: ${appUrl}`)
console.log(`Token: ${token}`)
openBrowser(appUrl)

// Keep process alive
await new Promise(() => {})

