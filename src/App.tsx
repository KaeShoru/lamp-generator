import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useControls, folder, Leva } from 'leva'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import './App.css'
import type { ShadeParams, InnerShadeParams } from './shade/types'
import { buildShadeGeometry } from './shade/buildShadeGeometry'
import {
  BASE_RADIUS,
  INNER_BASE_DIAMETER,
  INNER_BASE_RADIUS,
  INNER_BASE_Y_OFFSET,
  INNER_HEIGHT_REDUCTION_MM,
  INNER_MIN_OUTER_TOP_DIAMETER,
  MIN_WALL_THICKNESS,
} from './shade/constants'
import { loadBaseSTL } from './shade/loadBaseSTL'
import { sendOrder } from './api'

// ─── i18n ───────────────────────────────────────────────────────────
type Lang = 'ru' | 'en'
type ColorMode = 'white' | 'translucent'
const L: Record<string, Record<Lang, string>> = {
  fMain:{ru:'Основные размеры',en:'Main dimensions'},
  fProfile:{ru:'Профиль',en:'Profile'},fTwist:{ru:'Скручивание',en:'Twist'},
  fPattern:{ru:'Текстура',en:'Pattern'},
  fPrint:{ru:'Печать',en:'Print'},fView:{ru:'Вид',en:'View'},fPresets:{ru:'Пресеты',en:'Presets'},
  fOrder:{ru:'Заказ',en:'Order'},
  height:{ru:'Высота (мм)',en:'Height (mm)'},
  topDiameter:{ru:'Диаметр верха (мм)',en:'Top diameter (mm)'},
  thickness:{ru:'Толщина стенки (мм)',en:'Wall thickness (mm)'},
  thicknessFixed:{ru:'Зафиксирована 1.2 мм (принтер)',en:'Locked at 1.2 mm (printer)'},
  bulgeMm:{ru:'Выпуклость (мм)',en:'Bulge (mm)'},
  bulgePos:{ru:'Позиция выпуклости',en:'Bulge position'},
  bulgeWidth:{ru:'Ширина выпуклости',en:'Bulge width'},
  waistMm:{ru:'Талия (мм)',en:'Waist (mm)'},waistPos:{ru:'Позиция талии',en:'Waist position'},
  twistProfile:{ru:'Профиль скрутки',en:'Twist profile'},twistLinear:{ru:'Линейно',en:'Linear'},
  twistEaseInOut:{ru:'Плавно (ease)',en:'Ease in-out'},twistSine:{ru:'Синус',en:'Sine'},
  twistDeg:{ru:'Скручивание (°)',en:'Twist (°)'},
  pattern:{ru:'Текстура',en:'Pattern'},
  patNone:{ru:'Без текстуры (гладко)',en:'None (smooth)'},
  patRibsRect:{ru:'Рёбра (прямоуг.)',en:'Ribs (rect)'},
  patWave:{ru:'Волны',en:'Waves'},patAccordionTri:{ru:'Гармошка (треуг.)',en:'Accordion (tri)'},
  patGroovesRound:{ru:'Канавки (кругл.)',en:'Grooves (round)'},
  patternAmpMm:{ru:'Амплитуда (мм)',en:'Amplitude (mm)'},patternFreq:{ru:'Частота по кругу',en:'Frequency (around)'},
  patternYFreq:{ru:'Частота по высоте',en:'Frequency (height)'},
  radialSegments:{ru:'Качество по кругу',en:'Quality (around)'},
  heightSegments:{ru:'Качество по высоте',en:'Quality (height)'},
  modelColorMode:{ru:'Цвет плафона',en:'Shade color'},
  modelColorWhite:{ru:'Белый',en:'White'},modelColorTranslucent:{ru:'Полупрозрачный белый',en:'Translucent white'},
  bulbVisible:{ru:'Показать лампочку',en:'Show bulb'},
  language:{ru:'Язык / Language',en:'Язык / Language'},
  customerName:{ru:'Ваше имя',en:'Your name'},
  orderTitle:{ru:'Название заказа',en:'Order title'},
  sendOrderBtn:{ru:'Отправить заказ',en:'Send order'},
  sending:{ru:'Отправка…',en:'Sending…'},
  computing:{ru:'Считаю…',en:'Computing…'},
  ready:{ru:'Готово',en:'Ready'},
  geoError:{ru:'Ошибка геометрии',en:'Geometry error'},
  orderSent:{ru:'✅ Заказ отправлен!',en:'✅ Order sent!'},
  orderError:{ru:'❌ Ошибка отправки',en:'❌ Send error'},
  control:{ru:'Управление',en:'Controls'},
  mouseCtrl:{ru:'Мышь: вращать • колёсико: зум • правая: панорамирование',en:'Mouse: rotate • wheel: zoom • right: pan'},
  hint:{ru:'Подсказка',en:'Hint'},
  hintDesc:{ru:'Параметры — в панели Leva (справа), разбиты по вкладкам. STL отправляется в Telegram с максимальным качеством и сглаживанием. Ctrl+Z — отменить последнее изменение.',en:'Settings — in the Leva panel (right), organized in folders. STL is sent to Telegram with maximum quality and smoothing. Ctrl+Z — undo last change.'},
  fVeins:{ru:'Жилы (косички)',en:'Veins (braids)'},
  veinsEnabled:{ru:'Включить жилы',en:'Enable veins'},
  veinCount:{ru:'Количество жил',en:'Vein count'},
  veinAmplitudeMm:{ru:'Выпуклость жил (мм)',en:'Vein amplitude (mm)'},
  veinTurns:{ru:'Витков вокруг',en:'Turns around'},
  veinTiltDeg:{ru:'Наклон (°)',en:'Tilt (°)'},
  veinWidth:{ru:'Ширина жилы',en:'Vein width'},
  veinValleyMm:{ru:'Глубина впадин (мм)',en:'Valley depth (mm)'},
  patternMirror:{ru:'Зеркально (сетка)',en:'Mirror (grid)'},patternEdgeFade:{ru:'Сглаживание краёв',en:'Edge fade'},
  fInner:{ru:'Внутренний плафон',en:'Inner shade'},
  doubleShadeEnabled:{ru:'Включить внутренний плафон',en:'Enable inner shade'},
  innerTopDiameter:{ru:'Диаметр верха (мм)',en:'Top diameter (mm)'},
  innerThickness:{ru:'Толщина стенки (мм)',en:'Wall thickness (mm)'},
  innerBulgeMm:{ru:'Выпуклость (мм)',en:'Bulge (mm)'},
  innerBulgePos:{ru:'Позиция выпуклости',en:'Bulge position'},
  innerBulgeWidth:{ru:'Ширина выпуклости',en:'Bulge width'},
  innerWaistMm:{ru:'Талия (мм)',en:'Waist (mm)'},innerWaistPos:{ru:'Позиция талии',en:'Waist position'},
  innerTwistProfile:{ru:'Профиль скрутки',en:'Twist profile'},innerTwistDeg:{ru:'Скручивание (°)',en:'Twist (°)'},
  innerPattern:{ru:'Текстура',en:'Pattern'},
  innerPatternAmpMm:{ru:'Амплитуда (мм)',en:'Amplitude (mm)'},
  innerPatternFreq:{ru:'Частота по кругу',en:'Frequency (around)'},
  innerPatternYFreq:{ru:'Частота по высоте',en:'Frequency (height)'},
  innerPatternMirror:{ru:'Зеркально',en:'Mirror'},innerPatternEdgeFade:{ru:'Сглаживание краёв',en:'Edge fade'},
  innerRadialSegments:{ru:'Качество по кругу',en:'Quality (around)'},
  innerHeightSegments:{ru:'Качество по высоте',en:'Quality (height)'},
  exportTarget:{ru:'Что отправлять',en:'Export target'},
  exportOuter:{ru:'Только наружный',en:'Outer only'},
  exportInner:{ru:'Только внутренний',en:'Inner only'},
  innerHint:{ru:'Внутренний плафон всегда на 2 мм ниже наружного и стоит на основании (2 мм над нулём). Основание 100 мм. Толщина ≥ 1.2 мм.',en:'Inner shade is always 2 mm shorter than outer and sits 2 mm above origin. Base is 100 mm. Thickness ≥ 1.2 mm.'},
  innerFitHint:{ru:'⚠️ Внутренний плафон вставляется в наружный сверху — диаметр верха наружного должен быть больше основания внутреннего (100 мм). Проверьте посадку перед заказом.',en:'⚠️ Inner shade is inserted into outer from above — outer top diameter must be larger than inner base (100 mm). Verify fit before ordering.'},
  savePreset:{ru:'Сохранить пресет',en:'Save preset'},
  loadPreset:{ru:'Загрузить',en:'Load'},
  presetSaved:{ru:'Пресет сохранён!',en:'Preset saved!'},
  presetLoaded:{ru:'Пресет загружен!',en:'Preset loaded!'},
  enterName:{ru:'Введите название',en:'Enter a name'},
  uploadProgress:{ru:'Загрузано',en:'Uploaded'},
  nameRequired:{ru:'Заполните имя и название',en:'Fill in name and title'},
  plugInfo:{ru:'Толщина заглушки зафиксирована на 2 мм, форма — по дну плафона',en:'Plug thickness is fixed at 2 mm, shape follows the lamp base'},
  bulbInfo:{ru:'Лампочка только для предпросмотра — в STL не попадает',en:'Bulb is preview-only — not included in exported STL'},
}
const t = (key: string, lang: Lang) => L[key]?.[lang] ?? key

