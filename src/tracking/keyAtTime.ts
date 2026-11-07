import type { TrackedNote } from './types'

/**
 * The key centre (`keyRef`) in force at `time`: that of the latest note starting
 * at or before `time`, or the first note's if `time` precedes every note.
 * Falls back to `fallback` when there are no notes.
 */
export function keyRefAt(notes: readonly TrackedNote[], time: number, fallback: number): number {
  if (notes.length === 0) return fallback
  if (time < notes[0].startTime) return notes[0].keyRef
  let lo = 0
  let hi = notes.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (notes[mid].startTime <= time) lo = mid
    else hi = mid - 1
  }
  return notes[lo].keyRef
}
