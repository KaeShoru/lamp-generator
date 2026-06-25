export type PatternType = 'none' | 'ribsRect' | 'wave' | 'accordionTri' | 'groovesRound' | 'groovesT'

export type TwistProfile = 'linear' | 'easeInOut' | 'sine'

/**
 * Parameters for ONE shade (outer or inner). The outer shade uses the full
 * set; the inner shade reuses the same type but with `veinsEnabled=false`
 * and `pattern !== 'groovesT'` (these are stripped from the inner UI).
 */
export type ShadeParams = {
  /** mm */
  height: number
  /** mm; base diameter is fixed at 150 mm (BASE_DIAMETER) — see constants.ts */
  topDiameter: number
  /** mm */
  thickness: number

  radialSegments: number
  heightSegments: number

  // NOTE: bottom plug is ALWAYS enabled and ALWAYS follows the lamp's bottom
  // shape (no separate circle-disc mode anymore). Its thickness is fixed at
  // PLUG_SEAL_THICKNESS (2.0 mm) — see constants.ts.
  // NOTE: bottomPlugHoleDiameter is fixed at 40 mm (PLUG_HOLE_DIAMETER) — see constants.ts

  /** mm */
  bulgeMm: number
  /** 0..1 */
  bulgePos: number
  /** mm */
  waistMm: number
  /** 0..1 */
  waistPos: number

  /** total twist across height, degrees */
  twistDeg: number
  twistProfile: TwistProfile

  pattern: PatternType
  /** mm */
  patternAmpMm: number
  /** cycles around circumference */
  patternFreq: number
  /** cycles along height */
  patternYFreq: number
  /** enable mirrored ribs (cross-hatch grid) */
  patternMirror: boolean
  /** smooth fade pattern at TOP edge to prevent elephant foot.
   *  Bottom fade is ALWAYS applied (guarantees a circular base). */
  patternEdgeFade: boolean

  /** enable spiral veins (thick braids around the lamp) */
  veinsEnabled: boolean
  /** number of veins (2-8) */
  veinCount: number
  /** mm - how much veins protrude */
  veinAmplitudeMm: number
  /** number of full turns around the lamp */
  veinTurns: number
  /** tilt angle in degrees (-90..90), adjusts diagonal angle of braids */
  veinTiltDeg: number
  /** angular width of each vein (0.05..1.0) */
  veinWidth: number
  /** mm - depth of valleys between veins */
  veinValleyMm: number
}

/**
 * Inner shade parameters (used only when "double shade" mode is on).
 *
 * Physically sits INSIDE the outer shade, resting on top of its bottom plug.
 * Constraints (defined in constants.ts):
 *   - height = outer.height - INNER_HEIGHT_REDUCTION_MM (always 2 mm shorter)
 *   - base diameter = INNER_BASE_DIAMETER (fixed 100 mm)
 *   - top diameter ∈ [INNER_BASE_DIAMETER, outer.topDiameter]
 *
 * Per spec, the inner shade has NO veins and NO T-grooves — so it uses the
 * same `ShadeParams` shape but the builder forces `veinsEnabled=false` and
 * `pattern !== 'groovesT'`.
 */
export type InnerShadeParams = {
  /** mm; auto-derived from outer height minus INNER_HEIGHT_REDUCTION_MM */
  height: number
  /** mm; user-controllable, clamped to [INNER_BASE_DIAMETER, outer.topDiameter] */
  topDiameter: number
  /** mm */
  thickness: number
  /** profile shape */
  bulgeMm: number
  bulgePos: number
  waistMm: number
  waistPos: number
  /** twist */
  twistDeg: number
  twistProfile: TwistProfile
  /** pattern (no T-grooves for inner; 'none' = smooth) */
  pattern: Exclude<PatternType, 'groovesT'>
  patternAmpMm: number
  patternFreq: number
  patternYFreq: number
  patternMirror: boolean
  patternEdgeFade: boolean
  /** resolution (kept independent so user can lower it for performance) */
  radialSegments: number
  heightSegments: number
}