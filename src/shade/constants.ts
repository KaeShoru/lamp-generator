/**
 * Fixed physical constraints for the lamp shade generator.
 *
 * These values are hard-coded by hardware / 3D-printer requirements
 * and intentionally excluded from the UI controls.
 */

/** Fixed base diameter in mm. The bottom of every shade is exactly this wide. */
export const BASE_DIAMETER = 150

/** Maximum allowed diameter anywhere on the shade in mm.
 *  Constrained by the 3D printer's build volume. */
export const MAX_DIAMETER = 250

/** Fixed diameter of the central wiring hole in the bottom plug, in mm.
 *  The hole is always present (allows a standard E27 / pendant kit to pass through). */
export const PLUG_HOLE_DIAMETER = 40

/** Minimum allowed wall thickness in mm. Anything thinner would be too fragile
 *  for 3D printing and translucent diffusion of the lamp shade.
 *  Locked at 1.2 mm per customer spec (printer constraint). */
export const MIN_WALL_THICKNESS = 1.2

/** Fixed width (in mm, measured as arc length at the base radius) of every
 *  T-groove ridge. The ridge is a thin perpendicular fin; making the width
 *  constant gives a consistent print result regardless of ridge count. */
export const T_RIDGE_WIDTH = 1.2

/** Fixed thickness of the bottom plug's upper seal in mm.
 *  The plug always follows the lamp's bottom shape (circular base blend),
 *  and this constant locks its wall thickness — no longer a user control. */
export const PLUG_SEAL_THICKNESS = 2.0

/** Convenience radii (half-diameters). */
export const BASE_RADIUS = BASE_DIAMETER / 2
export const MAX_RADIUS = MAX_DIAMETER / 2
export const PLUG_HOLE_RADIUS = PLUG_HOLE_DIAMETER / 2

// ─── INNER SHADE (double-shade mode) ───────────────────────────────
// When inner shade is enabled, a second smaller shade sits INSIDE the outer
// one. Its base diameter is fixed at 100 mm (≥ 100 mm per customer spec;
// fits inside outer base of 150 mm). Its base rests on top of the outer
// shade's bottom plug (which is 2 mm thick), so the inner shade's local
// origin (y=0) corresponds to y = INNER_BASE_Y_OFFSET in the outer's frame.

/** Fixed base diameter of the inner shade, mm. */
export const INNER_BASE_DIAMETER = 100
/** Fixed base radius of the inner shade, mm. */
export const INNER_BASE_RADIUS = INNER_BASE_DIAMETER / 2
/**
 * Y offset of the inner shade's local origin (y=0) relative to the outer
 * shade's local origin (y=0). Equals the outer plug's thickness (2 mm) —
 * the inner shade sits ON TOP of the outer plug.
 *
 * NOTE: This value is now correctly applied to BOTH the parametric body AND
 * the external STL plug (see buildShadeGeometry.ts). Previously only the
 * body was lifted, which produced a gap between body and plug.
 */
export const INNER_BASE_Y_OFFSET = PLUG_SEAL_THICKNESS
/** Height of the inner shade is always 2 mm LESS than the outer (per spec). */
export const INNER_HEIGHT_REDUCTION_MM = 2.0
/** Minimum allowed top diameter of the inner shade, mm. */
export const INNER_MIN_TOP_DIAMETER = INNER_BASE_DIAMETER

/**
 * Safety margin between the outer shade's top diameter and the inner shade's
 * max allowed top diameter, mm. The inner shade must always be slightly
 * narrower than the outer so it physically fits inside (and so its mesh
 * never intersects the outer's inner wall during preview/export).
 */
export const INNER_TOP_DIAMETER_MARGIN = 2

/**
 * Soft reference value: the minimum OUTER top diameter (mm) that gives the
 * inner shade (base = 100 mm) at least 2 mm of radial clearance.
 *
 * NOTE: Per user feedback, this is NO LONGER enforced as a hard clamp — the
 * outer top diameter slider keeps its full range [10..240] regardless of inner
 * mode. The inner shade's max top diameter IS still bounded by
 * computeInnerMaxTopDiameter(top) so its mesh won't escape the outer at the
 * TOP, but the outer's waist and top are user-controlled.
 *
 * The user is expected to design with care: the inner shade is inserted into
 * the outer from ABOVE, so the outer's top opening must be wide enough for
 * the inner's base (100 mm) to pass through. The UI shows a hint about this
 * when double-shade mode is enabled.
 */
export const INNER_MIN_OUTER_TOP_DIAMETER = 104

/**
 * Helper: compute the inner shade's max allowed top diameter given the outer
 * shade's TOP DIAMETER ONLY. Does NOT subtract the outer's waist — per spec,
 * the outer's waist is separately clamped (when inner is enabled) via
 * computeOuterMaxWaistMm() so it can never narrow the profile below the
 * inner base. This keeps the inner-top bound simple and predictable.
 *
 * @param outerTopDiameter  Outer shade's top diameter (mm)
 * @returns Max inner top diameter (mm), never below INNER_BASE_DIAMETER
 */
export function computeInnerMaxTopDiameter(outerTopDiameter: number): number {
  const outerTopR = outerTopDiameter / 2
  // The outer's top is the narrowest profile point (waist is bounded separately
  // by computeOuterMaxWaistMm to never go below the inner base). Apply a small
  // safety margin so the inner never touches the outer's inner wall.
  const innerMaxR = outerTopR - INNER_TOP_DIAMETER_MARGIN / 2
  return Math.max(INNER_BASE_DIAMETER, innerMaxR * 2)
}

/**
 * Helper: compute the OUTER shade's max allowed waistMm when the inner shade
 * is enabled. The inner shade's BASE ring (radius = INNER_BASE_RADIUS = 50 mm)
 * must fit inside the outer's narrowest profile point with at least 1 mm of
 * radial clearance — otherwise the inner base would intersect the outer's
 * wall.
 *
 * Formula: outer narrowest radius ≈ min(BASE_RADIUS, outerTopR) − waistMm
 * Constraint:  min(BASE_RADIUS, outerTopR) − waistMm ≥ INNER_BASE_RADIUS + 1
 *   ⇒ waistMm ≤ min(BASE_RADIUS, outerTopR) − INNER_BASE_RADIUS − 1
 *
 * @param outerTopDiameter  Outer shade's top diameter (mm)
 * @returns Max waistMm (mm). Always ≥ 0. Caller should clamp waistMm to this.
 */
export function computeOuterMaxWaistMm(outerTopDiameter: number): number {
  const outerTopR = outerTopDiameter / 2
  const outerMinR = Math.min(BASE_RADIUS, outerTopR)
  return Math.max(0, outerMinR - INNER_BASE_RADIUS - 1)
}
