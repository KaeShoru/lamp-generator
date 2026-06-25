// ════════════════════════════════════════════════════════════════════
//  src/api.ts
//  Frontend API client — sends the generated STL to the backend, which
//  forwards it to Telegram.
// ════════════════════════════════════════════════════════════════════

/**
 * The base URL of the backend API.
 *
 * In dev, Vite serves the frontend on port 5173 and the backend on port 3000.
 * We hardcode localhost:3000 for dev. In production, the backend serves the
 * frontend statically, so same-origin "/api" works.
 */
const API_BASE =
  typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : ''

/**
 * Public API key sent as a Bearer token. This is NOT a secret — it only exists
 * to prevent random strangers from hitting the endpoint directly. The real
 * secret (Telegram bot token) lives on the backend.
 *
 * Fetched at runtime from /api/config so the key isn't baked into the JS
 * bundle at build time (Railway doesn't inject VITE_ vars during Docker build).
 */
let _cachedApiKey: string | null = null

async function getApiKey(): Promise<string> {
  if (_cachedApiKey !== null) return _cachedApiKey
  let key = ''
  try {
    const res = await fetch(`${API_BASE}/api/config`)
    if (res.ok) {
      const json = await res.json()
      key = json.apiKey ?? ''
    }
  } catch {
    // keep default ''
  }
  _cachedApiKey = key
  return key
}

export type OrderProgress = (loadedBytes: number, totalBytes: number) => void

export type SendOrderResult =
  | { ok: true; documentId: string | null }
  | { ok: false; error: string }

/**
 * Send an STL file (as a Blob) plus customer info to the backend.
 *
 * @param stlBlob       Binary STL data (Blob).
 * @param customerName  Customer's name (sanitized server-side).
 * @param orderTitle    Order title (sanitized server-side).
 * @param onProgress    Optional progress callback for upload UX.
 */
export async function sendOrder(
  stlBlob: Blob,
  customerName: string,
  orderTitle: string,
  onProgress?: OrderProgress,
): Promise<SendOrderResult> {
  if (!customerName.trim()) return { ok: false, error: 'Имя обязательно / Name is required' }
  if (!orderTitle.trim()) return { ok: false, error: 'Название обязательно / Title is required' }
  if (stlBlob.size === 0) return { ok: false, error: 'STL пуст / STL is empty' }

  // Fetch the API key at runtime (avoids baking it into the JS bundle).
  const apiKey = await getApiKey()

  // Use XHR instead of fetch to get upload progress events.
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/api/send-order`)
    if (apiKey) xhr.setRequestHeader('Authorization', `Bearer ${apiKey}`)

    // Upload progress
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(ev.loaded, ev.total)
      }
    }

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300 && json.ok) {
          resolve({ ok: true, documentId: json.document ?? null })
        } else {
          resolve({ ok: false, error: json.error ?? `Server error (${xhr.status})` })
        }
      } catch {
        resolve({ ok: false, error: `Bad response (${xhr.status})` })
      }
    }

    xhr.onerror = () => resolve({ ok: false, error: 'Network error' })
    xhr.ontimeout = () => resolve({ ok: false, error: 'Timeout' })

    const form = new FormData()
    form.append('customerName', customerName.trim())
    form.append('orderTitle', orderTitle.trim())
    form.append('file', stlBlob, 'shade.stl')

    xhr.send(form)
  })
}