import type { TuningGrid } from '../music/tuningGrids'
import { DEFAULT_TRACKER_CONFIG, trackNotes, type TrackerConfig } from './keyTracker'
import type { TrackedNote, TrackerState } from './types'

/**
 * Re-runs the key tracker from `index` onwards after shifting the key centre and
 * reference by `semitones` at that point. Notes before `index` are untouched.
 * Used when a key change is detected and back-propagated to an earlier note.
 */
export function replayFrom(
  notes: readonly TrackedNote[],
  index: number,
  semitones: number,
  grid: TuningGrid,
  config: TrackerConfig = DEFAULT_TRACKER_CONFIG,
): { notes: TrackedNote[]; state: TrackerState } {
  const pivot = notes[index]
  const initial: TrackerState = {
    keyRef: pivot.keyRef + semitones,
    referenceRef: pivot.referenceRef + semitones,
  }
  const result = trackNotes(initial, notes.slice(index), grid, config)
  return { notes: [...notes.slice(0, index), ...result.notes], state: result.state }
}
