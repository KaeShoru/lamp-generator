import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { buildShadeGeometry } from './buildShadeGeometry'
import { BASE_DIAMETER, BASE_RADIUS, MAX_DIAMETER, MIN_WALL_THICKNESS, PLUG_HOLE_DIAMETER, T_RIDGE_WIDTH } from './constants'
import type { ShadeParams } from './types'

const baseParams: ShadeParams = {
  height: 160,
  topDiameter: 60,
  thickness: 2.0,
  radialSegments: 64,
  heightSegments: 48,
  // NOTE: bottom plug is always ON, follows the lamp's bottom shape,
  // and has a fixed thickness (PLUG_SEAL_THICKNESS = 2.0 mm).
  bulgeMm: 18,
  bulgePos: 0.55,
  waistMm: 10,
  waistPos: 0.35,
  twistDeg: 0,
  twistProfile: 'linear',
  pattern: 'ribsRect',
  patternAmpMm: 2.8,
  patternFreq: 28,
  patternYFreq: 1.0,
  patternMirror: false,
  patternEdgeFade: true,
  veinsEnabled: false,
  veinCount: 4,
  veinAmplitudeMm: 6,
  veinTurns: 1.5,
  veinTiltDeg: 0,
  veinWidth: 0.35,
  veinValleyMm: 0,
}

/** Compute max XY distance from origin (i.e. outer radius) over all vertices. */
function maxOuterRadius(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  let maxR = 0
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i)
    const r = Math.hypot(x, z)
    if (r > maxR) maxR = r
  }
  return maxR
}

/**
 * Compute max outer radius among the bottom-ring vertices (y == 0).
 * The plug's top face also lives at y == 0, so its inner hole (r ≈ 20)
 * is included; taking the MAX returns the OUTER wall radius (= base radius, 75 mm).
 */
function bottomRingOuterRadius(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  let maxR = 0
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (Math.abs(y) < 0.01) {
      const x = pos.getX(i), z = pos.getZ(i)
      const r = Math.hypot(x, z)
      if (r > maxR) maxR = r
    }
  }
  return maxR
}

/**
 * Find the LARGEST inner-wall radius at the bottom ring (y ≈ 0).
 *
 * Bottom-ring row contains vertices at:
 *   - outer wall: BASE_RADIUS (75 mm)
 *   - inner wall: BASE_RADIUS - thickness
 *   - plug inner hole: PLUG_HOLE_RADIUS (20 mm)
 *
 * To measure the wall thickness we filter for r > PLUG_HOLE_RADIUS + 5
 * AND r < BASE_RADIUS (excludes both the plug hole and the outer wall)
 * then take the MAX (closest to BASE_RADIUS).
 */
function maxInnerRadius(g: THREE.BufferGeometry): number {
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  let best = 0
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (Math.abs(y) < 0.01) {
      const x = pos.getX(i), z = pos.getZ(i)
      const r = Math.hypot(x, z)
      if (r > 30 && r < BASE_RADIUS - 0.1 && r > best) best = r
    }
  }
  return best
}

describe('Constants — physical constraints', () => {
  it('base diameter is exactly 150 mm', () => {
    expect(BASE_DIAMETER).toBe(150)
  })

  it('max diameter is exactly 250 mm', () => {
    expect(MAX_DIAMETER).toBe(250)
  })

  it('plug hole diameter is exactly 40 mm', () => {
    expect(PLUG_HOLE_DIAMETER).toBe(40)
  })

  it('minimum wall thickness is exactly 1.2 mm', () => {
    // Updated from 0.6 → 1.2 mm per spec: thinner walls are too fragile for
    // 3D printing and translucent diffusion. The build function floors every
    // thickness input at this value.
    expect(MIN_WALL_THICKNESS).toBe(1.2)
  })

  it('T-ridge width is exactly 1.2 mm', () => {
    expect(T_RIDGE_WIDTH).toBe(1.2)
  })
})

describe('Geometry — minimum wall thickness', () => {
  it('wall is never thinner than MIN_WALL_THICKNESS, even with sub-min input', () => {
    // User tries to set thickness = 0.1 mm — must be clamped to 0.6 mm.
    const g = buildShadeGeometry({ ...baseParams, thickness: 0.1 })
    const innerR = maxInnerRadius(g)
    // outer radius at bottom = BASE_RADIUS (75 mm);
    // inner radius = 75 - max(0.6, 0.1) = 74.4 mm.
    expect(innerR).toBeGreaterThanOrEqual(BASE_RADIUS - MIN_WALL_THICKNESS - 0.5)
  })

  it('wall thickness at default value (2.0 mm) produces inner radius ≈ outer - 2.0', () => {
    const g = buildShadeGeometry({ ...baseParams, thickness: 2.0, patternAmpMm: 0, bulgeMm: 0, waistMm: 0 })
    const innerR = maxInnerRadius(g)
    expect(innerR).toBeGreaterThanOrEqual(BASE_RADIUS - 2.0 - 0.5)
    expect(innerR).toBeLessThanOrEqual(BASE_RADIUS - 2.0 + 0.5)
  })
})

