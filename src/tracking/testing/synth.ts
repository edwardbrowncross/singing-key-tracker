import type { PitchFrame, SegmentedNote } from '../types'

/** Major-scale melody degrees (semitones from tonic) used by the synthetic tests. */
export const MAJOR_MELODY = [0, 2, 4, 5, 7, 9, 11, 12, 7, 4, 0, 5, 9, 7, 2, 11]

/** Simple deterministic PRNG so tests are reproducible. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/**
 * Builds notes of `duration` seconds separated by `gap` seconds.
 * `pitchAt(index, time)` returns the MIDI pitch of each note.
 */
export function makeNotes(
  count: number,
  pitchAt: (index: number, time: number) => number,
  duration = 0.5,
  gap = 0.1,
): SegmentedNote[] {
  const notes: SegmentedNote[] = []
  for (let i = 0; i < count; i++) {
    const startTime = i * (duration + gap)
    const pitch = pitchAt(i, startTime)
    notes.push({
      startTime,
      endTime: startTime + duration,
      pitch,
      frameCount: Math.round(duration * 60),
      contour: [{ time: startTime, midi: pitch }, { time: startTime + duration, midi: pitch }],
    })
  }
  return notes
}

/** Converts a list of [durationSeconds, midi | null] segments into 60 fps frames. */
export function makeFrames(segments: readonly [number, number | null][], fps = 60): PitchFrame[] {
  const frames: PitchFrame[] = []
  let t = 0
  for (const [duration, midi] of segments) {
    const n = Math.round(duration * fps)
    for (let i = 0; i < n; i++) {
      frames.push({ time: t, midi })
      t += 1 / fps
    }
  }
  return frames
}