// ─── Color presets for the shade material ───────────────────────────
const COLOR_MODES: Record<ColorMode, { hex: string; opacity: number; transparent: boolean; roughness: number }> = {
  white:       { hex: '#f8fafc', opacity: 1.0, transparent: false, roughness: 0.55 },
  translucent: { hex: '#f1f5f9', opacity: 0.45, transparent: true,  roughness: 0.7  },
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [d, setD] = useState(value)
  useEffect(() => { const t = window.setTimeout(() => setD(value), delayMs); return () => window.clearTimeout(t) }, [value, delayMs])
  return d
}

// ─── worker types ───────────────────────────────────────────────────
type WorkerResponse = {
  id: number; ok: true
  position: ArrayBuffer; normal: ArrayBuffer; index: ArrayBuffer | null
  /** Inner shade geometry (only when inner params were sent). */
  innerPosition?: ArrayBuffer; innerNormal?: ArrayBuffer
} | { id: number; ok: false; error: string }
type ComputeState = { loading: boolean; error: string | null }

type ExternalBottom = { positions: Float32Array; normals: Float32Array }

// ─── Preset keys (everything except language/modelColorMode/bulbVisible/customer/order) ──
const presetKeys = [
  'height','topDiameter',
  'bulgeMm','bulgePos','bulgeWidth','waistMm','waistPos','twistDeg','twistProfile','pattern','patternAmpMm',
  'patternFreq','patternYFreq','patternMirror',
  'veinsEnabled','veinCount','veinAmplitudeMm','veinTurns','veinTiltDeg','veinWidth','veinValleyMm',
  'radialSegments','heightSegments','patternEdgeFade',
  // Inner shade (double-shade mode). Persisted together so enabling the toggle
  // restores the previously saved inner configuration.
  // 'thickness' / 'innerThickness' removed — thickness is now FIXED at
  // MIN_WALL_THICKNESS (1.2 mm), no UI control.
  // 'exportTarget' removed — when inner is enabled, BOTH STL files are sent.
  'doubleShadeEnabled',
  'innerTopDiameter','innerBulgeMm','innerBulgePos','innerBulgeWidth','innerWaistMm','innerWaistPos',
  'innerTwistDeg','innerTwistProfile','innerPattern','innerPatternAmpMm','innerPatternFreq',
  'innerPatternYFreq','innerPatternMirror','innerPatternEdgeFade',
  'innerRadialSegments','innerHeightSegments',
]

const defaultControlValues: Record<string, unknown> = {
  language: 'ru', modelColorMode: 'white' as ColorMode, bulbVisible: true,
  height: 160, topDiameter: 55,
  // thickness removed from UI — fixed at MIN_WALL_THICKNESS (1.2 mm) for both
  // outer and inner shades (printer constraint).
  bulgeMm: 18, bulgePos: 0.55, bulgeWidth: 0.18, waistMm: 10, waistPos: 0.35,
  twistDeg: 0, twistProfile: 'linear', pattern: 'ribsRect',
  patternAmpMm: 2.8, patternFreq: 28, patternYFreq: 1.0,
  radialSegments: 120, heightSegments: 96,
  patternMirror: false, patternEdgeFade: true,
  veinsEnabled: false, veinCount: 4, veinAmplitudeMm: 6, veinTurns: 1.5, veinTiltDeg: 0, veinWidth: 0.35, veinValleyMm: 0,
  customerName: '', orderTitle: '',
  // Double-shade mode (inner shade). Off by default; settings hidden in UI
  // until the user toggles it on.
  // 'exportTarget' removed — when inner is enabled, BOTH outer and inner STL
  // are sent (with a small delay so they appear as separate Telegram messages).
  doubleShadeEnabled: false,
  // Default inner top diameter — must be ≥ INNER_BASE_DIAMETER (100 mm).
  // The inner shade narrows from base (100 mm) to top, so default top = 100 mm
  // (cylinder) or higher. We use 120 mm as a sane default (slightly wider than
  // base, gives a visible "cone" shape on first enable).
  innerTopDiameter: 120,
  innerBulgeMm: 10, innerBulgePos: 0.5, innerBulgeWidth: 0.18, innerWaistMm: 5, innerWaistPos: 0.4,
  innerTwistDeg: 0, innerTwistProfile: 'linear', innerPattern: 'ribsRect',
  innerPatternAmpMm: 2.0, innerPatternFreq: 20, innerPatternYFreq: 1.0,
  innerPatternMirror: false, innerPatternEdgeFade: true,
  innerRadialSegments: 96, innerHeightSegments: 80,
}

