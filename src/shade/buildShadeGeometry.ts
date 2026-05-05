import * as THREE from 'three'
import type { ShadeParams } from './types'

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function gaussian(t: number, mu: number, sigma: number) {
  const x = (t - mu) / sigma
  return Math.exp(-0.5 * x * x)
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function profileRadius(params: ShadeParams, t: number) {
  const baseR = params.baseDiameter / 2
  const topR = params.topDiameter / 2
  const linear = lerp(baseR, topR, t)
  const bulge = params.bulgeMm * gaussian(t, params.bulgePos, 0.18)
  const waist = -params.waistMm * gaussian(t, params.waistPos, 0.16)
  return Math.max(1, linear + bulge + waist)
}

function twistAt(params: ShadeParams, t: number) {
  const total = THREE.MathUtils.degToRad(params.twistDeg)
  switch (params.twistProfile) {
    case 'easeInOut': {
      const tt = t * t * (3 - 2 * t)
      return total * tt
    }
    case 'sine':
      return total * (0.5 - 0.5 * Math.cos(Math.PI * t))
    default:
      return total * t
  }
}

function patternDelta(params: ShadeParams, theta: number, t: number, mirror = false) {
  const amp = params.patternAmpMm
  if (amp <= 0) return 0
  const w = params.patternFreq * theta
  // Mirror reverses the slope (negate y component) for wave/accordion/grooves
  const y = (mirror ? -1 : 1) * params.patternYFreq * (Math.PI * 2) * t
  switch (params.pattern) {
    case 'ribsRect': {
      // Square wave ribs based on theta; mirror call uses same formula
      // (the caller shifts theta by -2*twist for opposite twist direction)
      const c = Math.cos(w)
      return amp * (c >= 0 ? 1 : -1)
    }
    case 'wave':
      return amp * Math.cos(w + y)
    case 'accordionTri': {
      // triangle wave in [-1..1]
      const s = Math.sin(w)
      const tri = (2 / Math.PI) * Math.asin(s)
      const env = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(y))
      return amp * env * tri
    }
    case 'groovesRound': {
      // rounded grooves: mostly smooth, with narrow negative cuts
      const c = 0.5 + 0.5 * Math.cos(w)
      const groove = Math.pow(c, 4) // 0..1, narrow peaks
      return -amp * groove
    }
    case 'groovesT':
      // T-ridges are generated as separate geometry, not via radius modulation
      return 0
    default:
      return 0
  }
}

/** Spiral veins: thick braids spiraling around the lamp */
function veinDelta(params: ShadeParams, theta: number, t: number) {
  if (!params.veinsEnabled || params.veinAmplitudeMm <= 0) return 0
  const count = Math.max(2, Math.round(params.veinCount))
  const baseTurns = params.veinTurns
  // Tilt: 0° = vertical (no spiral), ±90° = full spiral from baseTurns
  const tiltDeg = params.veinTiltDeg ?? 0
  const effectiveTurns = baseTurns * (tiltDeg / 90)
  const amp = params.veinAmplitudeMm
  // Width controls how narrow each vein is (lower = narrower)
  const width = Math.max(0.05, params.veinWidth)
  // Valley depth between veins (like waist but for veins)
  const valley = params.veinValleyMm ?? 0

  let total = 0
  for (let k = 0; k < count; k++) {
    // Each vein spirals: its center angle at effective height
    const phase = (k / count) * Math.PI * 2
    const center = phase + effectiveTurns * Math.PI * 2 * t
    // Angular distance from vein center
    let diff = theta - center
    // Normalize to [-PI..PI]
    diff = diff - Math.round(diff / (Math.PI * 2)) * Math.PI * 2
    // Gaussian-like envelope based on width
    const x = diff / (width * (Math.PI * 2 / count) * 0.5)
    const envelope = Math.exp(-0.5 * x * x)
    total += envelope
  }
  const bump = amp * Math.min(total, 1.2)
  // Valley: subtract between veins (where total is low)
  const valleyFactor = Math.max(0, 1 - total / count * count * 0.5) // peaks at 1 between veins, 0 at vein center
  return bump - valley * valleyFactor
}

