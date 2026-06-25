// ════════════════════════════════════════════════════════════════════
//  Lamp Generator — backend
//  Receives STL files + metadata and forwards them to Telegram.
// ════════════════════════════════════════════════════════════════════
import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import rateLimit from 'express-rate-limit'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Blob } from 'node:buffer'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Config from environment ────────────────────────────────────────
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID
const PORT = Number(process.env.PORT ?? 3000)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

// Auto-allow Railway public domain if available
if (process.env.RAILWAY_PUBLIC_DOMAIN) {
  ALLOWED_ORIGINS.push(`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`)
}
const PUBLIC_API_KEY = process.env.PUBLIC_API_KEY

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.warn('⚠️  TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set — /api/send-order will return 503. Set them in Railway Variables.')
}
if (!PUBLIC_API_KEY) {
  console.warn('⚠️  PUBLIC_API_KEY not set — API will be unauthenticated')
}

// ─── App setup ──────────────────────────────────────────────────────
const app = express()

app.set('trust proxy', 1)  // Railway runs behind a proxy

// CORS: allow the configured origins + same-origin (frontend served by this backend).
// We reflect the Origin back so same-origin requests on Railway's public domain work
// automatically without manually configuring every domain.
app.use(cors({
  origin: (origin, cb) => {
    // No Origin header (same-server curl/server-to-server) — allow
    if (!origin) return cb(null, true)
    // Explicitly allowed origins from env
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
    // Same-origin: Origin matches the Host header the client connected to
    // (frontend and backend share one domain on Railway)
    return cb(null, { origin: true })  // reflect origin — app is public
  },
  credentials: true,
}))

// Rate limit: 5 orders per minute per IP
const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many orders from this IP, please try again later' },
})
app.set('x-powered-by', false)

// Body parsing (multer for multipart, json for everything else)
app.use(express.json({ limit: '1mb' }))

// Multer: store in memory (we forward to Telegram, no need for disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60 MB — Telegram allows up to 50 MB for sendDocument
})

// ════════════════════════════════════════════════════════════════════
//  Auth middleware — checks the public Bearer token
// ════════════════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  if (!PUBLIC_API_KEY) return next()
  const auth = req.headers.authorization ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (token !== PUBLIC_API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ════════════════════════════════════════════════════════════════════
//  Sanitize filename components (no path separators, no weird chars)
// ════════════════════════════════════════════════════════════════════
function sanitize(s) {
  if (typeof s !== 'string') return 'unknown'
  // Allow letters (Latin + Cyrillic), digits, spaces, dashes, underscores
  return s.trim().slice(0, 60).replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '_') || 'unknown'
}

function nowIso() {
  // ISO 8601, but with `:` replaced by `-` so it's filename-safe
  return new Date().toISOString().replace(/[:.]/g, '-')
}

// ════════════════════════════════════════════════════════════════════
//  POST /api/send-order
//  multipart/form-data:
//    - customerName : string (required)
//    - orderTitle   : string (required)
//    - file         : binary STL (required)
// ════════════════════════════════════════════════════════════════════
app.post('/api/send-order',
  authMiddleware,
  orderLimiter,
  upload.single('file'),
  async (req, res) => {
    try {
      if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        return res.status(503).json({ error: 'Telegram credentials not configured on the server' })
      }
      const customerName = sanitize(req.body.customerName)
      const orderTitle = sanitize(req.body.orderTitle)
      const file = req.file

      if (!file) return res.status(400).json({ error: 'Missing STL file' })
      if (!customerName || !orderTitle) return res.status(400).json({ error: 'Missing customerName or orderTitle' })

      // MIME check — multer gives the file as application/octet-stream by default
      // for STL, so we just check the extension that the client provided.
      const originalExt = path.extname(file.originalname).toLowerCase()
      if (originalExt !== '.stl') {
        return res.status(400).json({ error: `Expected .stl file, got ${originalExt}` })
      }

      // Build filename: Order-<Name>-<Title>-<Time>.stl
      const filename = `Order-${customerName}-${orderTitle}-${nowIso()}.stl`

      // Forward to Telegram using multipart/form-data (Bot API: sendDocument)
      const tgRes = await sendDocumentToTelegram({
        chatId: TELEGRAM_CHAT_ID,
        fileBuffer: file.buffer,
        filename,
        caption: `📦 <b>New lamp order</b>\n\n👤 <b>Name:</b> ${escapeHtml(customerName)}\n🏷 <b>Title:</b> ${escapeHtml(orderTitle)}\n📏 <b>Size:</b> ${(file.size / 1024).toFixed(1)} KB\n🕒 <b>Time:</b> ${new Date().toLocaleString()}`,
      })

      if (!tgRes.ok) {
        const errText = await tgRes.text()
        console.error('Telegram error:', errText)
        return res.status(502).json({ error: 'Telegram rejected the request', detail: errText })
      }

      const tgJson = await tgRes.json()
      if (!tgJson.ok) {
        console.error('Telegram API returned !ok:', tgJson)
        return res.status(502).json({ error: 'Telegram API error', detail: tgJson.description })
      }

      return res.json({ ok: true, document: tgJson.result?.document?.file_id ?? null })
    } catch (err) {
      console.error('Order handler error:', err)
      return res.status(500).json({ error: 'Internal server error' })
    }
  },
)