// ─── Build Leva schema with translations and saved values ───────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSchema(lang: Lang, saved: Record<string, unknown>): any {
  const s = (k: string) => saved[k] ?? defaultControlValues[k]
  const innerEnabled = s('doubleShadeEnabled') as boolean

  // WAIST is intentionally NOT a user-visible control on the inner shade
  // per customer spec (inner shade is a simple bulged cone — no hourglass).
  // The inner waistMm / waistPos fields are forced to 0 in ControlsInner
  // and in worker.ts, so they never affect geometry.
  //
  // OUTER waistMm and topDiameter are NOT auto-clamped when inner is enabled
  // — per user feedback, the user is responsible for picking values that
  // physically fit the inner shade. The inner shade is inserted into the
  // outer from ABOVE, so the outer's top opening must be wide enough for
  // the inner's base (100 mm) to pass through (recommend outer top ≥ 104 mm).
  // The hint in the side panel reminds the user of this when double-shade
  // mode is enabled.

  // The inner folder is only populated when the user enables double-shade mode.
  // When disabled, the folder is empty so its settings don't clutter the panel.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const innerFolder: Record<string, any> = innerEnabled ? {
    // Inner top diameter — fixed range [100..200] per user feedback.
    // Min = INNER_BASE_DIAMETER (100 mm): the inner shade narrows from base
    // to top, so top can't be smaller than base.
    // Max = 200 mm (hard cap, independent of outer top) — the user is
    // responsible for picking a value that physically fits inside the outer
    // shade (see innerFitHint in the side panel).
    innerTopDiameter: {
      label: t('innerTopDiameter',lang),
      value: Math.min(
        Math.max(s('innerTopDiameter') as number, INNER_BASE_DIAMETER),
        200,
      ),
      min: INNER_BASE_DIAMETER,
      max: 200,
      step: 1,
    },
    innerBulgeMm: { label: t('innerBulgeMm',lang), value: s('innerBulgeMm') as number, min: 0, max: 40, step: 0.5 },
    innerBulgePos: { label: t('innerBulgePos',lang), value: s('innerBulgePos') as number, min: 0, max: 1, step: 0.01 },
    innerBulgeWidth: { label: t('innerBulgeWidth',lang), value: s('innerBulgeWidth') as number, min: 0.05, max: 0.5, step: 0.01 },
    // innerWaistMm / innerWaistPos REMOVED per spec (no hourglass on inner shade)
    innerTwistProfile: { label: t('innerTwistProfile',lang), options: { [t('twistLinear',lang)]: 'linear', [t('twistEaseInOut',lang)]: 'easeInOut', [t('twistSine',lang)]: 'sine' }, value: s('innerTwistProfile') as string },
    innerTwistDeg: { label: t('innerTwistDeg',lang), value: s('innerTwistDeg') as number, min: -1080, max: 1080, step: 5 },
    innerPattern: { label: t('innerPattern',lang), options: { [t('patNone',lang)]: 'none', [t('patRibsRect',lang)]: 'ribsRect', [t('patWave',lang)]: 'wave', [t('patAccordionTri',lang)]: 'accordionTri', [t('patGroovesRound',lang)]: 'groovesRound' }, value: s('innerPattern') as string },
    innerPatternAmpMm: { label: t('innerPatternAmpMm',lang), value: s('innerPatternAmpMm') as number, min: 0, max: 16, step: 0.1 },
    innerPatternFreq: { label: t('innerPatternFreq',lang), value: s('innerPatternFreq') as number, min: 0, max: 160, step: 1 },
    innerPatternYFreq: { label: t('innerPatternYFreq',lang), value: s('innerPatternYFreq') as number, min: 0, max: 16, step: 0.1 },
    innerPatternMirror: { label: t('innerPatternMirror',lang), value: s('innerPatternMirror') as boolean },
    innerPatternEdgeFade: { label: t('innerPatternEdgeFade',lang), value: s('innerPatternEdgeFade') as boolean },
    // exportTarget REMOVED — when inner shade is enabled, BOTH outer and inner
    // STL are sent (with a small delay between them). When disabled, only outer.
  } : {}

  return {
    [t('fView',lang)]: folder({
      language: { label: t('language',lang), options: { 'Русский': 'ru', 'English': 'en' }, value: lang },
      modelColorMode: { label: t('modelColorMode',lang), options: { [t('modelColorWhite',lang)]: 'white', [t('modelColorTranslucent',lang)]: 'translucent' }, value: s('modelColorMode') as string },
      bulbVisible: { label: t('bulbVisible',lang), value: s('bulbVisible') as boolean },
    }),
    [t('fOrder',lang)]: folder({
      customerName: { label: t('customerName',lang), value: s('customerName') as string, placeholder: lang === 'ru' ? 'Иван' : 'John' },
      orderTitle: { label: t('orderTitle',lang), value: s('orderTitle') as string, placeholder: lang === 'ru' ? 'Плафон для спальни' : 'Bedroom shade' },
    }),
    [t('fMain',lang)]: folder({
      height: { label: t('height',lang), value: s('height') as number, min: 40, max: 360, step: 1 },
      // No auto-clamp on topDiameter when inner is enabled — per user feedback,
      // the user is responsible for picking a top diameter wide enough for
      // the inner shade (≥ 104 mm recommended). The hint in the side panel
      // reminds them. The inner shade's max top is still bounded by
      // computeInnerMaxTopDiameter(top) so its mesh stays inside the outer.
      topDiameter: {
        label: t('topDiameter',lang),
        value: s('topDiameter') as number,
        min: 10,
        max: 240,
        step: 1,
      },
    }),
    [t('fProfile',lang)]: folder({
      bulgeMm: { label: t('bulgeMm',lang), value: s('bulgeMm') as number, min: 0, max: 80, step: 0.5 },
      bulgePos: { label: t('bulgePos',lang), value: s('bulgePos') as number, min: 0, max: 1, step: 0.01 },
      bulgeWidth: { label: t('bulgeWidth',lang), value: s('bulgeWidth') as number, min: 0.05, max: 0.5, step: 0.01 },
      // No auto-clamp on waistMm — per user feedback, the user is responsible
      // for keeping the outer's profile wide enough for the inner shade at
      // every height. The hint in the side panel reminds them.
      waistMm: { label: t('waistMm',lang), value: s('waistMm') as number, min: 0, max: 80, step: 0.5 },
      waistPos: { label: t('waistPos',lang), value: s('waistPos') as number, min: 0, max: 1, step: 0.01 },
    }),
    [t('fTwist',lang)]: folder({
      twistProfile: { label: t('twistProfile',lang), options: { [t('twistLinear',lang)]: 'linear', [t('twistEaseInOut',lang)]: 'easeInOut', [t('twistSine',lang)]: 'sine' }, value: s('twistProfile') as string },
      twistDeg: { label: t('twistDeg',lang), value: s('twistDeg') as number, min: -1080, max: 1080, step: 5 },
    }),
    [t('fPattern',lang)]: folder({
      pattern: { label: t('pattern',lang), options: { [t('patNone',lang)]: 'none', [t('patRibsRect',lang)]: 'ribsRect', [t('patWave',lang)]: 'wave', [t('patAccordionTri',lang)]: 'accordionTri', [t('patGroovesRound',lang)]: 'groovesRound', 'Т-образные': 'groovesT' }, value: s('pattern') as string },
      patternAmpMm: { label: t('patternAmpMm',lang), value: s('patternAmpMm') as number, min: 0, max: 16, step: 0.1 },
      patternFreq: { label: t('patternFreq',lang), value: s('patternFreq') as number, min: 0, max: 160, step: 1 },
      patternYFreq: { label: t('patternYFreq',lang), value: s('patternYFreq') as number, min: 0, max: 16, step: 0.1 },
      patternMirror: { label: t('patternMirror',lang), value: s('patternMirror') as boolean },
      patternEdgeFade: { label: t('patternEdgeFade',lang), value: s('patternEdgeFade') as boolean },
    }),
    [t('fVeins',lang)]: folder({
      veinsEnabled: { label: t('veinsEnabled',lang), value: s('veinsEnabled') as boolean },
      veinCount: { label: t('veinCount',lang), value: s('veinCount') as number, min: 2, max: 8, step: 1 },
      veinAmplitudeMm: { label: t('veinAmplitudeMm',lang), value: s('veinAmplitudeMm') as number, min: 0, max: 30, step: 0.5 },
      veinTurns: { label: t('veinTurns',lang), value: s('veinTurns') as number, min: -8, max: 8, step: 0.25 },
      veinTiltDeg: { label: t('veinTiltDeg',lang), value: s('veinTiltDeg') as number, min: -90, max: 90, step: 5 },
      veinWidth: { label: t('veinWidth',lang), value: s('veinWidth') as number, min: 0.05, max: 1.0, step: 0.05 },
      veinValleyMm: { label: t('veinValleyMm',lang), value: s('veinValleyMm') as number, min: 0, max: 20, step: 0.5 },
    }),
    [t('fInner',lang)]: folder({
      doubleShadeEnabled: { label: t('doubleShadeEnabled',lang), value: innerEnabled },
      ...innerFolder,
    }),
    // Print quality folder (fPrint) removed — the values are still in state
    // (radialSegments=120, heightSegments=96 by default) but no longer
    // user-editable. The print-quality presets were never used in practice;
    // the defaults are good enough for both preview and export.
  }
}

