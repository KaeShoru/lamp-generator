import * as THREE from 'three'
import type { ShadeParams } from './types'
import { BASE_RADIUS, MAX_RADIUS, MIN_WALL_THICKNESS, PLUG_HOLE_RADIUS, PLUG_SEAL_THICKNESS, T_RIDGE_WIDTH } from './constants'

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

function profileRadius(params: ShadeParams, t: number, baseR: number, maxR: number) {
  const topR = clamp(params.topDiameter / 2, 1, maxR)
  const linear = lerp(baseR, topR, t)
  const bulge = params.bulgeMm * gaussian(t, params.bulgePos, 0.18)
  const waist = -params.waistMm * gaussian(t, params.waistPos, 0.16)
  // Hard cap at maxR (printer build-volume limit for outer;
  // outer.topDiameter/2 − margin for inner)
  return clamp(linear + bulge + waist, 1, maxR)
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
      // 'none' and any unknown pattern → smooth surface (no modulation)
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

export type BuildOptions = {
  /**
   * Optional static bottom geometry (non-indexed XYZ positions, 9 floats per triangle).
   * When provided, REPLACES the parametric plug entirely — caller is responsible
   * for orientation/centering (typically the STL is already centered at (0,0) in
   * X/Z and rests at y=0 extending downward, like a real lamp base).
   */
  externalBottom?: Float32Array | null
  /**
   * Normals matching `externalBottom` (non-indexed XYZ, same length). When
   * omitted but externalBottom is provided, normals default to (0,1,0) which
   * will look wrong — always pass the STL's precomputed normals.
   *
   * WHY THIS EXISTS: `computeVertexNormals()` averages normals across all
   * triangles sharing a vertex position. At the seam between the shade's
   * bottom ring (y=0) and the STL plug's top rim (also y=0), vertices coincide
   * — averaging produces wrong normals → gray/dark polygons on the seam.
   * Passing precomputed normals for the STL part avoids the cross-contamination:
   * parametric geometry gets `computeVertexNormals()`, STL gets its own normals.
   */
  externalBottomNormals?: Float32Array | null
  /**
   * Override the base radius (defaults to BASE_RADIUS = 75 mm).
   * Used for the INNER shade in double-shade mode (= INNER_BASE_RADIUS = 50 mm).
   * The base blend filter, profile, and bottom plug all key off this value.
   */
  baseRadiusOverride?: number | null
  /**
   * Vertical offset added to every generated Y coordinate (defaults to 0).
   * Used to lift the INNER shade so its base sits on top of the outer plug
   * (INNER_BASE_Y_OFFSET = 2 mm).
   */
  yOffset?: number
  /**
   * Hard maximum radius (mm) — every generated radius (profile, bulge, waist,
   * veins, patterns) is clamped to [1, maxRadius]. Used for the INNER shade:
   * guarantees it physically fits INSIDE the outer shade (maxRadius =
   * outer.topDiameter/2 − INNER_TOP_DIAMETER_MARGIN/2) regardless of how
   * aggressive bulge/veins are.
   *
   * When omitted, falls back to MAX_RADIUS (printer build-volume limit).
   */
  maxRadius?: number | null
}

export function buildShadeGeometry(params: ShadeParams, extraSmoothPasses = 0, options: BuildOptions = {}) {
  const externalBottom = options.externalBottom ?? null
  const baseR = options.baseRadiusOverride && options.baseRadiusOverride > 0
    ? options.baseRadiusOverride
    : BASE_RADIUS
  const yOffset = options.yOffset ?? 0
  // Hard radius cap. MAX_RADIUS is the printer limit; the inner shade overrides
  // this with a tighter cap so it can never poke through the outer's wall.
  const maxR = options.maxRadius && options.maxRadius > 0 ? options.maxRadius : MAX_RADIUS
  // Wall thickness is hard-floored at MIN_WALL_THICKNESS (1.2 mm) —
  // anything thinner is too fragile for 3D printing and translucent diffusion.
  const thickness = Math.max(MIN_WALL_THICKNESS, params.thickness)
  const height = Math.max(10, params.height)
  // baseDiameter is fixed at 150 mm (BASE_DIAMETER) — see constants.ts
  const topDiameter = clamp(params.topDiameter, 4, maxR * 2)

  const normalized: ShadeParams = {
    ...params,
    height,
    topDiameter,
    thickness,
  }

  const radialSegments = clamp(Math.round(normalized.radialSegments), 12, 400)
  const heightSegments = clamp(Math.round(normalized.heightSegments), 4, 240)

  // Radii grid (no seam duplicate).
  // NOTE: maxOverhangDeg has been removed — overhang is now controlled by
  // user-facing profile parameters (bulge / waist / topDiameter) directly.
  const rGrid: number[][] = Array.from({ length: heightSegments + 1 }, () =>
    Array.from({ length: radialSegments }, () => 0),
  )
  for (let i = 0; i <= heightSegments; i++) {
    const t = i / heightSegments
    const base = profileRadius(normalized, t, baseR, maxR)
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
      // Top edge fade is optional (user-controlled via patternEdgeFade).
      // Bottom fade is applied later as a SEPARATE FILTER pass (see below) — this
      // is critical: it guarantees a smooth, perfectly circular base WITHOUT
      // producing a "step" or "lip" that the previous multiplicative approach did.
      const topFade = normalized.patternEdgeFade ? smoothstep(0, 0.08, 1 - t) : 1
      const veinsFaded = veins * topFade
      const combined = clamp((pat + mirror) * topFade, -amp, amp)
      // Hard clamp at maxR (printer build-volume limit for outer;
      // outer.topDiameter/2 − margin for inner — guarantees inner never
      // intersects outer's inner wall even with maximum bulge/veins).
      rGrid[i][j] = clamp(base + veinsFaded + combined, 1, maxR)
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
        smoothed[i][j] = clamp((rGrid[i][j] + avg) / 2, 1, maxR)
      }
    }
    // Also smooth boundary rows to prevent elephant foot
    for (let j = 0; j < radialSegments; j++) {
      const jm = (j - 1 + radialSegments) % radialSegments
      const jp = (j + 1) % radialSegments
      // Row 0: one-sided (only row 1 available above)
      const avg0 = (rGrid[0][j] * 2 + rGrid[1][j] + rGrid[0][jm] + rGrid[0][jp]) / 5
      smoothed[0][j] = clamp((rGrid[0][j] + avg0) / 2, 1, maxR)
      // Row heightSegments: one-sided (only row heightSegments-1 available below)
      const avgN = (rGrid[heightSegments][j] * 2 + rGrid[heightSegments-1][j] + rGrid[heightSegments][jm] + rGrid[heightSegments][jp]) / 5
      smoothed[heightSegments][j] = clamp((rGrid[heightSegments][j] + avgN) / 2, 1, maxR)
    }
    for (let i = 0; i <= heightSegments; i++) {
      for (let j = 0; j < radialSegments; j++) {
        rGrid[i][j] = smoothed[i][j]
      }
    }
  }

  // === BOTTOM-BLEND FILTER (always applied) ===
  // The bottom ring MUST be a perfect circle of BASE_RADIUS (75 mm) so that the
  // bottom plug seals watertight and the shade sits flat on the printer bed.
  //
  // Previously this was done by zeroing pattern/vein contributions at i=0 and
  // hard-snapping rGrid[0] to BASE_RADIUS. That produced a visible "step" / "lip"
  // because row 1 still had its full bulge/veins — a discontinuity.
  //
  // New approach: apply a SMOOTH blend over the bottom ~12% of rows that pulls
  // every radius linearly toward BASE_RADIUS. row 0 → fully BASE_RADIUS,
  // row fadeRows → unchanged. In between, smoothstep guarantees C¹ continuity,
  // so there is no kink even with strong bulge/waist/veins nearby.
  //
  // This filter runs AFTER smoothing, so smoothing cannot re-introduce leaks.
  // It also implicitly fades VEINS at the bottom (their radius gets pulled in).
  // For T-ridges (separate geometry), see the ridgeH fade below.
  {
    const fadeRows = Math.max(2, Math.round(heightSegments * 0.12))
    for (let i = 0; i <= fadeRows && i <= heightSegments; i++) {
      const blend = smoothstep(0, 1, i / fadeRows)  // 0 at row 0, 1 at row fadeRows
      for (let j = 0; j < radialSegments; j++) {
        const natural = rGrid[i][j]
        rGrid[i][j] = baseR + (natural - baseR) * blend
      }
    }
  }

  const pos: number[] = []
  // Track which vertices belong to the parametric shade (vs. the external STL
  // plug). Used at the end to selectively compute normals only for parametric
  // triangles — STL normals are passed in via `externalBottomNormals` to avoid
  // cross-contamination at the y=0 seam (which is what produced gray polygons).
  const paramVertexCount = { value: 0 }

  const pushTri = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) => {
    pos.push(ax, ay, az, bx, by, bz, cx, cy, cz)
    paramVertexCount.value += 3
  }

  const v = (r: number, theta: number, y: number) => {
    const x = r * Math.cos(theta)
    const z = r * Math.sin(theta)
    return [x, y + yOffset, z] as const
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

  // Bottom plug: when externalBottom is provided (a static STL loaded from disk),
  // it REPLACES the parametric plug completely. Otherwise fall back to the
  // parametric plug (annular seal with central wiring hole).
  if (externalBottom && externalBottom.length >= 9) {
    // Append the external geometry positions, APPLYING yOffset to every Y
    // coordinate. Without this, the inner shade's STL plug stays at y=0
    // while the parametric body lifts to y=yOffset — the plug "sinks" into
    // the outer shade instead of sitting on top of it.
    // Every 3rd float (index 1, 4, 7, ...) is a Y coordinate.
    for (let i = 0; i < externalBottom.length; i += 3) {
      pos.push(externalBottom[i])
      pos.push(externalBottom[i + 1] + yOffset)
      pos.push(externalBottom[i + 2])
    }
  } else {
    // Parametric plug fallback (used by tests and when no STL is loaded yet)
    const plugT = PLUG_SEAL_THICKNESS
    const plugHoleR = PLUG_HOLE_RADIUS  // fixed 20 mm — always present
    const yTop = 0
    const yBot = -plugT

    // === TOP FACE OF SEAL (y=0, facing up) ===
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

    // === BOTTOM FACE OF SEAL (y=yBot, facing down) ===
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

    // === OUTER WALL OF SEAL (vertical wall at lamp surface) ===
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

    // === INNER WALL OF SEAL (at plugHoleR, around the wiring hole) ===
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
  }
  // ↑ closes the `else` branch (parametric plug fallback)

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

    // Fade zone for ridges — same as the bottom-blend filter, plus optional top fade.
    // This ensures T-ridges also melt smoothly into the circular base (no "step"
    // where the ridge suddenly disappears at y=0).
    const fadeRows = Math.max(2, Math.round(heightSegments * 0.12))
    const ridgeFadeAt = (i: number): number => {
      // Bottom fade (always): 0 at row 0, 1 at row fadeRows.
      const bot = smoothstep(0, 1, Math.min(i, fadeRows) / fadeRows)
      // Top fade (optional): symmetric.
      const top = normalized.patternEdgeFade
        ? smoothstep(0, 1, Math.min(heightSegments - i, fadeRows) / fadeRows)
        : 1
      return bot * top
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
        // Sample actual surface (with veins, already faded at bottom) from rGrid
        const rB0 = sampleR(i, gridTh0)
        const rB1 = sampleR(i + 1, gridTh1)
        // Fade ridge HEIGHT at both ends so ridges melt into the surface instead
        // of producing a hard step at the bottom or top ring.
        const ridgeH0 = ridgeH * ridgeFadeAt(i)
        const ridgeH1 = ridgeH * ridgeFadeAt(i + 1)
        // T-ridge width is FIXED at T_RIDGE_WIDTH (1.2 mm, arc length at base).
        // Convert mm → radians using the local surface radius rB*:
        //   arc_length = r * angle  →  angle = arc_length / r
        // This gives every ridge a consistent physical width regardless of how
        // many ridges are configured or how bulged the surface is.
        const hw0 = Math.min((T_RIDGE_WIDTH / 2) / Math.max(1, rB0), Math.PI / ridgeCount * 0.45)
        const hw1 = Math.min((T_RIDGE_WIDTH / 2) / Math.max(1, rB1), Math.PI / ridgeCount * 0.45)
        const rT0 = clamp(rB0 + ridgeH0, 1, maxR), rT1 = clamp(rB1 + ridgeH1, 1, maxR)
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

  // === Normals ===
  // Two-track strategy to prevent the gray-polygon artifact at the seam:
  //   1. Parametric shade vertices: compute fresh via computeVertexNormals().
  //      This only averages normals WITHIN the parametric part — the STL
  //      vertices are not yet in the geometry when this runs.
  //   2. STL vertices: append their precomputed normals (loaded from the STL
  //      file by loadBaseSTL). If absent, fall back to (0,-1,0) — better
  //      than wrong averaging.
  const paramFloatCount = paramVertexCount.value * 3  // ×3 because Float32Array is XYZ-packed
  const normalArray = new Float32Array(pos.length)

  // Build a temporary parametric-only geometry to compute its normals cleanly.
  const paramPos = new Float32Array(paramFloatCount)
  for (let i = 0; i < paramFloatCount; i++) paramPos[i] = pos[i]
  const paramGeo = new THREE.BufferGeometry()
  paramGeo.setAttribute('position', new THREE.Float32BufferAttribute(paramPos, 3))
  paramGeo.computeVertexNormals()
  const paramNormals = (paramGeo.getAttribute('normal').array as Float32Array)
  for (let i = 0; i < paramNormals.length; i++) normalArray[i] = paramNormals[i]
  paramGeo.dispose()

  // Append STL normals (if provided).
  if (externalBottom && externalBottom.length >= 9) {
    const stlNormals = options.externalBottomNormals
    const stlVertCount = (externalBottom.length / 3) | 0
    if (stlNormals && stlNormals.length === externalBottom.length) {
      for (let i = 0; i < stlNormals.length; i++) {
        normalArray[paramFloatCount + i] = stlNormals[i]
      }
    } else {
      // Fallback: face normals computed directly from STL positions.
      // (Better than nothing, but less smooth than precomputed normals.)
      for (let t = 0; t < stlVertCount; t += 3) {
        const i0 = paramFloatCount + t * 3
        const ax = pos[i0], ay = pos[i0 + 1], az = pos[i0 + 2]
        const bx = pos[i0 + 3], by = pos[i0 + 4], bz = pos[i0 + 5]
        const cx = pos[i0 + 6], cy = pos[i0 + 7], cz = pos[i0 + 8]
        // face normal = (b-a) × (c-a)
        const ux = bx - ax, uy = by - ay, uz = bz - az
        const vx = cx - ax, vy = cy - ay, vz = cz - az
        let nx = uy * vz - uz * vy
        let ny = uz * vx - ux * vz
        let nz = ux * vy - uy * vx
        const len = Math.hypot(nx, ny, nz) || 1
        nx /= len; ny /= len; nz /= len
        for (let k = 0; k < 3; k++) {
          normalArray[i0 + k * 3 + 0] = nx
          normalArray[i0 + k * 3 + 1] = ny
          normalArray[i0 + k * 3 + 2] = nz
        }
      }
    }
  }

  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normalArray, 3))
  g.computeBoundingBox()
  return g
}