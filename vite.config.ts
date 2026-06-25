import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
//
// Production hardening:
//   - No source maps (sourcemap: false)
//   - esbuild minify (whitespace + identifier mangling)
//   - Post-build obfuscation via javascript-obfuscator (scripts/obfuscate.mjs)
//     which also handles debug-protection, string-array encryption, etc.
export default defineConfig({
  plugins: [react()],
  // Backend serves the frontend from the root URL.
  base: '/',
  build: {
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
})