import { describe, expect, it } from 'vitest'
import { getTuningGrid } from '../music/tuningGrids'
import { createTrackerState, trackNotes } from './keyTracker'
import { KeyChangeDetector } from './keyChangeDetector'
import { replayFrom } from './replay'
import { MAJOR_MELODY, makeNotes, seededRandom } from './testing/synth'
import type { TrackedNote } from './types'

const grid = getTuningGrid('equal', 'major')
const START = 60

/** Feeds notes through the tracker and detector like TrackingSession does. */
function detect(pitches: number[]) {
  const notes = makeNotes(pitches.length, (i) => pitches[i])
  const detector = new KeyChangeDetector(grid)
  let state = createTrackerState(START)
  const tracked: TrackedNote[] = []
  for (const note of notes) {
    const result = trackNotes(state, [note], grid)
    state = result.state
    tracked.push(result.notes[0])
    const detection = detector.push(result.notes[0], tracked.length - 1)
    if (detection) return { detection, detectedAt: tracked.length - 1, tracked }
  }
  return { detection: null, detectedAt: -1, tracked, confidence: detector.confidence }
}

const melody = (i: number) => MAJOR_MELODY[i % MAJOR_MELODY.length]

describe('KeyChangeDetector', () => {
  it('detects a modulation up a semitone and back-propagates the change point', () => {
    const CHANGE = 40
    const pitches = Array.from({ length: 80 }, (_, i) => START + melody(i) + (i >= CHANGE ? 1 : 0))
    const { detection, detectedAt } = detect(pitches)
    expect(detection).not.toBeNull()
    expect(detection!.semitones).toBe(1)
    expect(detectedAt - CHANGE).toBeLessThanOrEqual(12)
    expect(Math.abs(detection!.noteIndex - CHANGE)).toBeLessThanOrEqual(3)
  })

  it('detects a modulation up a whole tone', () => {
    const CHANGE = 30
    const pitches = Array.from({ length: 70 }, (_, i) => START + melody(i) + (i >= CHANGE ? 2 : 0))
    const { detection } = detect(pitches)
    expect(detection?.semitones).toBe(2)
    expect(Math.abs(detection!.noteIndex - CHANGE)).toBeLessThanOrEqual(3)
  })

  it('never fires for slow drift alone', () => {
    const random = seededRandom(7)
    const pitches = Array.from({ length: 200 }, (_, i) => START + melody(i) - (i * 0.6 * 2) / 120 + (random() - 0.5) * 0.16)
    const { detection } = detect(pitches)
    expect(detection).toBeNull()
  })

  it('tolerates occasional chromatic passing notes', () => {
    const pitches = Array.from({ length: 120 }, (_, i) => START + (i % 10 === 5 ? 6 : melody(i)))
    expect(detect(pitches).detection).toBeNull()
  })
})

describe('replayFrom', () => {
  it('shifts the key centre and reference from the change point and recolours later notes', () => {
    const CHANGE = 10
    const notes = makeNotes(20, (i) => START + melody(i) + (i >= CHANGE ? 1 : 0))
    const { notes: tracked } = trackNotes(createTrackerState(START), notes, grid)
    const { notes: replayed, state } = replayFrom(tracked, CHANGE, 1, grid)
    expect(replayed.slice(0, CHANGE)).toEqual(tracked.slice(0, CHANGE))
    expect(state.referenceRef).toBeCloseTo(START + 1)
    for (const n of replayed.slice(CHANGE)) {
      expect(n.colourCents).toBeCloseTo(0)
      expect(grid[n.degree].weight).toBe(1)
    }
  })
})
