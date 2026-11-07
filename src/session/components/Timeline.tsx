import { useEffect, useRef } from 'react'
import { keyName, midiToNoteName } from '../../music/keys'
import type { TrackingSession } from '../../tracking/TrackingSession'
import type { TrackedNote } from '../../tracking/types'
import type { NoteStyle } from '../state/settingsStorage'
import { centsToColour } from './colourScale'

/** Seconds of song visible across the timeline. */
const WINDOW_SECONDS = 12
/** Where "now" sits while auto-scrolling, as a fraction of the width. */
const NOW_FRACTION = 0.85
/** Minimum visible pitch span in semitones. */
const MIN_SPAN = 14
const LEFT_GUTTER = 40
const BOTTOM_GUTTER = 22
const BLOCK_SEMITONES = 0.6

const COLOURS = {
  background: '#ffffff',
  guide: 'rgba(0, 0, 0, 0.06)',
  tonic: 'rgba(0, 0, 0, 0.18)',
  label: 'rgba(0, 0, 0, 0.45)',
  labelBackground: 'rgba(255, 255, 255, 0.85)',
  now: 'rgba(0, 0, 0, 0.12)',
  cursor: '#228be6',
  keyChange: 'rgba(0, 0, 0, 0.5)',
}

/** Upper bound on gradient stops per block (contours are downsampled to this). */
const MAX_GRADIENT_STOPS = 32

interface TimelineProps {
  session: TrackingSession | null
  noteStyle: NoteStyle
  /** Auto-scroll to keep "now" in view (while running). */
  follow: boolean
  /** Current playback position in song time, or null. */
  getPlaybackPosition?: () => number | null
  /** Called when the user clicks (without dragging) on a point in time. */
  onSeek?: (time: number) => void
}

interface ViewState {
  start: number
  yMin: number
  yMax: number
  initialised: boolean
}

/**
 * Horizontal gradient tracing the note's pitch over time. Each point is coloured by its own
 * offset: the note's colour value shifted by how far that point is from the note's pitch.
 */