// ─── ShadeMesh: builds BOTH outer and (optionally) inner shade ──────
function ShadeMesh({
  params,
  innerParams,
  colorMode,
  forceTranslucent = false,
  externalBottom,
  innerExternalBottom = null,
  onComputeState,
}: {
  params: ShadeParams
  innerParams: InnerShadeParams | null
  colorMode: ColorMode
  /** Forces OUTER shade into translucent mode so inner shade is visible through it. */
  forceTranslucent?: boolean
  externalBottom: ExternalBottom | null
  /** Optional STL plug for the INNER shade (loaded from InsideShadeBottom.stl). */
  innerExternalBottom?: ExternalBottom | null
  onComputeState?: (s: ComputeState) => void
}) {
  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)
  const latestIdRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [innerGeometry, setInnerGeometry] = useState<THREE.BufferGeometry | null>(null)

  useEffect(() => { onComputeState?.({ loading, error }) }, [loading, error, onComputeState])

  useEffect(() => {
    const w = new Worker(new URL('./shade/worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = w
    w.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const msg = ev.data; if (msg.id !== latestIdRef.current) return
      if (!msg.ok) { setError(msg.error || 'worker error'); setLoading(false); return }
      setError(null)
      const pos = new Float32Array(msg.position), nrm = new Float32Array(msg.normal)
      const g = new THREE.BufferGeometry()
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3))
      g.computeBoundingBox()
      setGeometry(prev => { prev?.dispose(); return g })

      if (msg.innerPosition && msg.innerNormal) {
        const ip = new Float32Array(msg.innerPosition), inrm = new Float32Array(msg.innerNormal)
        const ig = new THREE.BufferGeometry()
        ig.setAttribute('position', new THREE.BufferAttribute(ip, 3))
        ig.setAttribute('normal', new THREE.BufferAttribute(inrm, 3))
        ig.computeBoundingBox()
        setInnerGeometry(prev => { prev?.dispose(); return ig })
      } else {
        setInnerGeometry(prev => { prev?.dispose(); return null })
      }
      setLoading(false)
    }
    return () => {
      w.terminate(); workerRef.current = null
      setGeometry(prev => { prev?.dispose(); return null })
      setInnerGeometry(prev => { prev?.dispose(); return null })
    }
  }, [])

  useEffect(() => {
    const w = workerRef.current; if (!w) return
    setLoading(true); setError(null)
    const id = ++reqIdRef.current; latestIdRef.current = id
    const positionsCopy = externalBottom ? new Float32Array(externalBottom.positions) : null
    const normalsCopy = externalBottom ? new Float32Array(externalBottom.normals) : null
    const innerPositionsCopy = innerExternalBottom ? new Float32Array(innerExternalBottom.positions) : null
    const innerNormalsCopy = innerExternalBottom ? new Float32Array(innerExternalBottom.normals) : null
    w.postMessage({
      id, params,
      externalBottom: positionsCopy,
      externalBottomNormals: normalsCopy,
      inner: innerParams,
      innerExternalBottom: innerPositionsCopy,
      innerExternalBottomNormals: innerNormalsCopy,
    })
  }, [params, innerParams, externalBottom, innerExternalBottom])

  const material = useMemo(() => {
    // In double-shade mode the outer shade is forced translucent so the inner
    // shade is visible through it. Otherwise we honour the user's colorMode.
    const effectiveMode: ColorMode = forceTranslucent ? 'translucent' : colorMode
    const c = COLOR_MODES[effectiveMode] ?? COLOR_MODES.white
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(c.hex),
      metalness: 0.05,
      roughness: c.roughness,
      transparent: c.transparent,
      opacity: c.opacity,
      depthWrite: !c.transparent,
      side: THREE.DoubleSide,
    })
  }, [colorMode, forceTranslucent])

  // Inner shade material — always SOLID WHITE so it's clearly visible inside
  // the (now translucent) outer shell. Per user feedback: when outer is forced
  // translucent, inner should be opaque white to be readable.
  const innerMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color('#f8fafc'),
      metalness: 0.05,
      roughness: 0.55,
      transparent: false,
      opacity: 1.0,
      depthWrite: true,
      side: THREE.DoubleSide,
    })
  }, [])

  if (!geometry) {
    const topR = params.topDiameter / 2, baseR = BASE_RADIUS
    return <mesh name="shadeMesh" castShadow receiveShadow>
      <cylinderGeometry args={[topR, baseR, params.height, 48, 1]} />
      <meshStandardMaterial color="#334155" roughness={0.85} metalness={0.0} />
    </mesh>
  }
  return <>
    <mesh name="shadeMesh" geometry={geometry} material={material} castShadow receiveShadow />
    {innerGeometry && (
      <mesh name="innerShadeMesh" geometry={innerGeometry} material={innerMaterial} castShadow receiveShadow />
    )}
    {loading ? <mesh position={[0, params.height + 14, 0]}><sphereGeometry args={[2.2, 16, 16]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1} /></mesh> : null}
  </>
}

// ─── BulbMesh: preview-only STL of the lightbulb, centered at origin ─
function BulbMesh({ visible }: { visible: boolean }) {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loader = new STLLoader()
    loader.load(
      'Bulb.stl',
      (g) => { g.computeVertexNormals(); g.computeBoundingBox(); setGeometry(g) },
      undefined,
      (err: unknown) => {
        const msg = (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string')
          ? (err as { message: string }).message
          : String(err)
        setError(msg)
      },
    )
    return () => { setGeometry(prev => { prev?.dispose(); return null }) }
  }, [])

  const material = useMemo(() => new THREE.MeshStandardMaterial({
    color: new THREE.Color('#fff3c4'),
    metalness: 0.0,
    roughness: 0.35,
    transparent: true,
    opacity: 0.55,
    emissive: new THREE.Color('#ffd966'),
    emissiveIntensity: 0.35,
    depthWrite: false,
  }), [])

  if (!visible || error || !geometry) return null
  return (
    <mesh
      name="bulbPreview"
      geometry={geometry}
      material={material}
      raycast={() => null as unknown as void}
    />
  )
}

