import type { PitchFrame, PitchPoint, SegmentedNote } from './types'

export interface SegmenterConfig {
  /** Rolling median window applied to raw frames. */
  smoothingWindow: number
  /** Consecutive voiced frames needed before a note opens. */
  minOnsetFrames: number
  /** Consecutive unvoiced frames that close a note. */
  maxGapFrames: number
  /** Distance from the note's pitch (semitones) that counts as a new note. */
  splitThreshold: number
  /** Consecutive deviating frames needed to split the note. */
  splitFrames: number
  /** Initial portion of the note (seconds) excluded from its pitch, to skip scoops. */
  attackSeconds: number
  /** Only the most recent frames are used for the running note pitch. */
  pitchWindow: number
}

export const DEFAULT_SEGMENTER_CONFIG: SegmenterConfig = {
  smoothingWindow: 5,
  minOnsetFrames: 3,
  maxGapFrames: 4,
  splitThreshold: 0.6,
  splitFrames: 3,
  attackSeconds: 0.06,
  pitchWindow: 90,
}

type SmoothedFrame = PitchPoint

export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Turns a stream of pitch frames into discrete notes. Feed frames in time order
 * with `push`; completed notes are returned as they close. `current` exposes the
 * note being sung right now (for live drawing).
 */
export class NoteSegmenter {
  private readonly config: SegmenterConfig
  private smoothing: number[] = []
  private candidate: SmoothedFrame[] = []
  private noteFrames: SmoothedFrame[] = []
  private deviating: SmoothedFrame[] = []
  private gapFrames = 0
  private cachedPitch: number | null = null

  constructor(config: Partial<SegmenterConfig> = {}) {
    this.config = { ...DEFAULT_SEGMENTER_CONFIG, ...config }
  }

  /** The note currently being sung, or null. */
  get current(): SegmentedNote | null {
    if (this.noteFrames.length === 0) return null
    return this.buildNote(this.noteFrames)
  }

  push(frame: PitchFrame): SegmentedNote[] {
    const closed: SegmentedNote[] = []
    const c = this.config

    if (frame.midi === null) {
      this.smoothing = []
      this.candidate = []
      if (this.noteFrames.length > 0) {
        this.gapFrames++
        if (this.gapFrames >= c.maxGapFrames) {
          this.closeInto(closed)
        }
      }
      return closed
    }

    this.smoothing.push(frame.midi)
    if (this.smoothing.length > c.smoothingWindow) this.smoothing.shift()
    const smoothed: SmoothedFrame = { time: frame.time, midi: median(this.smoothing) }

    if (this.noteFrames.length === 0) {
      this.candidate.push(smoothed)
      if (this.candidate.length > c.minOnsetFrames) this.candidate.shift()
      if (this.candidate.length >= c.minOnsetFrames && this.isCoherent(this.candidate)) {
        this.openNote(this.candidate)
        this.candidate = []
      }
      return closed
    }

    this.gapFrames = 0
    const notePitch = this.runningPitch()
    if (Math.abs(smoothed.midi - notePitch) > c.splitThreshold) {
      this.deviating.push(smoothed)
      if (this.deviating.length >= c.splitFrames && this.isCoherent(this.deviating)) {
        const next = this.deviating
        this.deviating = []
        this.closeInto(closed)
        this.openNote(next)
      } else if (this.deviating.length >= c.splitFrames) {
        // Erratic frames (e.g. a slide): keep only the most recent ones as split candidates.
        this.deviating.shift()
      }
    } else {
      // Brief excursions (vibrato peaks, glitches) are absorbed into the note's duration only.
      this.deviating = []
      this.noteFrames.push(smoothed)
      this.cachedPitch = null
    }
    return closed
  }

  /** Closes and returns the current note, if any (e.g. on pause or stop). */
  flush(): SegmentedNote | null {
    const closed: SegmentedNote[] = []
    if (this.noteFrames.length > 0) this.closeInto(closed)
    this.smoothing = []
    this.candidate = []
    return closed[0] ?? null
  }

  private isCoherent(frames: readonly SmoothedFrame[]): boolean {
    const m = median(frames.map((f) => f.midi))
    return frames.every((f) => Math.abs(f.midi - m) <= this.config.splitThreshold)
  }

  private openNote(frames: SmoothedFrame[]): void {
    this.noteFrames = [...frames]
    this.deviating = []
    this.gapFrames = 0
    this.cachedPitch = null
  }

  private closeInto(closed: SegmentedNote[]): void {
    closed.push(this.buildNote(this.noteFrames))
    this.noteFrames = []
    this.deviating = []
    this.gapFrames = 0
    this.cachedPitch = null
  }

  private runningPitch(): number {
    if (this.cachedPitch === null) {
      const recent = this.noteFrames.slice(-this.config.pitchWindow)
      this.cachedPitch = median(this.stableFrames(recent).map((f) => f.midi))
    }
    return this.cachedPitch
  }

  /** Frames after the attack, or all frames if the note is too short to have any. */
  private stableFrames(frames: readonly SmoothedFrame[]): readonly SmoothedFrame[] {
    const cutoff = this.noteFrames[0].time + this.config.attackSeconds
    const stable = frames.filter((f) => f.time >= cutoff)
    return stable.length > 0 ? stable : frames
  }

  private buildNote(frames: readonly SmoothedFrame[]): SegmentedNote {
    return {
      startTime: frames[0].time,
      endTime: frames[frames.length - 1].time,
      pitch: median(this.stableFrames(frames).map((f) => f.midi)),
      frameCount: frames.length,
      // The live note shares its (still growing) frame array; closed notes get a fresh one on close.
      contour: frames,
    }
  }
}