describe('Geometry — T-ridge width', () => {
  it('every T-ridge footprint is ≈ T_RIDGE_WIDTH (1.2 mm) at its base', () => {
    // Build a CYLINDRICAL shade (topDiameter = base = 150 mm) so the surface
    // radius is constant along the whole height (= BASE_RADIUS = 75 mm).
    // With 2 well-separated ridges, no twist, no edge fade, we can measure
    // each ridge's footprint by finding pairs of vertices on the surface
    // radius with a very small angular gap (the ridge's two side-walls).
    const g = buildShadeGeometry({
      ...baseParams,
      height: 80,
      topDiameter: BASE_DIAMETER,
      pattern: 'groovesT',
      patternAmpMm: 5,
      patternFreq: 2,
      patternMirror: false,
      patternEdgeFade: false,
      bulgeMm: 0,
      waistMm: 0,
      twistDeg: 0,
      veinsEnabled: false,
      radialSegments: 96,
    })
    const pos = g.getAttribute('position') as THREE.BufferAttribute

    type V = { x: number; y: number; z: number; r: number; theta: number }
    const byRow = new Map<number, V[]>()
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      const r = Math.hypot(x, z)
      const theta = Math.atan2(z, x)
      const yKey = Math.round(y * 100) / 100
      if (!byRow.has(yKey)) byRow.set(yKey, [])
      byRow.get(yKey)!.push({ x, y, z, r, theta })
    }

    // For each row, surface vertices sit at radius ≈ BASE_RADIUS.
    // The grid places them ~2π/96 ≈ 0.065 rad apart.
    // Ridge edges add 2 EXTRA vertices at the surface radius very close to each
    // other (the two side-walls of the ridge). Find such tight pairs.
    let measured = 0
    for (const [, rowVerts] of byRow) {
      const ySample = rowVerts[0]?.y ?? 0
      // Skip boundary rows (ridge fades to zero at very bottom/top even
      // with patternEdgeFade=false — bottomFade is always applied).
      if (ySample < 5 || ySample > 75) continue

      const surfaceVerts = rowVerts.filter(v => Math.abs(v.r - BASE_RADIUS) < 0.5)
      if (surfaceVerts.length < 4) continue

      surfaceVerts.sort((a, b) => a.theta - b.theta)
      for (let i = 1; i < surfaceVerts.length; i++) {
        const dTheta = surfaceVerts[i].theta - surfaceVerts[i - 1].theta
        // Tight pair = significantly smaller than grid spacing (0.065 rad)
        if (dTheta > 0.001 && dTheta < 0.025) {
          const meanR = (surfaceVerts[i].r + surfaceVerts[i - 1].r) / 2
          const arcMm = meanR * dTheta
          // Each tight pair = one side of one ridge. Width = arc length.
          // Tolerance: 0.4×..1.6× of T_RIDGE_WIDTH (sampling may alias slightly).
          expect(arcMm).toBeGreaterThan(T_RIDGE_WIDTH * 0.4)
          expect(arcMm).toBeLessThan(T_RIDGE_WIDTH * 1.6)
          measured++
        }
      }
    }

    expect(measured).toBeGreaterThan(0)
  })
})

describe('Geometry — fixed base diameter', () => {
  it('bottom-ring radius equals BASE_DIAMETER/2 (= 75 mm)', () => {
    const g = buildShadeGeometry({ ...baseParams, patternAmpMm: 0, bulgeMm: 0, waistMm: 0 })
    const r = bottomRingOuterRadius(g)
    expect(r).toBeGreaterThanOrEqual(74.5)
    expect(r).toBeLessThanOrEqual(75.5)
  })

  it('base diameter is independent of topDiameter setting', () => {
    const g1 = buildShadeGeometry({ ...baseParams, topDiameter: 40 })
    const g2 = buildShadeGeometry({ ...baseParams, topDiameter: 200 })
    const r1 = bottomRingOuterRadius(g1)
    const r2 = bottomRingOuterRadius(g2)
    expect(Math.abs(r1 - r2)).toBeLessThan(1)
  })
})

describe('Geometry — maximum diameter cap (250 mm)', () => {
  it('geometry never exceeds MAX_RADIUS even with extreme bulge', () => {
    const g = buildShadeGeometry({
      ...baseParams,
      bulgeMm: 400,
      bulgePos: 0.5,
      patternAmpMm: 0,
      waistMm: 0,
      topDiameter: 200,
    })
    const r = maxOuterRadius(g)
    expect(r).toBeLessThanOrEqual(MAX_DIAMETER / 2 + 0.5)
  })

  it('geometry never exceeds MAX_RADIUS with extreme top diameter', () => {
    const g = buildShadeGeometry({
      ...baseParams,
      topDiameter: 600,
      bulgeMm: 0,
      patternAmpMm: 0,
      waistMm: 0,
    })
    const r = maxOuterRadius(g)
    expect(r).toBeLessThanOrEqual(MAX_DIAMETER / 2 + 0.5)
  })

  it('veins cannot push geometry past MAX_RADIUS', () => {
    const g = buildShadeGeometry({
      ...baseParams,
      topDiameter: 200,
      bulgeMm: 50,
      veinsEnabled: true,
      veinAmplitudeMm: 80,
      veinCount: 4,
      veinWidth: 0.6,
      patternAmpMm: 0,
    })
    const r = maxOuterRadius(g)
    expect(r).toBeLessThanOrEqual(MAX_DIAMETER / 2 + 0.5)
  })
})

