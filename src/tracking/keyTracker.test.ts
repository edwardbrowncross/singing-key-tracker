import { describe, expect, it } from 'vitest'
import { getTuningGrid } from '../music/tuningGrids'
import { createTrackerState, trackNote, trackNotes } from './keyTracker'
import { MAJOR_MELODY, makeNotes, seededRandom } from './testing/synth'

const et = getTuningGrid('equal', 'major')
const ji = getTuningGrid('just', 'major')
const START = 60

describe('keyTracker', () => {
  it('leaves an in-tune melody at zero drift with green notes', () => {
    const notes = makeNotes(32, (i) => START + MAJOR_MELODY[i % MAJOR_MELODY.length])
    const { state, notes: tracked } = trackNotes(createTrackerState(START), notes, et)
    expect(state.keyRef).toBeCloseTo(START)
    for (const n of tracked) expect(Math.abs(n.colourCents)).toBeLessThan(1e-9)
  })

  it('follows a slow drift of 2.5 semitones flat and colours notes by the injected drift', () => {
    const random = seededRandom(1)
    const totalSeconds = 90
    const driftAt = (t: number) => (-2.5 * t) / totalSeconds
    const count = Math.floor(totalSeconds / 0.6)
    const noise = Array.from({ length: count }, () => (random() - 0.5) * 0.16) // ±8¢ per-note error
    const notes = makeNotes(count, (i, t) => START + MAJOR_MELODY[i % MAJOR_MELODY.length] + driftAt(t) + noise[i])
    const { state, notes: tracked } = trackNotes(createTrackerState(START), notes, et)

    tracked.forEach((n, i) => {
      const expected = (driftAt(n.startTime) + noise[i]) * 100
      expect(n.colourCents).toBeCloseTo(expected, 6)
      // The key estimate lags the drift but stays well inside half a semitone.
      expect(Math.abs((n.keyRef - START) * 100 - driftAt(n.startTime) * 100)).toBeLessThan(35)
      expect(n.degree).toBe(MAJOR_MELODY[i % MAJOR_MELODY.length] % 12)
    })
    // Ends close to the true drift (lagging slightly behind it).
    expect((state.keyRef - START) * 100).toBeGreaterThan(-250)
    expect((state.keyRef - START) * 100).toBeLessThan(-215)
  })

  it('barely moves for a single wildly out-of-tune note', () => {
    const before = createTrackerState(START)
    const { state, note } = trackNote(before, { startTime: 0, endTime: 0.5, pitch: START + 4.45, frameCount: 30, contour: [] }, et)
    expect(note.offsetCents).toBeCloseTo(45)
    expect(Math.abs(state.keyRef - START) * 100).toBeLessThan(1)
  })

  it('short notes have no influence', () => {
    const { state, note } = trackNote(createTrackerState(START), { startTime: 0, endTime: 0.05, pitch: START + 0.2, frameCount: 3, contour: [] }, et)
    expect(note.weight).toBe(0)
    expect(state.keyRef).toBe(START)
  })

  it('a just major triad is in tune with the JI grid but the third reads flat in ET', () => {
    const jiTriad = [0, 12 * Math.log2(5 / 4), 12 * Math.log2(3 / 2)]
    const notes = makeNotes(3, (i) => START + jiTriad[i])
    expect(trackNotes(createTrackerState(START), notes, ji).notes.map((n) => n.offsetCents)).toEqual([
      expect.closeTo(0), expect.closeTo(0), expect.closeTo(0),
    ])
    const etThird = trackNotes(createTrackerState(START), notes, et).notes[1]
    expect(etThird.offsetCents).toBeCloseTo(-13.7, 0)
  })
})
