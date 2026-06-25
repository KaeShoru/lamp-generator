// ════════════════════════════════════════════════════════════════════
//  scripts/obfuscate.mjs
//  Post-build obfuscation for the production JS bundle.
//
//  Layered on top of Vite's minification:
//    1. ESBuild minifies (whitespace, mangle, dead-code).
//    2. javascript-obfuscator adds control-flow flattening, string-array
//       encryption, debug-protection, self-defending.
//
//  NOTE: obfuscation is NOT a security boundary — anyone determined enough
//  can still reverse it. The real secrets (Telegram bot token) live only
//  on the backend. This only raises the bar from "right-click → View Source"
//  to "spend several hours in a debugger".
// ════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JavaScriptObfuscator from 'javascript-obfuscator'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distAssetsDir = resolve(__dirname, '..', 'dist', 'assets')

if (!existsSync(distAssetsDir)) {
  console.error(`❌ dist/assets not found at ${distAssetsDir}. Run \`vite build\` first.`)
  process.exit(1)
}

const files = readdirSync(distAssetsDir).filter(f => f.endsWith('.js'))
console.log(`🔐 Obfuscating ${files.length} JS file(s) in ${distAssetsDir}`)

// Notes on tuning:
// - deadCodeInjection and splitStrings are DISABLED because they balloon the
//   bundle (1.3 MB → 14 MB) without meaningfully raising the reversal bar
//   once string-array encryption is already in play.
// - controlFlowFlattening kept at 0.5 — strong, but cheaper than 0.85.
// - debugProtection is risky on heavy apps (can throttle main thread); we
//   keep it on but raise the interval to avoid visible jank.
const options = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.5,
  deadCodeInjection: false,
  debugProtection: true,
  debugProtectionInterval: 4000,
  identifierNamesGenerator: 'hexadecimal',
  identifiersWithReassignedNames: true,
  minimizeAlphaNumericLiterals: true,
  renameGlobals: false,
  selfDefending: true,
  simplify: true,
  splitStrings: false,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayCallsTransformThreshold: 0.5,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 2,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  target: 'browser',
  transformObjectKeys: true,
  unicodeEscapeSequence: true,
}

let totalOriginal = 0
let totalObfuscated = 0

for (const file of files) {
  const filepath = join(distAssetsDir, file)
  const code = readFileSync(filepath, 'utf8')
  const originalSize = Buffer.byteLength(code)

  const result = JavaScriptObfuscator.obfuscate(code, {
    ...options,
    inputFileName: file,
  })
  const obfuscatedCode = result.getObfuscatedCode()
  const newSize = Buffer.byteLength(obfuscatedCode)

  writeFileSync(filepath, obfuscatedCode, 'utf8')
  totalOriginal += originalSize
  totalObfuscated += newSize
  console.log(`   ✓ ${file}: ${(originalSize / 1024).toFixed(1)} KB → ${(newSize / 1024).toFixed(1)} KB`)
}

console.log(`✅ Done. Total: ${(totalOriginal / 1024).toFixed(1)} KB → ${(totalObfuscated / 1024).toFixed(1)} KB`)
console.log(`   (overhead: +${((totalObfuscated - totalOriginal) / 1024).toFixed(1)} KB)`)