// ─── ControlsInner: remounts on language change via key={} ──────────
function ControlsInner({
  lang,
  savedRef,
  onParamsChange,
  onInnerParamsChange,
  onLangChange,
  onColorModeChange,
  onBulbVisibleChange,
  onOrderInfoChange,
  setRef,
}: {
  lang: Lang
  savedRef: React.MutableRefObject<Record<string, unknown>>
  onParamsChange: (p: ShadeParams) => void
  onInnerParamsChange: (p: InnerShadeParams | null) => void
  onLangChange: (l: Lang) => void
  onColorModeChange: (c: ColorMode) => void
  onBulbVisibleChange: (v: boolean) => void
  onOrderInfoChange: (name: string, title: string) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRef: React.MutableRefObject<((v: Record<string, unknown>) => void) | null>
}) {
  const [controls, set] = useControls(() => buildSchema(lang, savedRef.current))
  setRef.current = set as never

  const allKeys = ['language','modelColorMode','bulbVisible','customerName','orderTitle',...presetKeys]
  for (const k of allKeys) {
    if (controls[k] !== undefined) savedRef.current[k] = controls[k]
  }

  // Helper: read a numeric control value from savedRef (NOT from Leva `controls`).
  // Used for radialSegments / heightSegments which are no longer in the Leva
  // schema (fPrint folder was removed). They live only in savedRef and fall
  // back to defaults — reading them from `controls.X` would yield undefined
  // and break buildShadeGeometry.
  const sNum = (k: string): number =>
    (savedRef.current[k] as number | undefined) ?? (defaultControlValues[k] as number)

  useEffect(() => {
    const p: ShadeParams = {
      height: controls.height, topDiameter: controls.topDiameter,
      // Wall thickness is FIXED at MIN_WALL_THICKNESS (1.2 mm) — no UI control.
      thickness: MIN_WALL_THICKNESS,
      // radialSegments / heightSegments no longer in Leva schema — read from savedRef.
      radialSegments: sNum('radialSegments'),
      heightSegments: sNum('heightSegments'),
      bulgeMm: controls.bulgeMm, bulgePos: controls.bulgePos,
      bulgeWidth: (controls.bulgeWidth as number | undefined) ?? 0.18,
      waistMm: controls.waistMm, waistPos: controls.waistPos,
      twistDeg: controls.twistDeg, twistProfile: controls.twistProfile as ShadeParams['twistProfile'],
      pattern: controls.pattern as ShadeParams['pattern'], patternAmpMm: controls.patternAmpMm,
      patternFreq: controls.patternFreq, patternYFreq: controls.patternYFreq,
      patternMirror: controls.patternMirror as boolean,
      patternEdgeFade: controls.patternEdgeFade as boolean,
      veinsEnabled: controls.veinsEnabled as boolean, veinCount: controls.veinCount as number,
      veinAmplitudeMm: controls.veinAmplitudeMm as number, veinTurns: controls.veinTurns as number,
      veinTiltDeg: controls.veinTiltDeg as number,
      veinWidth: controls.veinWidth as number,
      veinValleyMm: controls.veinValleyMm as number,
    }
    onParamsChange(p)

    // Inner params — only emitted when double-shade mode is enabled.
    if (controls.doubleShadeEnabled) {
      // Inner top diameter — fixed range [100..200] per user feedback.
      // User is responsible for picking a value that physically fits the outer
      // (see innerFitHint). No dynamic coupling to outerTop anymore.
      const ip: InnerShadeParams = {
        height: Math.max(10, (controls.height as number) - INNER_HEIGHT_REDUCTION_MM),
        // Clamp topDiameter to [100, 200].
        topDiameter: Math.min(
          Math.max(controls.innerTopDiameter as number, INNER_BASE_DIAMETER),
          200,
        ),
        // Wall thickness is FIXED at MIN_WALL_THICKNESS (1.2 mm).
        thickness: MIN_WALL_THICKNESS,
        bulgeMm: controls.innerBulgeMm as number,
        bulgePos: controls.innerBulgePos as number,
        bulgeWidth: (controls.innerBulgeWidth as number | undefined) ?? 0.18,
        // WAIST REMOVED from inner shade per spec — inner shade is a simple
        // bulged cone, no hourglass narrowing.
        waistMm: 0,
        waistPos: 0.4,
        twistDeg: controls.innerTwistDeg as number,
        twistProfile: controls.innerTwistProfile as InnerShadeParams['twistProfile'],
        pattern: controls.innerPattern as InnerShadeParams['pattern'],
        patternAmpMm: controls.innerPatternAmpMm as number,
        patternFreq: controls.innerPatternFreq as number,
        patternYFreq: controls.innerPatternYFreq as number,
        patternMirror: controls.innerPatternMirror as boolean,
        patternEdgeFade: controls.innerPatternEdgeFade as boolean,
        // Inner radial/height segments also removed from UI — read from savedRef.
        radialSegments: sNum('innerRadialSegments'),
        heightSegments: sNum('innerHeightSegments'),
      }
      onInnerParamsChange(ip)
    } else {
      onInnerParamsChange(null)
    }

    onColorModeChange(controls.modelColorMode as ColorMode)
    onBulbVisibleChange(controls.bulbVisible as boolean)
    onOrderInfoChange(controls.customerName as string, controls.orderTitle as string)
  }, [controls, onParamsChange, onInnerParamsChange, onColorModeChange, onBulbVisibleChange, onOrderInfoChange])

  const currentLang = controls.language as Lang
  useEffect(() => {
    if (currentLang !== lang) onLangChange(currentLang)
  }, [currentLang, lang, onLangChange])

  return null
}