// ════════════════════════════════════════════════════════════════════
//  Helper — escape HTML for Telegram caption
// ════════════════════════════════════════════════════════════════════
function escapeHtml(s) {
  return s
    .replace(/&/g, '\u0026amp;')   // &
    .replace(/</g, '\u0026lt;')    // <
    .replace(/>/g, '\u0026gt;')    // >
}

// ════════════════════════════════════════════════════════════════════
//  Send a document to Telegram via Bot API
// ════════════════════════════════════════════════════════════════════
async function sendDocumentToTelegram({ chatId, fileBuffer, filename, caption }) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`

  // Build multipart/form-data manually (we use Node's Blob)
  const boundary = '----LampGeneratorBoundary' + Math.random().toString(16).slice(2)

  const parts = []
  // chat_id
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="chat_id"\r\n\r\n${chatId}\r\n`)
  // caption
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="caption"\r\n\r\n${caption}\r\n`)
  // parse_mode
  parts.push(`--${boundary}\r\nContent-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n`)
  // document (file)
  parts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="document"; filename="${filename}"\r\nContent-Type: model/stl\r\n\r\n`,
  )

  const headerBuf = Buffer.from(parts.join(''), 'utf-8')
  const tailBuf = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
  const bodyBuf = Buffer.concat([headerBuf, fileBuffer, tailBuf])

  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body: bodyBuf,
  })
}

// ════════════════════════════════════════════════════════════════════
//  Health check
// ════════════════════════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() })
})

// ════════════════════════════════════════════════════════════════════
//  Public config — gives the frontend the API key at runtime.
//  This avoids the need for VITE_PUBLIC_API_KEY at build time (which
//  Railway doesn't inject into the Docker build stage).
// ════════════════════════════════════════════════════════════════════
app.get('/api/config', (req, res) => {
  res.json({ apiKey: PUBLIC_API_KEY ?? '' })
})

// ════════════════════════════════════════════════════════════════════
//  Serve the frontend static files in production
//  (built React app lands in ../dist by `npm run build` at the root)
// ════════════════════════════════════════════════════════════════════
const distDir = path.resolve(__dirname, '..', 'dist')
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir, { maxAge: '1h', index: false }))
  // SPA fallback — any non-API route returns index.html
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
  console.log(`📦 Serving frontend from ${distDir}`)
} else {
  console.log('ℹ️  No dist/ folder found — running in API-only mode (dev)')
}

// ════════════════════════════════════════════════════════════════════
//  Global error handler
// ════════════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err)
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'STL file is too large (max 60 MB)' })
    }
    return res.status(400).json({ error: err.message })
  }
  if (err?.message?.includes('CORS')) {
    return res.status(403).json({ error: err.message })
  }
  return res.status(500).json({ error: 'Internal server error' })
})

app.listen(PORT, () => {
  console.log(`✅ Lamp Generator backend listening on port ${PORT}`)
  console.log(`   Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`)
})