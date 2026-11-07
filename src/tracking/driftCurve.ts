import type { TrackedNote } from './types'

export interface DriftPoint {
  time: number
  /** Key centre minus reference, in semitones (negative = flat). */
  drift: number
}

/** Drift sampled at the middle of every note that influenced the key estimate. */
export function buildDriftCurve(notes: readonly TrackedNote[]): DriftPoint[] {
  return notes
    .filter((n) => n.weight > 0)
    .map((n) => ({ time: (n.startTime + n.endTime) / 2, drift: n.keyRef - n.referenceRef }))
}

/** Linearly interpolates the drift curve, holding the end values outside its range. */
export function driftAt(curve: readonly DriftPoint[], time: number): number {
  if (curve.length === 0) return 0
  if (time <= curve[0].time) return curve[0].drift
  const last = curve[curve.length - 1]
  if (time >= last.time) return last.drift
  let lo = 0
  let hi = curve.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (curve[mid].time <= time) lo = mid
    else hi = mid
  }
  const a = curve[lo]
  const b = curve[hi]
  const t = b.time === a.time ? 0 : (time - a.time) / (b.time - a.time)
  return a.drift + t * (b.drift - a.drift)
}