// ─── App ────────────────────────────────────────────────────────────
export default function App() {
  const [compute, setCompute] = useState<ComputeState>({ loading: true, error: null })
  const [isSending, setIsSending] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [orderMsg, setOrderMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [presetMsg, setPresetMsg] = useState('')

  const [lang, setLang] = useState<Lang>('ru')
  const savedRef = useRef<Record<string, unknown>>({ ...defaultControlValues })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setRef = useRef<((v: Record<string, unknown>) => void) | null>(null)

  const [params, setParams] = useState<ShadeParams>(() => buildParamsFromSaved(defaultControlValues))
  const [innerParams, setInnerParams] = useState<InnerShadeParams | null>(null)
  // exportTarget REMOVED — when inner shade is enabled, BOTH STL files are sent
  // (with a small delay between them). When disabled, only the outer is sent.
  const [colorMode, setColorMode] = useState<ColorMode>('white')
  const [bulbVisible, setBulbVisible] = useState(true)
  const [customerName, setCustomerName] = useState('')
  const [orderTitle, setOrderTitle] = useState('')

  const [externalBottom, setExternalBottom] = useState<ExternalBottom | null>(null)
  const [innerExternalBottom, setInnerExternalBottom] = useState<ExternalBottom | null>(null)
  const [doubleShadeEnabled, setDoubleShadeEnabled] = useState(false)

  // ─── Ctrl+Z undo stack ─────────────────────────────────────────────
  // Leva controls are not React state, so we snapshot them periodically and
  // push the PREVIOUS snapshot to a stack whenever a change is detected.
  // Ctrl+Z pops the stack and applies it back via `setRef.current`.
  //
  // WHY POLLING: Leva doesn't expose a "subscribe to all changes" API in the
  // version we use. Polling every 500 ms is the simplest reliable approach
  // and is cheap (a few dozen key comparisons).
  const undoStackRef = useRef<Record<string, unknown>[]>([])
  const lastSnapshotRef = useRef<Record<string, unknown> | null>(null)
  // Nonce counter — bumped after each undo to suppress the next push (otherwise
  // the snapshot right after undo would immediately re-push itself).
  const undoNonceRef = useRef(0)
  // Keys to snapshot — everything in presetKeys plus the view/order keys.
  const snapshotKeysRef = useRef<string[]>(['language','modelColorMode','bulbVisible','customerName','orderTitle',...presetKeys])

  const takeSnapshot = useCallback(() => {
    const snap: Record<string, unknown> = {}
    for (const k of snapshotKeysRef.current) snap[k] = savedRef.current[k]
    return snap
  }, [])

  // Polling: every 500 ms, if snapshot changed → push previous to stack.
  useEffect(() => {
    // Seed the initial snapshot so the FIRST detected change pushes something
    // meaningful (the state from before that change).
    lastSnapshotRef.current = takeSnapshot()
    const id = window.setInterval(() => {
      const snap = takeSnapshot()
      const last = lastSnapshotRef.current
      if (last) {
        const same = JSON.stringify(last) === JSON.stringify(snap)
        if (!same) {
          if (undoNonceRef.current > 0) {
            // Suppress — this change came from an undo
            undoNonceRef.current -= 1
          } else {
            undoStackRef.current.push(last)
            if (undoStackRef.current.length > 50) undoStackRef.current.shift()
          }
        }
      }
      lastSnapshotRef.current = snap
    }, 500)
    return () => window.clearInterval(id)
  }, [takeSnapshot])

  // Ctrl+Z / Cmd+Z handler
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ctrlOrCmd = e.ctrlKey || e.metaKey
      if (!ctrlOrCmd) return
      // Ctrl+Z (no shift) = undo. Ctrl+Shift+Z / Ctrl+Y = redo (not implemented).
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) return
        e.preventDefault()
        const snap = undoStackRef.current.pop()
        if (snap && setRef.current) {
          // Apply snapshot to Leva via set(). This triggers a re-render of
          // ControlsInner which writes values back to savedRef — but to be
          // safe we ALSO write to savedRef here so the next polling cycle
          // sees a stable snapshot and doesn't immediately re-push.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const settable: Record<string, any> = {}
          for (const k of Object.keys(snap)) {
            savedRef.current[k] = snap[k]
            // Only include keys Leva currently knows about. set() will silently
            // ignore unknown keys but filtering keeps the call clean.
            settable[k] = snap[k]
          }
          setRef.current(settable)
          undoNonceRef.current += 1
          lastSnapshotRef.current = snap
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let cancelled = false
    loadBaseSTL('OutsideShadeBottom.stl')
      .then((b) => {
        if (!cancelled) setExternalBottom({ positions: b.positions, normals: b.normals })
      })
      .catch((err) => { console.warn('[loadBaseSTL] OutsideShadeBottom.stl failed — using parametric plug:', err) })
    loadBaseSTL('InsideShadeBottom.stl')
      .then((b) => {
        if (!cancelled) setInnerExternalBottom({ positions: b.positions, normals: b.normals })
      })
      .catch((err) => { console.warn('[loadBaseSTL] InsideShadeBottom.stl failed — using parametric plug:', err) })
    return () => { cancelled = true }
  }, [])

  const orbitRef = useRef<OrbitControlsImpl | null>(null)

  const debouncedParams = useDebouncedValue(params, 0)
  const debouncedInner = useDebouncedValue(innerParams, 0)

  useEffect(() => {
    const ctrl = orbitRef.current; if (!ctrl) return
    ctrl.target.set(0, debouncedParams.height / 2, 0)
    ctrl.update()
  }, [debouncedParams.height])

  const handleParamsChange = useCallback((p: ShadeParams) => setParams(p), [])
  const handleInnerParamsChange = useCallback((p: InnerShadeParams | null) => setInnerParams(p), [])
  const handleLangChange = useCallback((l: Lang) => setLang(l), [])
  const handleColorModeChange = useCallback((c: ColorMode) => setColorMode(c), [])
  const handleBulbVisibleChange = useCallback((v: boolean) => setBulbVisible(v), [])
  const handleOrderInfoChange = useCallback((name: string, title: string) => {
    setCustomerName(name); setOrderTitle(title)
  }, [])

  // Track doubleShadeEnabled from savedRef via polling. Leva controls are not
  // React state — they live in Leva's store, so we mirror this one into React
  // state to drive the `key={...}` remount of ControlsInner (which is what
  // makes the inner-shade folder appear/disappear in the panel).
  //
  // AUTO-BUMP on enable: when the user toggles double-shade ON, if the outer
  // top diameter is below INNER_MIN_OUTER_TOP_DIAMETER (104 mm), we bump it
  // up to 104 mm. The inner shade is inserted from above, so the outer's top
  // opening must be wide enough for the inner's base (100 mm) to pass through
  // — 104 mm gives a 4 mm safety pad. After the auto-bump the user is free
  // to change it back (no continuous clamp).
  const prevDoubleShadeRef = useRef(false)
  useEffect(() => {
    const id = window.setInterval(() => {
      const dse = !!savedRef.current['doubleShadeEnabled']
      // Detect false → true transition (enable moment).
      if (dse && !prevDoubleShadeRef.current) {
        const cur = savedRef.current['topDiameter'] as number | undefined
        if (typeof cur === 'number' && cur < INNER_MIN_OUTER_TOP_DIAMETER) {
          const bumped = INNER_MIN_OUTER_TOP_DIAMETER
          savedRef.current['topDiameter'] = bumped
          if (setRef.current) setRef.current({ topDiameter: bumped })
        }
      }
      prevDoubleShadeRef.current = dse
      setDoubleShadeEnabled(dse)
    }, 200)
    return () => window.clearInterval(id)
  }, [])

  const handleSavePreset = useCallback(() => {
    const name = prompt(t('enterName', lang))
    if (!name?.trim()) return
    const data: Record<string, unknown> = { name: name.trim(), ts: Date.now() }
    for (const k of presetKeys) data[k] = savedRef.current[k]
    const json = JSON.stringify(data, null, 2)
    const filename = name.trim().replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_') + '.json'
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const a = document.createElement('a'); a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
    setPresetMsg(t('presetSaved', lang)); setTimeout(() => setPresetMsg(''), 2000)
  }, [lang])

  const handleLoadPreset = useCallback(() => fileInputRef.current?.click(), [])

  const handleFileSelected = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Record<string, unknown>

        // ─── Step 1: Write ALL valid values from the file to savedRef ────
        // This includes keys that Leva doesn't manage (radialSegments, etc.)
        // so geometry picks them up even without Leva controls.
        for (const k of presetKeys) {
          if (k in data) savedRef.current[k] = data[k]
        }

        // ─── Classify keys ─────────────────────────────────────────────
        // Keys that were REMOVED from the Leva UI but still drive geometry:
        const nonLevaKeys = new Set([
          'radialSegments','heightSegments',
          'innerRadialSegments','innerHeightSegments',
          // innerWaist* removed per spec (inner shade has no hourglass) —
          // kept in presetKeys for backward-compat but not sent to Leva
          'innerWaistMm','innerWaistPos',
        ])
        // Inner-shade-only keys — Leva only has these when doubleShadeEnabled
        const innerOnlyKeys = new Set([
          'innerTopDiameter','innerBulgeMm','innerBulgePos','innerBulgeWidth',
          'innerTwistDeg','innerTwistProfile','innerPattern','innerPatternAmpMm',
          'innerPatternFreq','innerPatternYFreq','innerPatternMirror','innerPatternEdgeFade',
        ])

        // Will inner shade be ON after this preset?
        const willEnableInner = data['doubleShadeEnabled'] === true ||
          (data['doubleShadeEnabled'] === undefined && !!savedRef.current['doubleShadeEnabled'])

        // ─── Phase 1: Outer keys + doubleShadeEnabled toggle ──────────
        // Everything Leva currently knows about (excludes non-Leva + inner-only)
        const phase1: Record<string, unknown> = {}
        for (const k of presetKeys) {
          if (k in data && !nonLevaKeys.has(k) && !innerOnlyKeys.has(k)) {
            phase1[k] = data[k]
          }
        }
        if (setRef.current && Object.keys(phase1).length > 0) {
          setRef.current(phase1)
        }

        // ─── Phase 2: Inner keys (delayed — Leva needs to remount) ────
        // When doubleShadeEnabled flips true→ControlsInner remounts with
        // inner controls. We wait 350ms then push inner values.
        if (willEnableInner) {
          const phase2: Record<string, unknown> = {}
          for (const k of presetKeys) {
            if (k in data && innerOnlyKeys.has(k)) phase2[k] = data[k]
          }
          if (Object.keys(phase2).length > 0) {
            setTimeout(() => {
              if (setRef.current) setRef.current(phase2)
            }, 350)
          }
        }

        setPresetMsg(t('presetLoaded', lang)); setTimeout(() => setPresetMsg(''), 2000)
      } catch {
        alert('Invalid preset file')
      }
    }
    reader.readAsText(file)
    ev.target.value = ''
  }, [lang])

  // ─── Send order to Telegram via backend ─────────────────────────
  // WHEN inner shade is ENABLED: sends BOTH outer and inner STL files, with a
  // small delay between them so they arrive as two separate Telegram messages.
  // WHEN inner shade is DISABLED: sends only the outer STL.
  //
  // Per spec: STL is sent separately (one file per message), not as a combined
  // mesh. The backend (`/api/send-order`) handles one file per request.
  const onSendOrder = useCallback(() => {
    if (isSending) return
    if (!customerName.trim() || !orderTitle.trim()) {
      setOrderMsg({ kind: 'err', text: t('nameRequired', lang) })
      return
    }

    /** Build the OUTER shade STL Blob at maximum export quality. */
    const buildOuterBlob = (): Blob => {
      const ep: ShadeParams = {
        ...params,
        radialSegments: Math.min(960, Math.round(params.radialSegments * 4)),
        heightSegments: Math.min(780, Math.round(params.heightSegments * 4)),
      }
      const g = buildShadeGeometry(ep, 4, {
        externalBottom: externalBottom?.positions ?? null,
        externalBottomNormals: externalBottom?.normals ?? null,
      })
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
      const out = new STLExporter().parse(m, { binary: true })
      g.dispose()
      const ab = out instanceof ArrayBuffer ? out : out instanceof DataView ? out.buffer : null
      if (!ab) throw new Error('STL export failed')
      return new Blob([ab], { type: 'model/stl' })
    }

    /** Build the INNER shade STL Blob at maximum export quality. */
    const buildInnerBlob = (): Blob => {
      if (!innerParams) throw new Error('Inner shade is not enabled')
      // Uses baseRadiusOverride + yOffset so the exported STL matches what the
      // user sees in the preview (already shifted up by INNER_BASE_Y_OFFSET
      // = 2 mm so it sits on top of the outer plug).
      //
      // HARD RADIUS CAP = 100 mm (radius), independent of outer top diameter.
      // Per user feedback: the inner top diameter slider has a fixed [100..200]
      // range, and the user is responsible for picking a value that physically
      // fits inside the outer shade. The cap exists only to prevent the bulge,
      // waist, and pattern amplitudes from pushing the mesh beyond 100 mm radius
      // — it does NOT couple to the outer's topDiameter anymore.
      //
      // BUGFIX: Previously this call did NOT pass `externalBottom` /
      // `externalBottomNormals`, so the exported inner STL used the parametric
      // plug fallback instead of the actual InsideShadeBottom.stl. Now we pass
      // `innerExternalBottom` so the exported STL matches the preview exactly.
      const innerEp: ShadeParams = {
        ...innerParamsToFull(innerParams, debouncedParams.height),
        radialSegments: Math.min(960, Math.round(innerParams.radialSegments * 4)),
        heightSegments: Math.min(780, Math.round(innerParams.heightSegments * 4)),
      }
      const innerMaxR = 100
      const g = buildShadeGeometry(innerEp, 4, {
        externalBottom: innerExternalBottom?.positions ?? null,
        externalBottomNormals: innerExternalBottom?.normals ?? null,
        baseRadiusOverride: INNER_BASE_RADIUS,
        yOffset: INNER_BASE_Y_OFFSET,
        maxRadius: innerMaxR,
      })
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
      const out = new STLExporter().parse(m, { binary: true })
      g.dispose()
      const ab = out instanceof ArrayBuffer ? out : out instanceof DataView ? out.buffer : null
      if (!ab) throw new Error('STL export failed')
      return new Blob([ab], { type: 'model/stl' })
    }

    /**
     * Send one STL blob with progress + result handling.
     * Returns a Promise that always resolves (errors → {ok:false}).
     */
    const sendOne = (blob: Blob, progressBase: number, progressSpan: number) =>
      sendOrder(blob, customerName, orderTitle, (loaded, total) => {
        // Map per-file progress onto the global [0..1] range:
        // outer-only  → [0..1]
        // outer+inner → outer maps to [0..0.5], inner maps to [0.5..1]
        const frac = total > 0 ? loaded / total : 0
        setUploadProgress(progressBase + frac * progressSpan)
      }).then((res) => {
        if (!res.ok) throw new Error(res.error)
        return res
      })

    setIsSending(true); setUploadProgress(0); setOrderMsg(null)

    // Defer to next tick so the "Sending…" UI can paint before the (heavy)
    // geometry build starts on the main thread.
    setTimeout(async () => {
      try {
        if (innerParams) {
          // ── Double-shade mode: outer first, then inner after a 1.5s delay.
          // The delay ensures Telegram renders them as separate messages
          // (and gives the backend a moment to flush the previous request).
          const outerBlob = buildOuterBlob()
          await sendOne(outerBlob, 0, 0.5)
          // 1.5-second pause between the two messages
          await new Promise((r) => setTimeout(r, 1500))
          const innerBlob = buildInnerBlob()
          await sendOne(innerBlob, 0.5, 0.5)
          setOrderMsg({ kind: 'ok', text: t('orderSent', lang) })
        } else {
          // ── Single-shade mode: just the outer.
          const outerBlob = buildOuterBlob()
          await sendOne(outerBlob, 0, 1)
          setOrderMsg({ kind: 'ok', text: t('orderSent', lang) })
        }
      } catch (err) {
        setOrderMsg({ kind: 'err', text: `${t('orderError', lang)}: ${String(err)}` })
      } finally {
        setIsSending(false)
      }
    }, 50)
  }, [params, innerParams, debouncedParams.height, isSending, customerName, orderTitle, lang, externalBottom, innerExternalBottom])

  return (
    <div className="app">
      {/*
        Leva is rendered as an EMBEDDED PANEL (not floating overlay):
        • wrapped in <aside class="leva-panel"> — a 320 px right column (App.css)
        • `fill`     — expands to fill its parent container
        • `flat`     — removes the title-bar drag handle (anchored, not draggable)
        • `titleBar` — hides the default Leva header chrome
        Without this, Leva renders as a floating overlay covering the action buttons.
      */}
      <aside className="leva-panel">
        <Leva
          fill
          flat
          titleBar={{ title: 'Controls', drag: false, filter: false }}
          collapsed={false}
        />
      </aside>
      <ControlsInner
        key={`${lang}-${doubleShadeEnabled ? 'inner' : 'no-inner'}`}
        lang={lang}
        savedRef={savedRef}
        onParamsChange={handleParamsChange}
        onInnerParamsChange={handleInnerParamsChange}
        onLangChange={handleLangChange}
        onColorModeChange={handleColorModeChange}
        onBulbVisibleChange={handleBulbVisibleChange}
        onOrderInfoChange={handleOrderInfoChange}
        setRef={setRef}
      />

      <header className="topbar">
        <div className="title">
          <div className="h1">Генератор плафонов</div>
          <div className="sub">Локально в браузере • единицы = мм • заказ отправляется в Telegram</div>
        </div>
        <div className="actions">
          <div className="status">
            <span className={`dot ${compute.error ? 'err' : compute.loading ? 'work' : 'ok'}`} />
            <span className="txt">
              {isSending ? `${t('sending', lang)} ${Math.round(uploadProgress * 100)}%` : compute.error ? t('geoError',lang) : compute.loading ? t('computing',lang) : t('ready',lang)}
            </span>
          </div>
          <button
            className="btn primary"
            type="button"
            onClick={onSendOrder}
            disabled={isSending || compute.loading || !!compute.error}
          >
            {isSending ? `${t('sending', lang)} ${Math.round(uploadProgress * 100)}%` : t('sendOrderBtn', lang)}
          </button>
        </div>
      </header>

      {orderMsg && (
        <div className={`order-msg ${orderMsg.kind}`}>
          {orderMsg.text}
        </div>
      )}

      <main className="viewport">
        <Canvas shadows camera={{ position: [160, 110, 160], fov: 40, near: 1, far: 5000 }}>
          <color attach="background" args={['#0b1220']} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[200, 300, 160]} intensity={1.1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
          <ShadeMesh
            params={debouncedParams}
            innerParams={debouncedInner}
            colorMode={colorMode}
            forceTranslucent={doubleShadeEnabled}
            externalBottom={externalBottom}
            innerExternalBottom={innerExternalBottom}
            onComputeState={setCompute}
          />
          <BulbMesh visible={bulbVisible} />
          <mesh rotation={[-Math.PI/2, 0, 0]} receiveShadow><planeGeometry args={[1000,1000]} /><shadowMaterial opacity={0.25} /></mesh>
          <OrbitControls ref={orbitRef} makeDefault target={[0, debouncedParams.height / 2, 0]} />
          <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
        </Canvas>

        <aside className="hint">
          <div className="card">
            <div className="k">{t('control',lang)}</div>
            <div>{t('mouseCtrl',lang)}</div>
            <div className="k">{t('hint',lang)}</div>
            <div>{t('hintDesc',lang)}</div>
          </div>
          {doubleShadeEnabled && (
            <div className="card" style={{ marginTop: 8, borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.08)' }}>
              <div className="k" style={{ color: '#f59e0b' }}>{t('fInner',lang)}</div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>{t('innerFitHint',lang)}</div>
            </div>
          )}
          <div className="card" style={{ marginTop: 8 }}>
            <div className="k">{t('fPresets',lang)}</div>
            <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelected} />
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn" style={{ flex: 1 }} onClick={handleSavePreset}>{t('savePreset',lang)}</button>
              <button className="btn" style={{ flex: 1 }} onClick={handleLoadPreset}>{t('loadPreset',lang)}</button>
            </div>
            {presetMsg && <div style={{ color: '#4ade80', fontSize: 12, marginTop: 4 }}>{presetMsg}</div>}
          </div>
        </aside>
      </main>
    </div>
  )
}

