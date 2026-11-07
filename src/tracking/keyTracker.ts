import { nearestDegree, type TuningGrid } from '../music/tuningGrids'
import type { SegmentedNote, TrackedNote, TrackerState } from './types'

export interface TrackerConfig {
  /** Time constant (seconds of weighted singing) of the key-centre moving average. */
  tauSeconds: number
  /** Notes shorter than this don't influence the key estimate. */
  minNoteSeconds: number
  /** Offsets up to this many cents get full weight. */
  outlierStartCents: number
  /** Offsets beyond this many cents get `outlierFloor` weight. */
  outlierEndCents: number
  outlierFloor: number
}

export const DEFAULT_TRACKER_CONFIG: TrackerConfig = {
  tauSeconds: 5,
  minNoteSeconds: 0.1,
  outlierStartCents: 25,
  outlierEndCents: 45,
  outlierFloor: 0.15,
}

export function createTrackerState(startRef: number): TrackerState {
  return { keyRef: startRef, referenceRef: startRef }
}

function outlierFactor(offsetCents: number, config: TrackerConfig): number {
  const abs = Math.abs(offsetCents)
  if (abs <= config.outlierStartCents) return 1
  if (abs >= config.outlierEndCents) return config.outlierFloor
  const t = (abs - config.outlierStartCents) / (config.outlierEndCents - config.outlierStartCents)
  return 1 - t * (1 - config.outlierFloor)
}

/**
 * Evaluates a note against the current key estimate without changing it.
 * Used for the live (still-sounding) note as well as by `trackNote`.
 */
export function evaluateNote(
  state: TrackerState,
  note: SegmentedNote,
  grid: TuningGrid,
  config: TrackerConfig = DEFAULT_TRACKER_CONFIG,
): TrackedNote {
  const match = nearestDegree(note.pitch - state.keyRef, grid)
  const duration = note.endTime - note.startTime
  const weight =
    duration < config.minNoteSeconds ? 0 : match.weight * outlierFactor(match.offsetCents, config)
  return {
    ...note,
    keyRef: state.keyRef,
    referenceRef: state.referenceRef,
    degree: match.degree,
    offsetCents: match.offsetCents,
    // Measured against the current key centre, then shifted by how far that centre has drifted
    // from the reference. Never wraps, so multi-semitone drift shows as a large value.
    colourCents: (state.keyRef - state.referenceRef) * 100 + match.offsetCents,
    weight,
  }
}

/**
 * Annotates a completed note and nudges the key centre towards it with a
 * duration-aware exponential moving average.
 */
export function trackNote(
  state: TrackerState,
  note: SegmentedNote,
  grid: TuningGrid,
  config: TrackerConfig = DEFAULT_TRACKER_CONFIG,
): { state: TrackerState; note: TrackedNote } {
  const tracked = evaluateNote(state, note, grid, config)
  const duration = note.endTime - note.startTime
  const alpha = 1 - Math.exp((-tracked.weight * duration) / config.tauSeconds)
  return {
    state: { ...state, keyRef: state.keyRef + (alpha * tracked.offsetCents) / 100 },
    note: tracked,
  }
}

/** Runs `trackNote` over a sequence of notes from a starting state. */
export function trackNotes(
  initial: TrackerState,
  notes: readonly SegmentedNote[],
  grid: TuningGrid,
  config: TrackerConfig = DEFAULT_TRACKER_CONFIG,
): { state: TrackerState; notes: TrackedNote[] } {
  let state = initial
  const tracked: TrackedNote[] = []
  for (const note of notes) {
    const result = trackNote(state, note, grid, config)
    state = result.state
    tracked.push(result.note)
  }
  return { state, notes: tracked }
}
