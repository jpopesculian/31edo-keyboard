import { useEffect, useRef, useState } from 'react'
import './App.css'

const MIDDLE_C = 261.626

type Orientation = 'pointy' | 'flat'

const HEX_SIZE = 48
const STROKE = 1.5
const SQRT3 = Math.sqrt(3)

function hexPoints(cx: number, cy: number, s: number, orientation: Orientation): string {
  const pts: [number, number][] = []
  for (let i = 0; i < 6; i++) {
    const angle =
      orientation === 'pointy'
        ? (Math.PI / 180) * (60 * i - 30)
        : (Math.PI / 180) * (60 * i)
    pts.push([cx + s * Math.cos(angle), cy + s * Math.sin(angle)])
  }
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

const mod31 = (n: number) => ((n % 31) + 31) % 31

const SHARP = ''
const FLAT = ''
const HALF_SHARP = ''
const HALF_FLAT = ''

const NOTE_NAMES: { letter: string; accidental: string }[] = [
  { letter: 'C', accidental: '' },
  { letter: 'C', accidental: HALF_SHARP },
  { letter: 'C', accidental: SHARP },
  { letter: 'D', accidental: FLAT },
  { letter: 'D', accidental: HALF_FLAT },
  { letter: 'D', accidental: '' },
  { letter: 'D', accidental: HALF_SHARP },
  { letter: 'D', accidental: SHARP },
  { letter: 'E', accidental: FLAT },
  { letter: 'E', accidental: HALF_FLAT },
  { letter: 'E', accidental: '' },
  { letter: 'E', accidental: HALF_SHARP },
  { letter: 'E', accidental: SHARP },
  { letter: 'F', accidental: '' },
  { letter: 'F', accidental: HALF_SHARP },
  { letter: 'F', accidental: SHARP },
  { letter: 'G', accidental: FLAT },
  { letter: 'G', accidental: HALF_FLAT },
  { letter: 'G', accidental: '' },
  { letter: 'G', accidental: HALF_SHARP },
  { letter: 'G', accidental: SHARP },
  { letter: 'A', accidental: FLAT },
  { letter: 'A', accidental: HALF_FLAT },
  { letter: 'A', accidental: '' },
  { letter: 'A', accidental: HALF_SHARP },
  { letter: 'A', accidental: SHARP },
  { letter: 'B', accidental: FLAT },
  { letter: 'B', accidental: HALF_FLAT },
  { letter: 'B', accidental: '' },
  { letter: 'B', accidental: HALF_SHARP },
  { letter: 'B', accidental: SHARP },
]

type KiteColor = 'w' | 'grey' | 'y' | 'g' | 'z' | 'r'

const KITE_PATTERN: KiteColor[] = [
  'w', // 0 — perfect
  'grey', // 1
  'grey', // 2
  'grey', // 3
  'grey', // 4
  'w', // 5 — 9/8
  'z', // 6
  'z', // 7 — 7/6
  'g', // 8
  'g', // 9 — 6/5
  'y', // 10 — 5/4
  'r', // 11
  'r', // 12
]

const cellColor = (step: number): KiteColor => KITE_PATTERN[step % 13]

const KITE_COLOR_FILL: Record<KiteColor, string> = {
  w: 'rgba(255, 255, 255, 0.22)',
  grey: 'rgba(128, 128, 128, 0.28)',
  y: 'rgba(250, 204, 21, 0.4)',
  g: 'rgba(34, 197, 94, 0.4)',
  z: 'rgba(59, 130, 246, 0.45)',
  r: 'rgba(239, 68, 68, 0.45)',
}

function App() {
  const [width, setWidth] = useState(11)
  const [height, setHeight] = useState(5.5)
  const [translateSE, setTranslateSE] = useState(0)
  const [translateNE, setTranslateNE] = useState(0)
  const [scale, setScale] = useState(1)
  const [autoSize, setAutoSize] = useState(true)
  const [orientation, setOrientation] = useState<Orientation>('flat')
  const [startLarge, setStartLarge] = useState(true)
  const [showNoteNames, setShowNoteNames] = useState(true)
  const [kiteColors, setKiteColors] = useState(true)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const activeNotesRef = useRef<Map<number, { osc: OscillatorNode; gain: GainNode }>>(
    new Map(),
  )
  const dialogRef = useRef<HTMLDialogElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const update = () => setAvailable({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const getCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    return audioCtxRef.current
  }

  const stopNote = (pointerId: number) => {
    const note = activeNotesRef.current.get(pointerId)
    if (!note) return
    const ctx = getCtx()
    const now = ctx.currentTime
    note.gain.gain.cancelScheduledValues(now)
    note.gain.gain.setValueAtTime(note.gain.gain.value, now)
    note.gain.gain.linearRampToValueAtTime(0, now + 0.05)
    note.osc.stop(now + 0.06)
    activeNotesRef.current.delete(pointerId)
  }

  const startNote = (pointerId: number, steps: number) => {
    const ctx = getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    stopNote(pointerId)
    const freq = MIDDLE_C * Math.pow(2, steps / 31)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const now = ctx.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(0.2, now + 0.01)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    activeNotesRef.current.set(pointerId, { osc, gain })
  }

  const s = HEX_SIZE
  const rawHexes: { cx: number; cy: number; q: number; r: number }[] = []
  let originQ = 0
  let originR = 0

  if (orientation === 'pointy') {
    const numRows = Math.max(1, Math.round(height))
    const longCells = Math.max(1, Math.ceil(width))
    const shortCells = Math.max(0, Math.floor(width))
    const startRow = Math.floor(numRows / 2)
    originQ = startLarge
      ? 0 - ((startRow - (startRow & 1)) >> 1)
      : 0 - ((startRow + (startRow & 1)) >> 1)
    originR = startRow
    const hStep = SQRT3 * s
    const vStep = 1.5 * s
    for (let row = 0; row < numRows; row++) {
      const isShort = startLarge ? row % 2 === 1 : row % 2 === 0
      const rowCells = isShort ? shortCells : longCells
      const xOffset = isShort ? hStep / 2 : 0
      for (let col = 0; col < rowCells; col++) {
        const q = startLarge
          ? col - ((row - (row & 1)) >> 1)
          : col - ((row + (row & 1)) >> 1)
        rawHexes.push({
          cx: s + xOffset + col * hStep,
          cy: s + row * vStep,
          q,
          r: row,
        })
      }
    }
  } else {
    const numCols = Math.max(1, Math.round(width))
    const longCells = Math.max(1, Math.ceil(height))
    const shortCells = Math.max(0, Math.floor(height))
    const startColIsShort = startLarge ? false : true
    const startColCells = startColIsShort ? shortCells : longCells
    const startRow = Math.floor(startColCells / 2)
    originQ = 0
    originR = startRow
    const hStep = 1.5 * s
    const vStep = SQRT3 * s
    for (let col = 0; col < numCols; col++) {
      const isShort = startLarge ? col % 2 === 1 : col % 2 === 0
      const colCells = isShort ? shortCells : longCells
      const yOffset = isShort ? vStep / 2 : 0
      for (let row = 0; row < colCells; row++) {
        const r = startLarge
          ? row - ((col - (col & 1)) >> 1)
          : row - ((col + (col & 1)) >> 1)
        rawHexes.push({
          cx: s + col * hStep,
          cy: s + yOffset + row * vStep,
          q: col,
          r,
        })
      }
    }
  }

  const shiftedOriginQ =
    originQ + translateNE + (orientation === 'flat' ? translateSE : 0)
  const shiftedOriginR =
    originR - translateNE + (orientation === 'pointy' ? translateSE : 0)
  const hexes = rawHexes.map((h) => {
    const dq = h.q - shiftedOriginQ
    const dr = h.r - shiftedOriginR
    const rawSteps = orientation === 'pointy' ? 5 * dq + 3 * dr : 2 * dq - dr
    return {
      cx: h.cx,
      cy: h.cy,
      steps: rawSteps,
      label: mod31(rawSteps),
    }
  })

  const hexHalfW = orientation === 'pointy' ? (SQRT3 * s) / 2 : s
  const hexHalfH = orientation === 'pointy' ? s : (SQRT3 * s) / 2
  let maxX = 0
  let maxY = 0
  for (const h of hexes) {
    if (h.cx + hexHalfW > maxX) maxX = h.cx + hexHalfW
    if (h.cy + hexHalfH > maxY) maxY = h.cy + hexHalfH
  }
  const svgW = maxX + STROKE
  const svgH = maxY + STROKE

  const autoScale =
    available.w > 0 && available.h > 0 && svgW > 0 && svgH > 0
      ? Math.min(available.w / svgW, available.h / svgH) * 0.95
      : 1
  const effectiveScale = autoSize ? autoScale : scale

  return (
    <main>
      <button
        type="button"
        className="options-toggle"
        onClick={() => dialogRef.current?.showModal()}
      >
        Options
      </button>
      <dialog
        ref={dialogRef}
        className="options-dialog"
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current.close()
        }}
      >
        <div className="controls">
          <div className="input-grid">
            <label>
              Width
              <input
                type="number"
                min={1}
                max={50}
                step={orientation === 'pointy' ? 0.5 : 1}
                value={width}
                onChange={(e) => setWidth(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label>
              Height
              <input
                type="number"
                min={1}
                max={50}
                step={orientation === 'flat' ? 0.5 : 1}
                value={height}
                onChange={(e) => setHeight(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
            <label>
              Translate ↘
              <input
                type="number"
                step={1}
                value={translateSE}
                onChange={(e) => setTranslateSE(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Translate ↗
              <input
                type="number"
                step={1}
                value={translateNE}
                onChange={(e) => setTranslateNE(Number(e.target.value) || 0)}
              />
            </label>
            <label>
              Scale
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={scale}
                disabled={autoSize}
                onChange={(e) => setScale(Math.max(0.1, Number(e.target.value) || 1))}
              />
            </label>
          </div>
          <div className="toggle-list">
            <label className="toggle">
              <input
                type="checkbox"
                checked={autoSize}
                onChange={(e) => setAutoSize(e.target.checked)}
              />
              Auto-size
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={orientation === 'flat'}
                onChange={(e) => {
                  const next = e.target.checked ? 'flat' : 'pointy'
                  setOrientation(next)
                  if (next === 'flat') setWidth((w) => Math.round(w))
                  else setHeight((h) => Math.round(h))
                }}
              />
              Points {orientation === 'pointy' ? 'up/down' : 'left/right'}
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={startLarge}
                onChange={(e) => setStartLarge(e.target.checked)}
              />
              Start with {orientation === 'pointy' ? 'long row' : 'tall column'}
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={showNoteNames}
                onChange={(e) => setShowNoteNames(e.target.checked)}
              />
              31-EDO note names
            </label>
            <label className="toggle">
              <input
                type="checkbox"
                checked={kiteColors}
                onChange={(e) => setKiteColors(e.target.checked)}
              />
              Kite colors
            </label>
          </div>
          <button
            type="button"
            className="close-btn"
            onClick={() => dialogRef.current?.close()}
          >
            Close
          </button>
        </div>
      </dialog>

      <div className="grid-wrapper" ref={wrapperRef}>
      <svg
        className="grid"
        width={svgW * effectiveScale}
        height={svgH * effectiveScale}
        viewBox={`0 0 ${svgW} ${svgH}`}
      >
        {hexes.map((h, i) => {
          const note = NOTE_NAMES[h.label]
          const color = cellColor(h.label)
          return (
            <g
              key={i}
              className="hex"
              onPointerDown={(e) => {
                ;(e.currentTarget as SVGGElement).setPointerCapture(e.pointerId)
                startNote(e.pointerId, h.steps)
              }}
              onPointerUp={(e) => stopNote(e.pointerId)}
              onPointerCancel={(e) => stopNote(e.pointerId)}
            >
              <polygon
                points={hexPoints(h.cx, h.cy, s, orientation)}
                fill={kiteColors ? KITE_COLOR_FILL[color] : 'transparent'}
                stroke="currentColor"
                strokeWidth={STROKE}
              />
              {showNoteNames ? (
                <text
                  x={h.cx}
                  y={h.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={s * 0.55}
                  fill="currentColor"
                >
                  {note.letter}
                  {note.accidental && (
                    <tspan className="accidental" dy="0.05em">
                      {note.accidental}
                    </tspan>
                  )}
                </text>
              ) : (
                <text
                  x={h.cx}
                  y={h.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={s * 0.55}
                  fill="currentColor"
                >
                  {h.label}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      </div>
    </main>
  )
}

export default App