describe('Geometry — bottom plug always present', () => {
  it('bottom plug is generated even though the flag is gone from params', () => {
    const g = buildShadeGeometry(baseParams)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    let belowZero = 0
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < -0.5) belowZero++
    }
    expect(belowZero).toBeGreaterThan(0)
  })

  it('plug always contains a 40 mm hole', () => {
    const g = buildShadeGeometry(baseParams)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const expectedR = PLUG_HOLE_DIAMETER / 2
    let hits = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i)
      const r = Math.hypot(x, z)
      if (Math.abs(r - expectedR) < 0.5) hits++
    }
    expect(hits).toBeGreaterThan(0)
  })

  it('plug seal thickness is fixed at PLUG_SEAL_THICKNESS (2.0 mm) regardless of wall thickness', () => {
    // The plug's vertical thickness is hard-coded and must NOT change when the
    // user varies the wall thickness — these are now independent concerns.
    const gThin = buildShadeGeometry({ ...baseParams, thickness: 0.6 })
    const gThick = buildShadeGeometry({ ...baseParams, thickness: 6.0 })
    const measurePlugDepth = (g: THREE.BufferGeometry) => {
      const pos = g.getAttribute('position') as THREE.BufferAttribute
      let minY = 0
      for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i)
        if (y < minY) minY = y
      }
      return -minY  // positive depth in mm
    }
    const depthThin = measurePlugDepth(gThin)
    const depthThick = measurePlugDepth(gThick)
    // Both should be ≈ PLUG_SEAL_THICKNESS (2.0 mm) ±0.01.
    expect(Math.abs(depthThin - 2.0)).toBeLessThan(0.01)
    expect(Math.abs(depthThick - 2.0)).toBeLessThan(0.01)
  })

  it('plug always follows the lamp bottom shape (no separate circular disc mode)', () => {
    // Build a shade with a strong bulge — the plug's outer wall must trace
    // rGrid[0] (which is forced to BASE_RADIUS by the bottom-blend filter).
    // The plug must NOT contain any vertices at smaller radii than the lamp's
    // bottom ring (which would indicate a separate inner "disc").
    const g = buildShadeGeometry({
      ...baseParams,
      bulgeMm: 50,
      bulgePos: 0.3,
      topDiameter: 200,
    })
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    const expectedR = PLUG_HOLE_DIAMETER / 2

    // Hole is still present
    let holeHits = 0
    let plugOuterAtBottom = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      const r = Math.hypot(pos.getX(i), pos.getZ(i))
      // Count vertices exactly at the wiring hole radius (across all y of the plug).
      if (Math.abs(r - expectedR) < 0.5) holeHits++
      // At the plug's bottom face (y ≈ -2), the outermost radius must equal
      // BASE_RADIUS — the plug follows rGrid[0], it's not a smaller disc.
      if (y < -1.5 && y > -2.5 && Math.abs(r - 75) < 0.6) plugOuterAtBottom++
    }
    expect(holeHits).toBeGreaterThan(0)
    expect(plugOuterAtBottom).toBeGreaterThan(0)
  })
})

describe('Geometry — output validity', () => {
  it('produces a non-empty geometry with finite positions', () => {
    const g = buildShadeGeometry(baseParams)
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    expect(pos.count).toBeGreaterThan(0)
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(y)).toBe(true)
      expect(Number.isFinite(z)).toBe(true)
    }
  })

  it('bottom ring outer radius stays at BASE_RADIUS even with veins enabled', () => {
    const g = buildShadeGeometry({
      ...baseParams,
      veinsEnabled: true,
      veinCount: 6,
      veinAmplitudeMm: 12,
      veinWidth: 0.5,
      patternAmpMm: 0,
    })
    const r = bottomRingOuterRadius(g)
    expect(r).toBeGreaterThanOrEqual(BASE_DIAMETER / 2 - 0.5)
    expect(r).toBeLessThanOrEqual(BASE_DIAMETER / 2 + 0.5)
  })

  it('respects height parameter', () => {
    const h = 200
    const g = buildShadeGeometry({ ...baseParams, height: h })
    const pos = g.getAttribute('position') as THREE.BufferAttribute
    let maxY = -Infinity, minY = Infinity
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y > maxY) maxY = y
      if (y < minY) minY = y
    }
    expect(maxY).toBeCloseTo(h, 0)
    expect(minY).toBeLessThanOrEqual(0)
  })
})