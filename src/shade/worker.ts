import * as THREE from 'three'
import type { ShadeParams } from './types'
import { buildShadeGeometry } from './buildShadeGeometry'

type Req = { id: number; params: ShadeParams }
type ResOk = {
  id: number
  ok: true
  position: ArrayBuffer
  normal: ArrayBuffer
  index: ArrayBuffer | null
}
type ResErr = { id: number; ok: false; error: string }

function copyToArrayBuffer(view: ArrayBufferView): ArrayBuffer {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength)
  const out = new Uint8Array(bytes.byteLength)
  out.set(bytes)
  return out.buffer
}

function serializeGeometry(geom: THREE.BufferGeometry): Omit<ResOk, 'id' | 'ok'> {
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

self.onmessage = (ev: MessageEvent<Req>) => {
  const { id, params } = ev.data
  try {
    const geom = buildShadeGeometry(params)
    const payload = serializeGeometry(geom)
    const msg: ResOk = { id, ok: true, ...payload }
    ;(self as unknown as { postMessage: (m: unknown, t?: Transferable[]) => void }).postMessage(
      msg,
      [
      msg.position,
      msg.normal,
      ...(msg.index ? [msg.index] : []),
      ],
    )
  } catch (e) {
    console.error('[shade-worker] buildShadeGeometry error:', e)
    const msg: ResErr = { id, ok: false, error: e instanceof Error ? e.message : String(e) }
    ;(self as unknown as { postMessage: (m: unknown) => void }).postMessage(msg)
  }
}

