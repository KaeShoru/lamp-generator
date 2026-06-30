import * as THREE from 'three'
import type { ShadeParams, InnerShadeParams } from './types'
import { buildShadeGeometry } from './buildShadeGeometry'
import { INNER_BASE_RADIUS, INNER_BASE_Y_OFFSET, INNER_HEIGHT_REDUCTION_MM } from './constants'

type Req = {
  id: number
  params: ShadeParams
  /** Optional static bottom geometry for OUTER shade (non-indexed XYZ, 9 floats/tri). */
  externalBottom?: Float32Array | null
  /**
   * Normals matching `externalBottom` (non-indexed XYZ, same length).
   * Required to avoid the gray-polygon seam at y=0 — see `BuildOptions.externalBottomNormals`.
   */
  externalBottomNormals?: Float32Array | null
  /**
   * Inner shade params. When present, the worker builds a SECOND geometry
   * (the inner shade) and returns it via `innerPosition` / `innerNormal`.
   * The inner shade is always shifted up by INNER_BASE_Y_OFFSET (2 mm) and
   * uses INNER_BASE_RADIUS (50 mm) as its base radius.
   */
  inner?: InnerShadeParams | null
  /**
   * Optional static bottom geometry for INNER shade. Same format as `externalBottom`.
   * If omitted, the inner shade falls back to its parametric plug.
   */
  innerExternalBottom?: Float32Array | null
  innerExternalBottomNormals?: Float32Array | null
}

type GeometryPayload = {
  position: ArrayBuffer
  normal: ArrayBuffer
  index: ArrayBuffer | null
}

type ResOk = GeometryPayload & {
  id: number
  ok: true
  /** Inner shade geometry (only present when `req.inner` is provided). */
  innerPosition?: ArrayBuffer
  innerNormal?: ArrayBuffer
}

type ResErr = { id: number; ok: false; error: string }

function copyToArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out.buffer
}

function serializeGeometry(geom: THREE.BufferGeometry): GeometryPayload {
  const g = geom.index ? geom.toNonIndexed() : geom
  const pos = g.getAttribute('position') as THREE.BufferAttribute
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute | undefined

  if (!nrm) g.computeVertexNormals()
  const normal = (g.getAttribute('normal') as THREE.BufferAttribute).array as Float32Array
  const position = pos.array as Float32Array

  return {
    position: copyToArrayBuffer(position),
    normal: copyToArrayBuffer(normal),
    index: null,
  }
}

/**
 * Convert InnerShadeParams → ShadeParams for reuse with buildShadeGeometry.
 * Forces veinsEnabled=false and pattern≠groovesT (per spec: no veins / no T-grooves
 * on the inner shade). The outer-shade-only fields are filled with safe defaults.
 *
 * WAIST is also forced to 0 — per customer spec the inner shade is a simple
 * bulged cone with no hourglass narrowing. This is enforced here (worker) AND
 * in App.tsx (UI removes the innerWaistMm control; ControlsInner forces 0),
 * so even if a stale preset has innerWaistMm>0, the geometry is unaffected.
 */
function innerToFullParams(inner: InnerShadeParams): ShadeParams {
  return {
    height: inner.height,
    topDiameter: inner.topDiameter,
    thickness: inner.thickness,
    radialSegments: inner.radialSegments,
    heightSegments: inner.heightSegments,
    bulgeMm: inner.bulgeMm,
    bulgePos: inner.bulgePos,
    bulgeWidth: inner.bulgeWidth ?? 0.18,
    // Inner waist FORCED to 0 per spec.
    waistMm: 0,
    waistPos: 0.4,
    twistDeg: inner.twistDeg,
    twistProfile: inner.twistProfile,
    pattern: inner.pattern,
    patternAmpMm: inner.patternAmpMm,
    patternFreq: inner.patternFreq,
    patternYFreq: inner.patternYFreq,
    patternMirror: inner.patternMirror,
    patternEdgeFade: inner.patternEdgeFade,
    // Veins are disabled on the inner shade per spec.
    veinsEnabled: false,
    veinCount: 0,
    veinAmplitudeMm: 0,
    veinTurns: 0,
    veinTiltDeg: 0,
    veinWidth: 0.3,
    veinValleyMm: 0,
  }
}

self.onmessage = (ev: MessageEvent<Req>) => {
  const { id, params, externalBottom, externalBottomNormals, inner, innerExternalBottom, innerExternalBottomNormals } = ev.data
  try {
    // === OUTER ===
    const outerGeom = buildShadeGeometry(params, 0, {
      externalBottom: externalBottom ?? null,
      externalBottomNormals: externalBottomNormals ?? null,
    })
    const outerPayload = serializeGeometry(outerGeom)
    outerGeom.dispose()

    // === INNER (optional) ===
    let innerPayload: GeometryPayload | null = null
    if (inner) {
      // Inner height is always 2 mm less than the outer (per spec).
      const innerParams = innerToFullParams({
        ...inner,
        height: Math.max(10, params.height - INNER_HEIGHT_REDUCTION_MM),
      })
      // HARD RADIUS CAP = 100 mm (radius), independent of outer top diameter.
      // Per user feedback: the inner top diameter slider has a fixed [100..200]
      // range, and the user is responsible for picking a value that physically
      // fits inside the outer shade. The cap exists only to prevent the bulge,
      // waist, and pattern amplitudes from pushing the mesh beyond 100 mm radius
      // — it does NOT couple to the outer's topDiameter anymore.
      //
      // This must match the cap used in App.tsx → buildInnerBlob() exactly.
      const innerMaxR = 100
      const innerGeom = buildShadeGeometry(innerParams, 0, {
        externalBottom: innerExternalBottom ?? null,
        externalBottomNormals: innerExternalBottomNormals ?? null,
        baseRadiusOverride: INNER_BASE_RADIUS,
        yOffset: INNER_BASE_Y_OFFSET,
        maxRadius: innerMaxR,
      })
      innerPayload = serializeGeometry(innerGeom)
      innerGeom.dispose()
    }

    const msg: ResOk = {
      id,
      ok: true,
      ...outerPayload,
      ...(innerPayload
        ? { innerPosition: innerPayload.position, innerNormal: innerPayload.normal }
        : {}),
    }

    const transferList: Transferable[] = [msg.position, msg.normal]
    if (msg.index) transferList.push(msg.index)
    if (innerPayload) {
      transferList.push(innerPayload.position)
      transferList.push(innerPayload.normal)
    }

    ;(self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(msg, transferList)
  } catch (e) {
    console.error('[shade-worker] buildShadeGeometry error:', e)
    const msg: ResErr = { id, ok: false, error: e instanceof Error ? e.message : String(e) }
    ;(self as unknown as { postMessage: (m: unknown) => void }).postMessage(msg)
  }
}