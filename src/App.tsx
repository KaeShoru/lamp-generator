import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { useControls, folder } from 'leva'
import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js'
import './App.css'
import type { ShadeParams } from './shade/types'
import { buildShadeGeometry } from './shade/buildShadeGeometry'

// ─── i18n ───────────────────────────────────────────────────────────
type Lang = 'ru' | 'en'
const L: Record<string, Record<Lang, string>> = {
  fMain:{ru:'Основные размеры',en:'Main dimensions'},fPlug:{ru:'Заглушка снизу',en:'Bottom plug'},
  fProfile:{ru:'Профиль',en:'Profile'},fTwist:{ru:'Скручивание',en:'Twist'},
  fPattern:{ru:'Текстура',en:'Pattern'},
  fPrint:{ru:'Печать',en:'Print'},fView:{ru:'Вид',en:'View'},fPresets:{ru:'Пресеты',en:'Presets'},
  height:{ru:'Высота (мм)',en:'Height (mm)'},baseDiameter:{ru:'Диаметр основания (мм)',en:'Base diameter (mm)'},
  topDiameter:{ru:'Диаметр верха (мм)',en:'Top diameter (mm)'},thickness:{ru:'Толщина стенки (мм)',en:'Wall thickness (mm)'},
  bottomPlug:{ru:'Заглушка снизу',en:'Bottom plug'},bottomPlugShape:{ru:'Форма заглушки',en:'Plug shape'},
  bottomPlugShapeFollow:{ru:'По форме дна',en:'Follow base'},bottomPlugShapeCircle:{ru:'Круглая',en:'Circle'},
  bottomPlugDiameter:{ru:'Диаметр круглой (мм)',en:'Circle diameter (mm)'},
  bottomPlugThickness:{ru:'Толщина верхней части (мм)',en:'Upper part thickness (mm)'},
  bottomPlugDiscThickness:{ru:'Толщина круглого диска (мм)',en:'Disc thickness (mm)'},
  bottomPlugHoleDiameter:{ru:'Отверстие в заглушке (мм)',en:'Plug hole (mm)'},
  bulgeMm:{ru:'Выпуклость (мм)',en:'Bulge (mm)'},bulgePos:{ru:'Позиция выпуклости',en:'Bulge position'},
  waistMm:{ru:'Талия (мм)',en:'Waist (mm)'},waistPos:{ru:'Позиция талии',en:'Waist position'},
  twistProfile:{ru:'Профиль скрутки',en:'Twist profile'},twistLinear:{ru:'Линейно',en:'Linear'},
  twistEaseInOut:{ru:'Плавно (ease)',en:'Ease in-out'},twistSine:{ru:'Синус',en:'Sine'},
  twistDeg:{ru:'Скручивание (°)',en:'Twist (°)'},
  pattern:{ru:'Текстура',en:'Pattern'},patRibsRect:{ru:'Рёбра (прямоуг.)',en:'Ribs (rect)'},
  patWave:{ru:'Волны',en:'Waves'},patAccordionTri:{ru:'Гармошка (треуг.)',en:'Accordion (tri)'},
  patGroovesRound:{ru:'Канавки (кругл.)',en:'Grooves (round)'},patGroovesT:{ru:'Канавки (Т-образн.)',en:'Grooves (T)'},
  patternAmpMm:{ru:'Амплитуда (мм)',en:'Amplitude (mm)'},patternFreq:{ru:'Частота по кругу',en:'Frequency (around)'},
  patternYFreq:{ru:'Частота по высоте',en:'Frequency (height)'},
  maxOverhangDeg:{ru:'Макс. нависание (°)',en:'Max overhang (°)'},radialSegments:{ru:'Качество по кругу',en:'Quality (around)'},
  heightSegments:{ru:'Качество по высоте',en:'Quality (height)'},
  modelColor:{ru:'Цвет модели',en:'Model color'},language:{ru:'Язык / Language',en:'Язык / Language'},
  exportQuality:{ru:'Качество экспорта',en:'Export quality'},
  downloadSTL:{ru:'Скачать STL',en:'Download STL'},smoothExport:{ru:'Сглаживание при экспорте',en:'Smooth on export'},
  computing:{ru:'Считаю…',en:'Computing…'},ready:{ru:'Готово',en:'Ready'},
  geoError:{ru:'Ошибка геометрии',en:'Geometry error'},
  control:{ru:'Управление',en:'Controls'},
  mouseCtrl:{ru:'Мышь: вращать • колёсико: зум • правая: панорамирование',en:'Mouse: rotate • wheel: zoom • right: pan'},
  hint:{ru:'Подсказка',en:'Hint'},
  hintDesc:{ru:'Параметры — в панели Leva (справа), разбиты по вкладкам.',en:'Settings — in the Leva panel (right), organized in folders.'},
  fVeins:{ru:'Жилы (косички)',en:'Veins (braids)'},
  veinsEnabled:{ru:'Включить жилы',en:'Enable veins'},
  veinCount:{ru:'Количество жил',en:'Vein count'},
  veinAmplitudeMm:{ru:'Выпуклость жил (мм)',en:'Vein amplitude (mm)'},
  veinTurns:{ru:'Витков вокруг',en:'Turns around'},
  veinTiltDeg:{ru:'Наклон (°)',en:'Tilt (°)'},
  veinWidth:{ru:'Ширина жилы',en:'Vein width'},
  veinValleyMm:{ru:'Глубина впадин (мм)',en:'Valley depth (mm)'},
  patternMirror:{ru:'Зеркально (сетка)',en:'Mirror (grid)'},patternEdgeFade:{ru:'Сглаживание краёв',en:'Edge fade'},
  exportX:{ru:'x',en:'x'},
  savePreset:{ru:'Сохранить пресет',en:'Save preset'},
  loadPreset:{ru:'Загрузить',en:'Load'},
  presetSaved:{ru:'Пресет сохранён!',en:'Preset saved!'},
  presetLoaded:{ru:'Пресет загружен!',en:'Preset loaded!'},
  enterName:{ru:'Введите название',en:'Enter a name'},
}
const t = (key: string, lang: Lang) => L[key]?.[lang] ?? key

