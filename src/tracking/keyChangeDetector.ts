import type { TuningGrid } from '../music/tuningGrids'
import type { TrackedNote } from './types'

export interface KeyChangeConfig {
  /** Accumulated log-likelihood evidence needed to accept a key change. */
  threshold: number
  /** Candidate modulations, in semitones relative to the current key. */
  candidates: readonly number[]
  /** Notes shorter than this carry no evidence. */
  minNoteSeconds: number
  /** Notes at least this long carry full evidence; shorter ones are scaled down. */
  fullWeightSeconds: number
}

export const DEFAULT_KEY_CHANGE_CONFIG: KeyChangeConfig = {
  threshold: 7,
  candidates: [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6],
  minNoteSeconds: 0.1,
  fullWeightSeconds: 0.3,
}

export interface KeyChangeDetection {
  semitones: number
  /** Back-propagated index of the first note in the new key. */
  noteIndex: number
}

interface CandidateState {
  semitones: number
  score: number
  startIndex: number | null
}

/**
 * CUSUM change detector. For every candidate modulation it accumulates how much
 * better each note fits the shifted key than the current key (log ratio of the
 * degree membership weights). A run of positive evidence that crosses the
 * threshold is a key change, and the point where that run began is the
 * back-propagated change point.
 */
export class KeyChangeDetector {
  private readonly logWeights: number[]
  private readonly config: KeyChangeConfig
  private candidates: CandidateState[] = []

  constructor(grid: TuningGrid, config: Partial<KeyChangeConfig> = {}) {
    this.config = { ...DEFAULT_KEY_CHANGE_CONFIG, ...config }
    this.logWeights = grid.map((d) => Math.log(d.weight))
    this.reset()
  }

  reset(): void {
    this.candidates = this.config.candidates.map((semitones) => ({ semitones, score: 0, startIndex: null }))
  }

  /** 0 = no evidence of a key change, 1 = threshold reached. */
  get confidence(): number {
    const best = Math.max(0, ...this.candidates.map((c) => c.score))
    return Math.min(1, best / this.config.threshold)
  }

  push(note: TrackedNote, index: number): KeyChangeDetection | null {
    const duration = note.endTime - note.startTime
    if (duration < this.config.minNoteSeconds) return null
    const evidenceWeight = Math.min(1, duration / this.config.fullWeightSeconds)
    const current = this.logWeights[note.degree]

    let best: CandidateState | null = null
    for (const c of this.candidates) {
      const shiftedDegree = (((note.degree - c.semitones) % 12) + 12) % 12
      const delta = evidenceWeight * (this.logWeights[shiftedDegree] - current)
      const next = Math.max(0, c.score + delta)
      if (next > 0 && c.score === 0) c.startIndex = index
      if (next === 0) c.startIndex = null
      c.score = next
      if (c.score >= this.config.threshold && (best === null || c.score > best.score)) best = c
    }

    if (best && best.startIndex !== null) {
      return { semitones: best.semitones, noteIndex: best.startIndex }
    }
    return null
  }
}