export function buildShadeGeometry(params: ShadeParams, extraSmoothPasses = 0) {
  const thickness = Math.max(0.8, params.thickness)
  const height = Math.max(10, params.height)
  const baseDiameter = Math.max(6, params.baseDiameter)
  const topDiameter = Math.max(4, params.topDiameter)

  const normalized: ShadeParams = {
    ...params,
    height,
    baseDiameter,
    topDiameter,
    thickness,
  }

  const radialSegments = clamp(Math.round(normalized.radialSegments), 12, 400)
  const heightSegments = clamp(Math.round(normalized.heightSegments), 4, 240)
  const maxOverhangRad = THREE.MathUtils.degToRad(clamp(normalized.maxOverhangDeg, 5, 89))
  const dy = height / heightSegments
  const maxDelta = dy * Math.tan(maxOverhangRad)

  // Radii grid (no seam duplicate); enforce overhang per-theta along height.
  const rGrid: number[][] = Array.from({ length: heightSegments + 1 }, () =>
    Array.from({ length: radialSegments }, () => 0),
  )
  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments
    const base = profileRadius(normalized, t)
    for (let j = 0; j < radialSegments; j++) {
      const theta = (j / radialSegments) * Math.PI * 2
      // Order: profile → veins (part of form) → pattern (texture) → mirror pattern
      const veins = veinDelta(normalized, theta, t)
      const pat = patternDelta(normalized, theta, t)
      // Mirror: true vertical-axis reflection → theta maps to -theta, twist negated
      const mirrorTheta = -theta - 2 * twistAt(normalized, t)
      const mirror = normalized.patternMirror ? patternDelta(normalized, mirrorTheta, t, true) : 0
      // Clamp combined pattern depth to ±amp (no doubling at crossings)
      const amp = normalized.patternAmpMm
      // Edge taper for non-T patterns to prevent elephant foot (optional)
      const edgeFade = normalized.patternEdgeFade ? smoothstep(0, 0.08, t) * smoothstep(0, 0.08, 1 - t) : 1
      const combined = clamp((pat + mirror) * edgeFade, -amp, amp)
      rGrid[i][j] = Math.max(1, base + veins + combined)
    }
  }
  for (let j = 0; j < radialSegments; j++) {
    for (let i = 1; i <= heightSegments; i++) {
      const prev = rGrid[i - 1][j]
      let cur = rGrid[i][j]
      const d = cur - prev
      if (d > maxDelta) cur = prev + maxDelta
      if (d < -maxDelta) cur = prev - maxDelta
      rGrid[i][j] = Math.max(1, cur)
    }
  }

  // Smoothing passes: 2 base passes + extraSmoothPasses additional ones
  // Base passes prevent polygon crumbling; extra passes smooth for export
  const totalSmoothPasses = 2 + extraSmoothPasses
  for (let pass = 0; pass < totalSmoothPasses; pass++) {
    const smoothed: number[][] = Array.from({ length: heightSegments + 1 }, (_, i) =>
      Array.from({ length: radialSegments }, (_, j) => rGrid[i][j]),
    )
    for (let i = 1; i < heightSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        const jm = (j - 1 + radialSegments) % radialSegments
        const jp = (j + 1) % radialSegments
        // 5-point Laplacian: self + 4 neighbors, weighted blend
        const avg = (
          rGrid[i][j] * 2 +
          rGrid[i - 1][j] +
          rGrid[i + 1][j] +
          rGrid[i][jm] +
          rGrid[i][jp]
        ) / 6
        // Blend 50/50 between original and smoothed to preserve detail
        smoothed[i][j] = Math.max(1, (rGrid[i][j] + avg) / 2)
      }
    }
    // Also smooth boundary rows to prevent elephant foot
    for (let j = 0; j < radialSegments; j++) {
      const jm = (j - 1 + radialSegments) % radialSegments
      const jp = (j + 1) % radialSegments
      // Row 0: one-sided (only row 1 available above)
      const avg0 = (rGrid[0][j] * 2 + rGrid[1][j] + rGrid[0][jm] + rGrid[0][jp]) / 5
      smoothed[0][j] = Math.max(1, (rGrid[0][j] + avg0) / 2)
      // Row heightSegments: one-sided (only row heightSegments-1 available below)
      const avgN = (rGrid[heightSegments][j] * 2 + rGrid[heightSegments-1][j] + rGrid[heightSegments][jm] + rGrid[heightSegments][jp]) / 5
      smoothed[heightSegments][j] = Math.max(1, (rGrid[heightSegments][j] + avgN) / 2)
    }
    for (let i = 0; i <= heightSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        rGrid[i][j] = smoothed[i][j]
      }
    }
  }

  const pos: number[] = []

  const pushTri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz)
  }

  const v = (r: number, theta: number, y: number) => {
    const x = r * Math.cos(theta)
    const z = r * Math.sin(theta)
    return [x, y, z] as const
  }

  // Outer surface
  for (let i = 0; i < heightSegments; i++) {
    const y0 = (i / heightSegments) * height
    const y1 = ((i + 1) / heightSegments) * height
    const t0 = i / heightSegments
    const t1 = (i + 1) / heightSegments
    const twist0 = twistAt(normalized, t0)
    const twist1 = twistAt(normalized, t1)
    
    for (let j = 0; j < radialSegments; j++) {
      const j1 = (j + 1) % radialSegments
      const th0 = (j / radialSegments) * Math.PI * 2
      const th1 = (j1 / radialSegments) * Math.PI * 2
      const r00 = rGrid[i][j]
      const r01 = rGrid[i][j1]
      const r10 = rGrid[i + 1][j]
      const r11 = rGrid[i + 1][j1]

      const a = v(r00, th0 + twist0, y0)
      const b = v(r10, th0 + twist1, y1)
      const c = v(r01, th1 + twist0, y0)
      const d = v(r11, th1 + twist1, y1)

      // a-b-c and b-d-c
      pushTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
      pushTri(b[0], b[1], b[2], d[0], d[1], d[2], c[0], c[1], c[2])
    }
  }

  // Inner surface (reverse winding)
  for (let i = 0; i < heightSegments; i++) {
    const y0 = (i / heightSegments) * height
    const y1 = ((i + 1) / heightSegments) * height
    const t0 = i / heightSegments
    const t1 = (i + 1) / heightSegments
    const twist0 = twistAt(normalized, t0)
    const twist1 = twistAt(normalized, t1)
    
    for (let j = 0; j < radialSegments; j++) {
      const j1 = (j + 1) % radialSegments
      const th0 = (j / radialSegments) * Math.PI * 2
      const th1 = (j1 / radialSegments) * Math.PI * 2
      const r00 = Math.max(0.8, rGrid[i][j] - thickness)
      const r01 = Math.max(0.8, rGrid[i][j1] - thickness)
      const r10 = Math.max(0.8, rGrid[i + 1][j] - thickness)
      const r11 = Math.max(0.8, rGrid[i + 1][j1] - thickness)

      const a = v(r00, th0 + twist0, y0)
      const b = v(r10, th0 + twist1, y1)
      const c = v(r01, th1 + twist0, y0)
      const d = v(r11, th1 + twist1, y1)

      // reverse: c-b-a and c-d-b
      pushTri(c[0], c[1], c[2], b[0], b[1], b[2], a[0], a[1], a[2])
      pushTri(c[0], c[1], c[2], d[0], d[1], d[2], b[0], b[1], b[2])
    }
  }

  // Caps (seal top/base) as annular rings between outer and inner radii

  const addCap = (y: number, holeR: number, outwardUp: boolean, extraR = 0) => {
    const t = height > 0 ? y / height : 0
    const twist = twistAt(normalized, t)
    
    for (let j = 0; j < radialSegments; j++) {
      const j1 = (j + 1) % radialSegments
      const th0 = (j / radialSegments) * Math.PI * 2
      const th1 = (j1 / radialSegments) * Math.PI * 2
      const rBase0 = y === 0 ? rGrid[0][j] : rGrid[heightSegments][j]
      const rBase1 = y === 0 ? rGrid[0][j1] : rGrid[heightSegments][j1]
      const rOuter0 = rBase0 + extraR
      const rOuter1 = rBase1 + extraR
      // Inner radius from base (not extended) so cap seals to inner wall
      const rInner0Base = Math.max(0.8, rBase0 - thickness)
      const rInner1Base = Math.max(0.8, rBase1 - thickness)
      const rInner0 = Math.max(rInner0Base, holeR)
      const rInner1 = Math.max(rInner1Base, holeR)

      const o0 = v(rOuter0, th0 + twist, y)
      const o1 = v(rOuter1, th1 + twist, y)
      const i0 = v(rInner0, th0 + twist, y)
      const i1 = v(rInner1, th1 + twist, y)

      if (outwardUp) {
        pushTri(o0[0], o0[1], o0[2], i0[0], i0[1], i0[2], o1[0], o1[1], o1[2])
        pushTri(o1[0], o1[1], o1[2], i0[0], i0[1], i0[2], i1[0], i1[1], i1[2])
      } else {
        pushTri(o1[0], o1[1], o1[2], i0[0], i0[1], i0[2], o0[0], o0[1], o0[2])
        pushTri(i1[0], i1[1], i1[2], i0[0], i0[1], i0[2], o1[0], o1[1], o1[2])
      }
    }
  }

  // Top cap (always thin, solid)
  addCap(height, 0, true)

  // Bottom plug: thick base seal + bottom circle
  if (normalized.bottomPlug) {
    const plugT = Math.max(0.6, normalized.bottomPlugThickness)
    const plugHoleR = Math.max(0, (normalized.bottomPlugHoleDiameter ?? 0) / 2)
    const plugShape = normalized.bottomPlugShape ?? 'follow'
    const plugCircleR = Math.max(1, (normalized.bottomPlugDiameter ?? baseDiameter) / 2)
    const yTop = 0
    const yBot = -plugT

    // === THICK BASE SEAL ===
    // Top face at y=0 (facing up)
    for (let j = 0; j < radialSegments; j++) {
      const j1 = (j + 1) % radialSegments
      const th0 = (j / radialSegments) * Math.PI * 2
      const th1 = (j1 / radialSegments) * Math.PI * 2
      const rOuter0 = rGrid[0][j]
      const rOuter1 = rGrid[0][j1]
      const rInner0 = Math.max(0.8, plugHoleR)
      const rInner1 = Math.max(0.8, plugHoleR)

      const o0 = v(rOuter0, th0, yTop)
      const o1 = v(rOuter1, th1, yTop)
      const i0 = v(rInner0, th0, yTop)
      const i1 = v(rInner1, th1, yTop)

      pushTri(o0[0], o0[1], o0[2], i0[0], i0[1], i0[2], o1[0], o1[1], o1[2])
      pushTri(o1[0], o1[1], o1[2], i0[0], i0[1], i0[2], i1[0], i1[1], i1[2])
    }

    // Bottom face of thick seal at yBot (facing down)
    for (let j = 0; j < radialSegments; j++) {
      const j1 = (j + 1) % radialSegments
      const th0 = (j / radialSegments) * Math.PI * 2
      const th1 = (j1 / radialSegments) * Math.PI * 2
      const rOuter0 = rGrid[0][j]
      const rOuter1 = rGrid[0][j1]
      const rInner0 = Math.max(0.8, plugHoleR)
      const rInner1 = Math.max(0.8, plugHoleR)

      const o0 = v(rOuter0, th0, yBot)
      const o1 = v(rOuter1, th1, yBot)
      const i0 = v(rInner0, th0, yBot)
      const i1 = v(rInner1, th1, yBot)

      pushTri(o1[0], o1[1], o1[2], i0[0], i0[1], i0[2], o0[0], o0[1], o0[2])
      pushTri(i1[0], i1[1], i1[2], i0[0], i0[1], i0[2], o1[0], o1[1], o1[2])
    }

    // Outer wall of thick seal (vertical wall at lamp surface)
    for (let j = 0; j < radialSegments; j++) {
      const j1 = (j + 1) % radialSegments
      const th0 = (j / radialSegments) * Math.PI * 2
      const th1 = (j1 / radialSegments) * Math.PI * 2
      const r0 = rGrid[0][j]
      const r1 = rGrid[0][j1]

      const a = v(r0, th0, yBot)
      const b = v(r0, th0, yTop)
      const c = v(r1, th1, yBot)
      const d = v(r1, th1, yTop)

      pushTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
      pushTri(b[0], b[1], b[2], d[0], d[1], d[2], c[0], c[1], c[2])
    }

    // Inner wall of thick seal (at plugHoleR, only if hole exists)
    if (plugHoleR > 0) {
      for (let j = 0; j < radialSegments; j++) {
        const j1 = (j + 1) % radialSegments
        const th0 = (j / radialSegments) * Math.PI * 2
        const th1 = (j1 / radialSegments) * Math.PI * 2

        const a = v(plugHoleR, th0, yBot)
        const b = v(plugHoleR, th0, yTop)
        const c = v(plugHoleR, th1, yBot)
        const d = v(plugHoleR, th1, yTop)

        // reverse winding
        pushTri(c[0], c[1], c[2], b[0], b[1], b[2], a[0], a[1], a[2])
        pushTri(c[0], c[1], c[2], d[0], d[1], d[2], b[0], b[1], b[2])
      }
    }

    // === BOTTOM CIRCLE DISC (only for 'circle' shape) ===
    if (plugShape === 'circle') {
      const discT = Math.max(0.6, normalized.bottomPlugDiscThickness ?? thickness)
      const discTop = yBot
      const discBot = yBot - discT

      // Top face of disc (facing up, from holeR to plugCircleR)
      for (let j = 0; j < radialSegments; j++) {
        const j1 = (j + 1) % radialSegments
        const th0 = (j / radialSegments) * Math.PI * 2
        const th1 = (j1 / radialSegments) * Math.PI * 2
        const rOuter0 = plugCircleR
        const rOuter1 = plugCircleR
        const rInner0 = Math.max(0.8, plugHoleR)
        const rInner1 = Math.max(0.8, plugHoleR)

        const o0 = v(rOuter0, th0, discTop)
        const o1 = v(rOuter1, th1, discTop)
        const i0 = v(rInner0, th0, discTop)
        const i1 = v(rInner1, th1, discTop)

        pushTri(o0[0], o0[1], o0[2], i0[0], i0[1], i0[2], o1[0], o1[1], o1[2])
        pushTri(o1[0], o1[1], o1[2], i0[0], i0[1], i0[2], i1[0], i1[1], i1[2])
      }

      // Bottom face of disc (facing down)
      for (let j = 0; j < radialSegments; j++) {
        const j1 = (j + 1) % radialSegments
        const th0 = (j / radialSegments) * Math.PI * 2
        const th1 = (j1 / radialSegments) * Math.PI * 2

        const o0 = v(plugCircleR, th0, discBot)
        const o1 = v(plugCircleR, th1, discBot)
        const i0 = v(Math.max(0.8, plugHoleR), th0, discBot)
        const i1 = v(Math.max(0.8, plugHoleR), th1, discBot)

        pushTri(o1[0], o1[1], o1[2], i0[0], i0[1], i0[2], o0[0], o0[1], o0[2])
        pushTri(i1[0], i1[1], i1[2], i0[0], i0[1], i0[2], o1[0], o1[1], o1[2])
      }

      // Outer rim of disc
      for (let j = 0; j < radialSegments; j++) {
        const j1 = (j + 1) % radialSegments
        const th0 = (j / radialSegments) * Math.PI * 2
        const th1 = (j1 / radialSegments) * Math.PI * 2

        const a = v(plugCircleR, th0, discBot)
        const b = v(plugCircleR, th0, discTop)
        const c = v(plugCircleR, th1, discBot)
        const d = v(plugCircleR, th1, discTop)

        pushTri(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
        pushTri(b[0], b[1], b[2], d[0], d[1], d[2], c[0], c[1], c[2])
      }

      // Inner rim of disc hole (if hole exists)
      if (plugHoleR > 0) {
        for (let j = 0; j < radialSegments; j++) {
          const j1 = (j + 1) % radialSegments
          const th0 = (j / radialSegments) * Math.PI * 2
          const th1 = (j1 / radialSegments) * Math.PI * 2

          const a = v(plugHoleR, th0, discBot)
          const b = v(plugHoleR, th0, discTop)
          const c = v(plugHoleR, th1, discBot)
          const d = v(plugHoleR, th1, discTop)

          pushTri(c[0], c[1], c[2], b[0], b[1], b[2], a[0], a[1], a[2])
          pushTri(c[0], c[1], c[2], d[0], d[1], d[2], b[0], b[1], b[2])
        }
      }
    }
  } else {
    // Standard thin base cap (always sealed, solid)
    addCap(0, 0, false)
  }

  // Helper: sample rGrid at arbitrary (row, theta) with linear interpolation
  const sampleR = (row: number, theta: number): number => {
    const th = ((theta % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
    const jFloat = (th / (Math.PI * 2)) * radialSegments
    const j0 = Math.floor(jFloat) % radialSegments
    const j1 = (j0 + 1) % radialSegments
    const frac = jFloat - Math.floor(jFloat)
    return rGrid[row][j0] * (1 - frac) + rGrid[row][j1] * frac
  }

  // T-ridges: continuous wall fins protruding perpendicular to surface
  if (normalized.pattern === 'groovesT' && normalized.patternAmpMm > 0) {
    const ridgeCount = Math.max(2, Math.round(normalized.patternFreq))
    const ridgeH = normalized.patternAmpMm
    // Generate base ridges + mirrored ridges (opposite twist direction)
    const ridgeAngles: number[] = []
    for (let k = 0; k < ridgeCount; k++) {
      ridgeAngles.push((k / ridgeCount) * Math.PI * 2)
    }
    if (normalized.patternMirror) {
      for (let k = 0; k < ridgeCount; k++) {
        ridgeAngles.push(-((k / ridgeCount) * Math.PI * 2))
      }
    }

    for (let ri = 0; ri < ridgeAngles.length; ri++) {
      const thetaC = ridgeAngles[ri]
      const isMirror = ri >= ridgeCount
      for (let i = 0; i < heightSegments; i++) {
        const t0 = i / heightSegments, t1 = (i + 1) / heightSegments
        const y0 = t0 * height, y1 = t1 * height
        const tw0 = isMirror ? -twistAt(normalized, t0) : twistAt(normalized, t0)
        const tw1 = isMirror ? -twistAt(normalized, t1) : twistAt(normalized, t1)
        // For mirror ridges: grid theta = world_angle - twist = (thetaC - twist) - twist = thetaC - 2*twist
        // For base ridges: grid theta = thetaC (world angle = thetaC + twist, grid = world - twist)
        const gridTh0 = isMirror ? thetaC - 2 * twistAt(normalized, t0) : thetaC
        const gridTh1 = isMirror ? thetaC - 2 * twistAt(normalized, t1) : thetaC
        // Sample actual surface (with veins) from rGrid
        const rB0 = sampleR(i, gridTh0)
        const rB1 = sampleR(i + 1, gridTh1)
        const hw0 = Math.min(thickness / (2 * Math.max(1, rB0)), Math.PI / ridgeCount * 0.45)
        const hw1 = Math.min(thickness / (2 * Math.max(1, rB1)), Math.PI / ridgeCount * 0.45)
        const rT0 = rB0 + ridgeH, rT1 = rB1 + ridgeH
        const tl0 = thetaC - hw0, tr0 = thetaC + hw0
        const tl1 = thetaC - hw1, tr1 = thetaC + hw1
        // 4 outer-edge vertices (at ridge top)
        const c = v(rT0, tl0 + tw0, y0), d = v(rT0, tr0 + tw0, y0)
        const g2 = v(rT1, tl1 + tw1, y1), h = v(rT1, tr1 + tw1, y1)
        // 4 surface-edge vertices (where fin meets lamp) — use rGrid with veins
        const a = v(rB0, tl0 + tw0, y0), b = v(rB0, tr0 + tw0, y0)
        const e = v(rB1, tl1 + tw1, y1), f = v(rB1, tr1 + tw1, y1)

        // Outer face (top of ridge, facing outward — correct winding)
        pushTri(c[0],c[1],c[2],g2[0],g2[1],g2[2],d[0],d[1],d[2])
        pushTri(d[0],d[1],d[2],g2[0],g2[1],g2[2],h[0],h[1],h[2])
        // Inner face (facing lamp center — correct winding)
        pushTri(e[0],e[1],e[2],a[0],a[1],a[2],f[0],f[1],f[2])
        pushTri(f[0],f[1],f[2],a[0],a[1],a[2],b[0],b[1],b[2])
        // Left side (facing away from ridge center — correct winding)
        pushTri(c[0],c[1],c[2],a[0],a[1],a[2],g2[0],g2[1],g2[2])
        pushTri(a[0],a[1],a[2],e[0],e[1],e[2],g2[0],g2[1],g2[2])
        // Right side (facing away from ridge center — correct winding)
        pushTri(h[0],h[1],h[2],f[0],f[1],f[2],d[0],d[1],d[2])
        pushTri(f[0],f[1],f[2],b[0],b[1],b[2],d[0],d[1],d[2])

        // End caps only at ridge ends
        if (i === 0) {
          pushTri(b[0],b[1],b[2],a[0],a[1],a[2],d[0],d[1],d[2])
          pushTri(a[0],a[1],a[2],c[0],c[1],c[2],d[0],d[1],d[2])
        }
        if (i === heightSegments - 1) {
          pushTri(e[0],e[1],e[2],f[0],f[1],f[2],g2[0],g2[1],g2[2])
          pushTri(f[0],f[1],f[2],h[0],h[1],h[2],g2[0],g2[1],g2[2])
        }
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.computeVertexNormals()
  g.computeBoundingBox()
  return g
}

