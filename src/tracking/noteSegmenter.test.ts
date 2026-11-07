import { describe, expect, it } from 'vitest'
import { NoteSegmenter } from './noteSegmenter'
import { makeFrames } from './testing/synth'
import type { PitchFrame, SegmentedNote } from './types'

function run(frames: PitchFrame[]): SegmentedNote[] {
  const seg = new NoteSegmenter()
  const notes = frames.flatMap((f) => seg.push(f))
  const last = seg.flush()
  return last ? [...notes, last] : notes
}

describe('NoteSegmenter', () => {
  it('produces one note per voiced segment separated by silence', () => {
    const notes = run(makeFrames([[0.5, 60], [0.3, null], [0.5, 64], [0.3, null]]))
    expect(notes).toHaveLength(2)
    expect(notes[0].pitch).toBeCloseTo(60)
    expect(notes[1].pitch).toBeCloseTo(64)
    expect(notes[0].endTime - notes[0].startTime).toBeCloseTo(0.5, 1)
    expect(notes[1].startTime).toBeCloseTo(0.8, 1)
  })

  it('splits a legato pitch change into two notes', () => {
    const notes = run(makeFrames([[0.5, 60], [0.5, 62]]))
    expect(notes.map((n) => Math.round(n.pitch))).toEqual([60, 62])
    expect(notes[1].startTime).toBeCloseTo(0.5, 1)
  })

  it('bridges short dropouts within a note', () => {
    const notes = run(makeFrames([[0.3, 60], [2 / 60, null], [0.3, 60]]))
    expect(notes).toHaveLength(1)
  })

  it('ignores isolated blips', () => {
    const notes = run(makeFrames([[0.3, null], [2 / 60, 70], [0.3, null]]))
    expect(notes).toHaveLength(0)
  })

  it('absorbs brief spikes without splitting or skewing the pitch', () => {
    const notes = run(makeFrames([[0.3, 60], [1 / 60, 67], [0.3, 60]]))
    expect(notes).toHaveLength(1)
    expect(notes[0].pitch).toBeCloseTo(60)
  })

  it('excludes the attack (scoop) from the note pitch', () => {
    const notes = run(makeFrames([[0.05, 59.6], [0.5, 60.1]]))
    expect(notes).toHaveLength(1)
    expect(notes[0].pitch).toBeCloseTo(60.1)
  })

  it('exposes the note currently being sung', () => {
    const seg = new NoteSegmenter()
    for (const f of makeFrames([[0.2, 62]])) seg.push(f)
    expect(seg.current?.pitch).toBeCloseTo(62)
    seg.flush()
    expect(seg.current).toBeNull()
  })

  it('keeps the pitch contour of each note, including the attack', () => {
    const notes = run(makeFrames([[0.05, 59.6], [0.5, 60.1], [0.3, null], [0.3, 64]]))
    expect(notes[0].contour).toHaveLength(notes[0].frameCount)
    expect(notes[0].contour[0].midi).toBeCloseTo(59.6)
    expect(notes[0].contour.at(-1)!.midi).toBeCloseTo(60.1)
    expect(notes[1].contour.every((p) => p.midi === 64)).toBe(true)
  })
})