function contourGradient(
  ctx: CanvasRenderingContext2D,
  note: TrackedNote,
  x0: number,
  x1: number,
  timeToX: (t: number) => number,
  alpha: number,
): CanvasGradient {
  const gradient = ctx.createLinearGradient(x0, 0, x1, 0)
  const points = note.contour
  const step = Math.max(1, Math.ceil(points.length / MAX_GRADIENT_STOPS))
  const span = x1 - x0
  for (let i = 0; i < points.length; i += step) {
    // Average each group of points so downsampling doesn't skip short excursions entirely.
    const group = points.slice(i, i + step)
    const time = group.reduce((sum, p) => sum + p.time, 0) / group.length
    const midi = group.reduce((sum, p) => sum + p.midi, 0) / group.length
    const offset = Math.min(1, Math.max(0, (timeToX(time) - x0) / span))
    gradient.addColorStop(offset, centsToColour(note.colourCents + (midi - note.pitch) * 100, alpha))
  }
  return gradient
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Canvas timeline of sung notes. Draws itself on its own requestAnimationFrame
 * loop, reading notes straight from the TrackingSession so per-frame data never
 * passes through React state. Pannable by drag/wheel when not following.
 */
export function Timeline({ session, noteStyle, follow, getPlaybackPosition, onSeek }: TimelineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const props = useRef({ session, noteStyle, follow, getPlaybackPosition, onSeek })
  const view = useRef<ViewState>({ start: -WINDOW_SECONDS * NOW_FRACTION, yMin: 53, yMax: 74, initialised: false })
  const drag = useRef<{ x: number; start: number; moved: boolean } | null>(null)

  useEffect(() => {
    props.current = { session, noteStyle, follow, getPlaybackPosition, onSeek }
  })

  useEffect(() => {
    view.current.initialised = false
  }, [session])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let rafId = 0

    const plotWidth = () => canvas.clientWidth - LEFT_GUTTER
    const pxPerSecond = () => plotWidth() / WINDOW_SECONDS
    const clampStart = (start: number) => {
      const now = props.current.session?.now() ?? 0
      const min = -WINDOW_SECONDS * NOW_FRACTION
      return Math.min(Math.max(start, min), Math.max(now - WINDOW_SECONDS * 0.5, min))
    }

    const draw = () => {
      rafId = requestAnimationFrame(draw)
      const { session, noteStyle, follow, getPlaybackPosition } = props.current
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr)
        canvas.height = Math.round(height * dpr)
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = COLOURS.background
      ctx.fillRect(0, 0, width, height)

      const v = view.current
      const now = session?.now() ?? 0
      const playPos = getPlaybackPosition?.() ?? null
      const notes = session?.getNotes() ?? []
      const live = session?.getLiveNote() ?? null
      const keyRef = session?.getTrackerState().keyRef ?? 60

      // --- Horizontal view ---
      if (follow) {
        v.start = now - WINDOW_SECONDS * NOW_FRACTION
      } else if (playPos !== null && !drag.current) {
        if (playPos < v.start + WINDOW_SECONDS * 0.05 || playPos > v.start + WINDOW_SECONDS * 0.9) {
          v.start = clampStart(playPos - WINDOW_SECONDS * 0.15)
        }
      }
      const tEnd = v.start + WINDOW_SECONDS
      const pps = pxPerSecond()
      const timeToX = (t: number) => LEFT_GUTTER + (t - v.start) * pps

      // --- Vertical view: fit recent notes, eased to avoid jumps ---
      const visible: TrackedNote[] = []
      let lo = Infinity
      let hi = -Infinity
      for (const n of notes) {
        if (n.endTime >= v.start - 10 && n.startTime <= tEnd + 2) {
          lo = Math.min(lo, n.pitch)
          hi = Math.max(hi, n.pitch)
          if (n.endTime >= v.start && n.startTime <= tEnd) visible.push(n)
        }
      }
      if (live) {
        lo = Math.min(lo, live.pitch)
        hi = Math.max(hi, live.pitch)
      }
      if (lo === Infinity) {
        lo = keyRef - 5
        hi = keyRef + 12
      }
      const mid = (lo + hi) / 2
      const span = Math.max(MIN_SPAN, hi - lo + 4)
      const targetMin = mid - span / 2
      const targetMax = mid + span / 2
      if (!v.initialised) {
        v.yMin = targetMin
        v.yMax = targetMax
        v.initialised = true
      } else {
        v.yMin += (targetMin - v.yMin) * 0.06
        v.yMax += (targetMax - v.yMax) * 0.06
      }
      const plotHeight = height - BOTTOM_GUTTER
      const pxPerSemitone = plotHeight / (v.yMax - v.yMin)
      const pitchToY = (midi: number) => plotHeight - (midi - v.yMin) * pxPerSemitone

      // --- Guide lines at the in-key degrees, split into segments at key changes ---
      // Each segment uses the key centre in force at its left edge, so scrolling back shows
      // the key of the region in view and each key change gets its own axis labels.
      if (session) {
        const boundaries = [v.start]
        for (const change of session.getKeyChanges()) {
          if (change.time > v.start && change.time < tEnd) boundaries.push(change.time)
        }
        boundaries.push(tEnd)
        ctx.font = '11px system-ui, sans-serif'
        ctx.textBaseline = 'middle'
        for (let s = 0; s < boundaries.length - 1; s++) {
          const segmentKeyRef = session.keyRefAt(boundaries[s])
          const xStart = s === 0 ? LEFT_GUTTER : Math.round(timeToX(boundaries[s]))
          const xEnd = s === boundaries.length - 2 ? width : Math.round(timeToX(boundaries[s + 1]))
          const firstOctave = Math.floor((v.yMin - segmentKeyRef) / 12) - 1
          const lastOctave = Math.ceil((v.yMax - segmentKeyRef) / 12) + 1
          for (let octave = firstOctave; octave <= lastOctave; octave++) {
            session.grid.forEach((degree, index) => {
              if (degree.weight < 1) return
              const midi = segmentKeyRef + octave * 12 + degree.semitones
              if (midi < v.yMin || midi > v.yMax) return
              const y = Math.round(pitchToY(midi)) + 0.5
              ctx.strokeStyle = index === 0 ? COLOURS.tonic : COLOURS.guide
              ctx.lineWidth = 1
              ctx.beginPath()
              ctx.moveTo(xStart, y)
              ctx.lineTo(xEnd, y)
              ctx.stroke()
              if (index !== 0 && pxPerSemitone < 14) return
              const label = midiToNoteName(midi)
              if (s === 0) {
                ctx.fillStyle = COLOURS.label
                ctx.fillText(label, 4, y)
              } else {
                const labelX = xStart + 5
                const labelWidth = ctx.measureText(label).width
                ctx.fillStyle = COLOURS.labelBackground
                ctx.fillRect(labelX - 2, y - 7, labelWidth + 4, 14)
                ctx.fillStyle = COLOURS.label
                ctx.fillText(label, labelX, y)
              }
            })
          }
        }
      }

      // --- Time axis ---
      ctx.fillStyle = COLOURS.label
      ctx.font = '11px system-ui, sans-serif'
      ctx.textBaseline = 'alphabetic'
      for (let t = Math.ceil(Math.max(0, v.start) / 5) * 5; t <= tEnd; t += 5) {
        const x = timeToX(t)
        ctx.fillText(formatTime(t), x - 10, height - 6)
        ctx.fillRect(Math.round(x), plotHeight, 1, 4)
      }

      // --- Key change markers ---
      if (session) {
        let key = session.settings.key
        for (const change of session.getKeyChanges()) {
          key = { ...key, tonic: (key.tonic + change.semitones + 12) % 12 }
          if (change.time < v.start || change.time > tEnd) continue
          const x = Math.round(timeToX(change.time)) + 0.5
          ctx.save()
          ctx.strokeStyle = COLOURS.keyChange
          ctx.setLineDash([4, 4])
          ctx.beginPath()
          ctx.moveTo(x, 0)
          ctx.lineTo(x, plotHeight)
          ctx.stroke()
          ctx.restore()
          ctx.fillStyle = COLOURS.keyChange
          ctx.textBaseline = 'top'
          ctx.fillText(`→ ${keyName(key)}`, x + 4, 4)
        }
      }

      // --- Note blocks ---
      ctx.save()
      ctx.beginPath()
      ctx.rect(LEFT_GUTTER, 0, width - LEFT_GUTTER, plotHeight)
      ctx.clip()
      const blockHeight = Math.max(6, BLOCK_SEMITONES * pxPerSemitone)
      const drawBlock = (n: TrackedNote, alpha: number) => {
        const x0 = timeToX(n.startTime)
        const x1 = Math.max(x0 + 3, timeToX(n.endTime))
        const y = pitchToY(n.pitch) - blockHeight / 2
        ctx.fillStyle = noteStyle === 'contour' && n.contour.length >= 2
          ? contourGradient(ctx, n, x0, x1, timeToX, alpha)
          : centsToColour(n.colourCents, alpha)
        ctx.beginPath()
        ctx.roundRect(x0, y, x1 - x0, blockHeight, Math.min(4, blockHeight / 2))
        ctx.fill()
        drawTrace(n, alpha)
      }
      /** Thin line over the block following the sung pitch (may extend past the block, e.g. scoops). */
      const drawTrace = (n: TrackedNote, alpha: number) => {
        if (n.contour.length < 2) return
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.55 * alpha})`
        ctx.lineWidth = 1.25
        ctx.lineJoin = 'round'
        ctx.beginPath()
        let lastX = -Infinity
        n.contour.forEach((p, i) => {
          const x = timeToX(p.time)
          // Skip points closer than a pixel apart; always keep the last one.
          if (x - lastX < 1 && i !== n.contour.length - 1) return
          const y = pitchToY(p.midi)
          if (lastX === -Infinity) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
          lastX = x
        })
        ctx.stroke()
      }
      for (const n of visible) drawBlock(n, 1)
      if (live) drawBlock(live, 0.7)

      if (follow) {
        const x = Math.round(timeToX(now)) + 0.5
        ctx.strokeStyle = COLOURS.now
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, plotHeight)
        ctx.stroke()
      }
      if (playPos !== null) {
        const x = Math.round(timeToX(playPos)) + 0.5
        ctx.strokeStyle = COLOURS.cursor
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, plotHeight)
        ctx.stroke()
      }
      ctx.restore()

      if (session && notes.length === 0 && !live) {
        ctx.fillStyle = COLOURS.label
        ctx.font = '15px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(follow ? 'Start singing…' : 'No notes recorded', LEFT_GUTTER + plotWidth() / 2, plotHeight / 2)
        ctx.textAlign = 'start'
      }
    }

    const onPointerDown = (e: PointerEvent) => {
      if (props.current.follow) return
      canvas.setPointerCapture(e.pointerId)
      drag.current = { x: e.clientX, start: view.current.start, moved: false }
    }
    const onPointerMove = (e: PointerEvent) => {
      const d = drag.current
      if (!d) return
      const dx = e.clientX - d.x
      if (Math.abs(dx) > 3) d.moved = true
      if (d.moved) view.current.start = clampStart(d.start - dx / pxPerSecond())
    }
    const onPointerUp = (e: PointerEvent) => {
      const d = drag.current
      drag.current = null
      if (!d || d.moved) return
      const x = e.clientX - canvas.getBoundingClientRect().left
      if (x >= LEFT_GUTTER) props.current.onSeek?.(view.current.start + (x - LEFT_GUTTER) / pxPerSecond())
    }
    const onWheel = (e: WheelEvent) => {
      if (props.current.follow) return
      e.preventDefault()
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      view.current.start = clampStart(view.current.start + delta / pxPerSecond())
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    draw()

    return () => {
      cancelAnimationFrame(rafId)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        borderRadius: 8,
        border: '1px solid var(--mantine-color-gray-3)',
        cursor: follow ? 'default' : 'grab',
        touchAction: 'pan-y',
      }}
    />
  )
}