// ─── helpers ────────────────────────────────────────────────────────
function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
function useDebouncedValue<T>(value: T, delayMs: number) {
  const [d, setD] = useState(value)
  useEffect(() => { const t = window.setTimeout(() => setD(value), delayMs); return () => window.clearTimeout(t) }, [value, delayMs])
  return d
}

// ─── worker types ───────────────────────────────────────────────────
type WorkerResponse = { id: number; ok: true; position: ArrayBuffer; normal: ArrayBuffer; index: ArrayBuffer | null } | { id: number; ok: false; error: string }
type ComputeState = { loading: boolean; error: string | null }

// ─── Preset keys (all Leva control keys except language/modelColor/exportQuality) ──
  const presetKeys = ['height','baseDiameter','topDiameter','thickness','bottomPlug','bottomPlugShape',
    'bottomPlugDiameter','bottomPlugThickness','bottomPlugDiscThickness','bottomPlugHoleDiameter',
    'bulgeMm','bulgePos','waistMm','waistPos','twistDeg','twistProfile','pattern','patternAmpMm',
    'patternFreq','patternYFreq','patternMirror',
    'veinsEnabled','veinCount','veinAmplitudeMm','veinTurns','veinTiltDeg','veinWidth','veinValleyMm',
    'maxOverhangDeg','radialSegments','heightSegments','smoothExport','patternEdgeFade']

