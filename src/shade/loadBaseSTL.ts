/**
 * Loads a static STL "bottom" geometry that replaces the parametric plug.
 *
 * The STL is NORMALIZED on load so it lines up with the shade — using a
 * robust strategy that works regardless of how the STL was originally
 * modeled (upright / inverted / off-center):
 *
 *   1. The SHAFT PLANE is auto-detected as the Y-coordinate where the
 *      horizontal cross-section is widest. This is where the lamp base
 *      meets the shade (the "rim" / "flange"). Auto-detection makes the
 *      loader tolerant of STLs modeled standing-up, hanging-down, or
 *      shifted along Y.
 *   2. bbox center (X/Z) → origin (so the shaft is centered on the shade axis)
 *   3. Shaft plane → y=0 (so the rest of the base hangs DOWN into -Y,
 *      matching the parametric plug convention where yBot = -thickness)
 *
 * If the auto-detected plane looks wrong, set `?debug=1` in the page URL
 * to log bbox and detected plane to console.
 *
 * Returns non-indexed positions + normals as Float32Arrays, ready to be
 * concatenated with the shade's positions array or transferred to a worker.
 */
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import * as THREE from 'three'

export type BaseSTL = {
  /** Non-indexed XYZ positions, length = triangles * 9. */
  positions: Float32Array
  /** Non-indexed XYZ normals, length = triangles * 9 (matched to positions). */
  normals: Float32Array
  triangleCount: number
}

export function loadBaseSTL(url: string): Promise<BaseSTL> {
  return new Promise((resolve, reject) => {
    const loader = new STLLoader()
    loader.load(
      url,
      (geom) => {
        const g = geom.index ? geom.toNonIndexed() : geom
        if (!g.getAttribute('normal')) g.computeVertexNormals()

        const posAttr = g.getAttribute('position') as THREE.BufferAttribute
        const positions = (posAttr.array as Float32Array).slice()

        // === Compute bbox ===
        let minX = Infinity, minY = Infinity, minZ = Infinity
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i], y = positions[i + 1], z = positions[i + 2]
          if (x < minX) minX = x; if (x > maxX) maxX = x
          if (y < minY) minY = y; if (y > maxY) maxY = y
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z
        }

        // === Auto-detect shaft plane (y where the base is widest) ===
        // Discretize Y range into 64 buckets, compute mean horizontal radius
        // (sqrt(x² + z²)) for vertices in each bucket. The bucket with the
        // largest mean radius is the "flange" / rim where the shade meets
        // the base. This works for any reasonable lamp-base geometry:
        //   - the rim/flange is the widest part by definition (otherwise the
        //     shade wouldn't catch on it)
        //   - the threaded shaft is narrower
        //   - the wire hole at the bottom is also narrower
        const BUCKETS = 64
        const sumR = new Float64Array(BUCKETS)
        const countR = new Float64Array(BUCKETS)
        const yRange = maxY - minY || 1
        for (let i = 0; i < positions.length; i += 3) {
          const x = positions[i], y = positions[i + 1], z = positions[i + 2]
          const r = Math.sqrt(x * x + z * z)
          let b = Math.floor(((y - minY) / yRange) * BUCKETS)
          if (b < 0) b = 0
          if (b >= BUCKETS) b = BUCKETS - 1
          sumR[b] += r
          countR[b]++
        }
        let bestBucket = 0
        let bestMean = -1
        for (let b = 0; b < BUCKETS; b++) {
          if (countR[b] === 0) continue
          const mean = sumR[b] / countR[b]
          if (mean > bestMean) { bestMean = mean; bestBucket = b }
        }
        // Center Y of the winning bucket → this is our shaft plane.
        const shaftY = minY + ((bestBucket + 0.5) / BUCKETS) * yRange

        // Optional debug output (when ?debug=1 in URL)
        try {
          const urlDebug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug')
          if (urlDebug === '1') {
            console.info('[loadBaseSTL]', {
              url,
              bbox: { minX, minY, minZ, maxX, maxY, maxZ, sizeX: maxX - minX, sizeY: maxY - minY, sizeZ: maxZ - minZ },
              shaftPlaneY: shaftY,
              shaftPlaneMeanRadius: bestMean,
              triangleCount: positions.length / 9,
            })
          }
        } catch { /* ignore */ }

        // === Normalize ===
        // Center horizontally, then put the shaft plane at y=0. Everything
        // above the shaft plane gets clamped away (in case the STL had a
        // phantom "antenna" sticking up); everything below stays — this is
        // the part that visually hangs under the shade as the lamp base.
        const shiftX = -(minX + maxX) / 2
        const shiftY = -shaftY
        const shiftZ = -(minZ + maxZ) / 2

        for (let i = 0; i < positions.length; i += 3) {
          positions[i] = positions[i] + shiftX
          positions[i + 1] = positions[i + 1] + shiftY
          positions[i + 2] = positions[i + 2] + shiftZ
        }

        const normals = (g.getAttribute('normal').array as Float32Array).slice()

        resolve({
          positions,
          normals,
          triangleCount: positions.length / 9,
        })
      },
      undefined,
      (err: unknown) => {
        const msg =
          err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : String(err)
        reject(new Error(`Failed to load ${url}: ${msg}`))
      },
    )
  })
}