function buildParamsFromSaved(saved: Record<string, unknown>): ShadeParams {
  const s = (k: string) => saved[k] ?? defaultControlValues[k]
  return {
    height: s('height') as number,
    topDiameter: s('topDiameter') as number,
    // Wall thickness is FIXED at MIN_WALL_THICKNESS (1.2 mm) — no UI control.
    thickness: MIN_WALL_THICKNESS,
    radialSegments: s('radialSegments') as number, heightSegments: s('heightSegments') as number,
    bulgeMm: s('bulgeMm') as number, bulgePos: s('bulgePos') as number,
    bulgeWidth: (s('bulgeWidth') as number | undefined) ?? 0.18,
    waistMm: s('waistMm') as number, waistPos: s('waistPos') as number,
    twistDeg: s('twistDeg') as number, twistProfile: s('twistProfile') as ShadeParams['twistProfile'],
    pattern: s('pattern') as ShadeParams['pattern'], patternAmpMm: s('patternAmpMm') as number,
    patternFreq: s('patternFreq') as number, patternYFreq: s('patternYFreq') as number,
    patternMirror: s('patternMirror') as boolean,
    patternEdgeFade: s('patternEdgeFade') as boolean,
    veinsEnabled: s('veinsEnabled') as boolean, veinCount: s('veinCount') as number,
    veinAmplitudeMm: s('veinAmplitudeMm') as number, veinTurns: s('veinTurns') as number,
    veinTiltDeg: s('veinTiltDeg') as number,
    veinWidth: s('veinWidth') as number,
    veinValleyMm: s('veinValleyMm') as number,
  }
}

/**
 * Convert InnerShadeParams → full ShadeParams for buildShadeGeometry.
 * Veins forced off; pattern stays as-is (already excludes 'groovesT' by type).
 * Height is derived from outer height minus INNER_HEIGHT_REDUCTION_MM (2 mm).
 *
 * WAIST is also forced to 0 — per customer spec the inner shade is a simple
 * bulged cone with no hourglass narrowing. Belt-and-suspenders: the UI
 * doesn't expose the control, but if a preset has innerWaistMm>0 we ignore it.
 */
function innerParamsToFull(inner: InnerShadeParams, outerHeight: number): ShadeParams {
  return {
    height: Math.max(10, outerHeight - INNER_HEIGHT_REDUCTION_MM),
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
    veinsEnabled: false,
    veinCount: 0,
    veinAmplitudeMm: 0,
    veinTurns: 0,
    veinTiltDeg: 0,
    veinWidth: 0.3,
    veinValleyMm: 0,
  }
}