// ─── Default values for all controls ────────────────────────────────
const defaultControlValues: Record<string, unknown> = {
  language: 'ru', modelColor: '#f1f5f9', exportQuality: 2,
  height: 160, baseDiameter: 95, topDiameter: 55, thickness: 2.0,
  bottomPlug: false, bottomPlugShape: 'follow', bottomPlugDiameter: 80,
  bottomPlugThickness: 3.0, bottomPlugDiscThickness: 2.0, bottomPlugHoleDiameter: 10,
  bulgeMm: 18, bulgePos: 0.55, waistMm: 10, waistPos: 0.35,
  twistDeg: 0, twistProfile: 'linear', pattern: 'ribsRect',
  patternAmpMm: 2.8, patternFreq: 28, patternYFreq: 1.0,
  maxOverhangDeg: 55, radialSegments: 120, heightSegments: 96,
  patternMirror: false, patternEdgeFade: true,
  veinsEnabled: false, veinCount: 4, veinAmplitudeMm: 6, veinTurns: 1.5, veinTiltDeg: 0, veinWidth: 0.35, veinValleyMm: 0,
  smoothExport: true,
}

// ─── Build Leva schema with translations and saved values ───────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSchema(lang: Lang, saved: Record<string, unknown>): any {
  const s = (k: string) => saved[k] ?? defaultControlValues[k]
  return {
    [t('fView',lang)]: folder({
      language: { label: t('language',lang), options: { 'Русский': 'ru', 'English': 'en' }, value: lang },
      modelColor: { label: t('modelColor',lang), value: s('modelColor') as string },
      exportQuality: { label: t('exportQuality',lang), options: { '1x': 1, '2x': 2, '3x': 3, '4x': 4 }, value: s('exportQuality') as number },
      smoothExport: { label: t('smoothExport',lang), value: s('smoothExport') as boolean },
    }),
    [t('fMain',lang)]: folder({
      height: { label: t('height',lang), value: s('height') as number, min: 40, max: 360, step: 1 },
      baseDiameter: { label: t('baseDiameter',lang), value: s('baseDiameter') as number, min: 20, max: 260, step: 1 },
      topDiameter: { label: t('topDiameter',lang), value: s('topDiameter') as number, min: 10, max: 240, step: 1 },
      thickness: { label: t('thickness',lang), value: s('thickness') as number, min: 1.2, max: 6, step: 0.1 },
    }),
    [t('fPlug',lang)]: folder({
      bottomPlug: { label: t('bottomPlug',lang), value: s('bottomPlug') as boolean },
      bottomPlugShape: { label: t('bottomPlugShape',lang), options: { [t('bottomPlugShapeFollow',lang)]: 'follow', [t('bottomPlugShapeCircle',lang)]: 'circle' }, value: s('bottomPlugShape') as string },
      bottomPlugDiameter: { label: t('bottomPlugDiameter',lang), value: s('bottomPlugDiameter') as number, min: 10, max: 260, step: 1 },
      bottomPlugThickness: { label: t('bottomPlugThickness',lang), value: s('bottomPlugThickness') as number, min: 0.6, max: 20, step: 0.5 },
      bottomPlugDiscThickness: { label: t('bottomPlugDiscThickness',lang), value: s('bottomPlugDiscThickness') as number, min: 0.6, max: 20, step: 0.5 },
      bottomPlugHoleDiameter: { label: t('bottomPlugHoleDiameter',lang), value: s('bottomPlugHoleDiameter') as number, min: 0, max: 120, step: 1 },
    }),
    [t('fProfile',lang)]: folder({
      bulgeMm: { label: t('bulgeMm',lang), value: s('bulgeMm') as number, min: 0, max: 80, step: 0.5 },
      bulgePos: { label: t('bulgePos',lang), value: s('bulgePos') as number, min: 0, max: 1, step: 0.01 },
      waistMm: { label: t('waistMm',lang), value: s('waistMm') as number, min: 0, max: 80, step: 0.5 },
      waistPos: { label: t('waistPos',lang), value: s('waistPos') as number, min: 0, max: 1, step: 0.01 },
    }),
    [t('fTwist',lang)]: folder({
      twistProfile: { label: t('twistProfile',lang), options: { [t('twistLinear',lang)]: 'linear', [t('twistEaseInOut',lang)]: 'easeInOut', [t('twistSine',lang)]: 'sine' }, value: s('twistProfile') as string },
      twistDeg: { label: t('twistDeg',lang), value: s('twistDeg') as number, min: -1080, max: 1080, step: 5 },
    }),
    [t('fPattern',lang)]: folder({
      pattern: { label: t('pattern',lang), options: { [t('patRibsRect',lang)]: 'ribsRect', [t('patWave',lang)]: 'wave', [t('patAccordionTri',lang)]: 'accordionTri', [t('patGroovesRound',lang)]: 'groovesRound', [t('patGroovesT',lang)]: 'groovesT' }, value: s('pattern') as string },
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
    [t('fPrint',lang)]: folder({
      maxOverhangDeg: { label: t('maxOverhangDeg',lang), value: s('maxOverhangDeg') as number, min: 20, max: 80, step: 1 },
      radialSegments: { label: t('radialSegments',lang), value: s('radialSegments') as number, min: 24, max: 320, step: 1 },
      heightSegments: { label: t('heightSegments',lang), value: s('heightSegments') as number, min: 8, max: 260, step: 1 },
    }),
  }
}

// ─── ShadeMesh ──────────────────────────────────────────────────────
function ShadeMesh({ params, color, onComputeState }: { params: ShadeParams; color: string; onComputeState?: (s: ComputeState) => void }) {
  const workerRef = useRef<Worker | null>(null)
  const reqIdRef = useRef(0)
  const latestIdRef = useRef(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null)

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
      setLoading(false)
    }
    return () => { w.terminate(); workerRef.current = null; setGeometry(prev => { prev?.dispose(); return null }) }
  }, [])

  useEffect(() => {
    const w = workerRef.current; if (!w) return
    setLoading(true); setError(null)
    const id = ++reqIdRef.current; latestIdRef.current = id
    w.postMessage({ id, params })
  }, [params])

  const material = useMemo(() => new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.6 }), [color])

  if (!geometry) {
    const topR = params.topDiameter / 2, baseR = params.baseDiameter / 2
    return <mesh name="shadeMesh" castShadow receiveShadow>
      <cylinderGeometry args={[topR, baseR, params.height, 48, 1]} />
      <meshStandardMaterial color="#334155" roughness={0.85} metalness={0.0} />
    </mesh>
  }
  return <>
    <mesh name="shadeMesh" geometry={geometry} material={material} castShadow receiveShadow />
    {loading ? <mesh position={[0, params.height + 14, 0]}><sphereGeometry args={[2.2, 16, 16]} /><meshStandardMaterial color="#38bdf8" emissive="#38bdf8" emissiveIntensity={1} /></mesh> : null}
  </>
}

// ─── ControlsInner: remounts on language change via key={} ──────────
function ControlsInner({
  lang,
  savedRef,
  onParamsChange,
  onLangChange,
  onColorChange,
  onExportQualityChange,
  onSmoothExportChange,
  setRef,
}: {
  lang: Lang
  savedRef: React.MutableRefObject<Record<string, unknown>>
  onParamsChange: (p: ShadeParams, controls: Record<string, unknown>) => void
  onLangChange: (l: Lang) => void
  onColorChange: (c: string) => void
  onExportQualityChange: (q: number) => void
  onSmoothExportChange: (v: boolean) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRef: React.MutableRefObject<((v: Record<string, unknown>) => void) | null>
}) {
  const [controls, setLeva] = useControls(() => buildSchema(lang, savedRef.current))

  // Expose set function for preset loading
  setRef.current = setLeva

  // Save current values to ref on every render (so they survive remount)
  const allKeys = ['language','modelColor','exportQuality',...presetKeys]
  for (const k of allKeys) {
    if (controls[k] !== undefined) savedRef.current[k] = controls[k]
  }

  // Report params
  useEffect(() => {
    const p: ShadeParams = {
      height: controls.height, baseDiameter: controls.baseDiameter, topDiameter: controls.topDiameter, thickness: controls.thickness,
      radialSegments: controls.radialSegments, heightSegments: controls.heightSegments, maxOverhangDeg: controls.maxOverhangDeg,
      bottomPlug: controls.bottomPlug, bottomPlugShape: controls.bottomPlugShape as ShadeParams['bottomPlugShape'],
      bottomPlugDiameter: controls.bottomPlugDiameter, bottomPlugThickness: controls.bottomPlugThickness,
      bottomPlugDiscThickness: controls.bottomPlugDiscThickness, bottomPlugHoleDiameter: controls.bottomPlugHoleDiameter,
      bulgeMm: controls.bulgeMm, bulgePos: controls.bulgePos, waistMm: controls.waistMm, waistPos: controls.waistPos,
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
    onParamsChange(p, controls)
    onColorChange(controls.modelColor as string)
    onExportQualityChange(controls.exportQuality as number)
    onSmoothExportChange(controls.smoothExport as boolean)
  }, [controls, onParamsChange, onColorChange, onExportQualityChange, onSmoothExportChange])

  // Detect language change
  const currentLang = controls.language as Lang
  useEffect(() => {
    if (currentLang !== lang) onLangChange(currentLang)
  }, [currentLang, lang, onLangChange])

  return null
}

// ─── App ────────────────────────────────────────────────────────────
export default function App() {
  const [compute, setCompute] = useState<ComputeState>({ loading: true, error: null })
  const [isExporting, setIsExporting] = useState(false)
  const meshGroupRef = useRef<THREE.Group>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [presetMsg, setPresetMsg] = useState('')

  // Language state — drives key={} for ControlsInner
  const [lang, setLang] = useState<Lang>('ru')

  // Ref to survive remounts: stores all current control values
  const savedRef = useRef<Record<string, unknown>>({ ...defaultControlValues })

  // Ref to the setLeva function from ControlsInner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setRef = useRef<((v: Record<string, unknown>) => void) | null>(null)

  // Current params for 3D rendering
  const [params, setParams] = useState<ShadeParams>(() => buildParamsFromSaved(defaultControlValues))
  const [modelColor, setModelColor] = useState('#f1f5f9')
  const [exportQuality, setExportQuality] = useState(2)
  const [smoothExport, setSmoothExport] = useState(true)

  const debouncedParams = useDebouncedValue(params, 0)

  const handleParamsChange = useCallback((p: ShadeParams, _controls: Record<string, unknown>) => {
    setParams(p)
  }, [])

  const handleLangChange = useCallback((l: Lang) => {
    setLang(l)
  }, [])

  const handleColorChange = useCallback((c: string) => {
    setModelColor(c)
  }, [])

  const handleExportQualityChange = useCallback((q: number) => {
    setExportQuality(q)
  }, [])

  const handleSmoothExportChange = useCallback((v: boolean) => {
    setSmoothExport(v)
  }, [])

  // ─── Preset actions ────────────────────────────────────────────
  const handleSavePreset = useCallback(() => {
    const name = prompt(t('enterName', lang))
    if (!name?.trim()) return
    const data: Record<string, unknown> = { name: name.trim(), ts: Date.now() }
    for (const k of presetKeys) data[k] = savedRef.current[k]
    const json = JSON.stringify(data, null, 2)
    const filename = name.trim().replace(/[^a-zA-Zа-яА-Я0-9_-]/g, '_') + '.json'
    downloadBlob(filename, new Blob([json], { type: 'application/json' }))
    setPresetMsg(t('presetSaved', lang)); setTimeout(() => setPresetMsg(''), 2000)
  }, [lang])

  const handleLoadPreset = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileSelected = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const file = ev.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as Record<string, unknown>
        const update: Record<string, unknown> = {}
        for (const k of presetKeys) if (k in data) update[k] = data[k]
        if (Object.keys(update).length > 0 && setRef.current) {
          // Save to ref first so values survive any remount
          for (const k of presetKeys) savedRef.current[k] = update[k]
          setRef.current(update)
          setPresetMsg(t('presetLoaded', lang)); setTimeout(() => setPresetMsg(''), 2000)
        }
      } catch {
        alert('Invalid preset file')
      }
    }
    reader.readAsText(file)
    ev.target.value = ''
  }, [lang])

  // ─── Export ─────────────────────────────────────────────────────
  const onDownloadStl = useCallback(() => {
    if (isExporting) return; setIsExporting(true)
    setTimeout(() => {
      try {
        const mult = exportQuality ?? 2
        const ep: ShadeParams = { ...params, radialSegments: Math.min(960, Math.round(params.radialSegments * mult)), heightSegments: Math.min(780, Math.round(params.heightSegments * mult)) }
        const extraPasses = smoothExport ? 4 : 0
        const g = buildShadeGeometry(ep, extraPasses); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
        const out = new STLExporter().parse(m, { binary: true })
        const ab = out instanceof ArrayBuffer ? out : out instanceof DataView ? out.buffer : null
        if (ab) downloadBlob('shade.stl', new Blob([ab], { type: 'model/stl' }))
        g.dispose()
      } finally { setIsExporting(false) }
    }, 50)
  }, [params, isExporting, exportQuality, smoothExport])

  return (
    <div className="app">
      {/* ControlsInner remounts on language change, preserving values via savedRef */}
      <ControlsInner
        key={lang}
        lang={lang}
        savedRef={savedRef}
        onParamsChange={handleParamsChange}
        onLangChange={handleLangChange}
        onColorChange={handleColorChange}
        onExportQualityChange={handleExportQualityChange}
        onSmoothExportChange={handleSmoothExportChange}
        setRef={setRef}
      />

      <header className="topbar">
        <div className="title">
          <div className="h1">Генератор плафонов</div>
          <div className="sub">Локально в браузере • единицы = мм • STL для 3D‑печати</div>
        </div>
        <div className="actions">
          <div className="status">
            <span className={`dot ${compute.error ? 'err' : compute.loading ? 'work' : 'ok'}`} />
            <span className="txt">
              {isExporting ? (lang==='ru'?'Экспорт…':'Exporting…') : compute.error ? t('geoError',lang) : compute.loading ? t('computing',lang) : t('ready',lang)}
            </span>
          </div>
          <button className="btn" type="button" onClick={onDownloadStl} disabled={isExporting}>
            {isExporting ? (lang==='ru'?'Экспорт…':'Exporting…') : `${t('downloadSTL',lang)} (${exportQuality}${t('exportX',lang)})`}
          </button>
        </div>
      </header>

      <main className="viewport">
        <Canvas shadows camera={{ position: [160, 110, 160], fov: 40, near: 1, far: 5000 }}>
          <color attach="background" args={['#0b1220']} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[200, 300, 160]} intensity={1.1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
          <group ref={meshGroupRef}>
            <group name="shade" position={[0, debouncedParams.height / 2, 0]}>
              <ShadeMesh params={debouncedParams} color={modelColor} onComputeState={setCompute} />
            </group>
          </group>
          <mesh rotation={[-Math.PI/2, 0, 0]} receiveShadow><planeGeometry args={[1000,1000]} /><shadowMaterial opacity={0.25} /></mesh>
          <OrbitControls makeDefault />
          <hemisphereLight args={['#b1e1ff', '#b97a20', 0.5]} />
        </Canvas>

        <aside className="hint">
          <div className="card">
            <div className="k">{t('control',lang)}</div>
            <div>{t('mouseCtrl',lang)}</div>
            <div className="k">{t('hint',lang)}</div>
            <div>{t('hintDesc',lang)}</div>
          </div>
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
    height: s('height') as number, baseDiameter: s('baseDiameter') as number,
    topDiameter: s('topDiameter') as number, thickness: s('thickness') as number,
    radialSegments: s('radialSegments') as number, heightSegments: s('heightSegments') as number,
    maxOverhangDeg: s('maxOverhangDeg') as number,
    bottomPlug: s('bottomPlug') as boolean, bottomPlugShape: s('bottomPlugShape') as ShadeParams['bottomPlugShape'],
    bottomPlugDiameter: s('bottomPlugDiameter') as number, bottomPlugThickness: s('bottomPlugThickness') as number,
    bottomPlugDiscThickness: s('bottomPlugDiscThickness') as number, bottomPlugHoleDiameter: s('bottomPlugHoleDiameter') as number,
    bulgeMm: s('bulgeMm') as number, bulgePos: s('bulgePos') as number,
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
