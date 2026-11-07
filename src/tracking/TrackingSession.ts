import { hzToMidi } from '../audio/cents'
import { tonicMidi } from '../music/keys'
import { getTuningGrid, type TuningGrid } from '../music/tuningGrids'
import type { KeySpec, SessionSettings, Tuning } from '../types'
import { keyRefAt } from './keyAtTime'
import { KeyChangeDetector, type KeyChangeConfig } from './keyChangeDetector'
import { createTrackerState, DEFAULT_TRACKER_CONFIG, evaluateNote, trackNote, type TrackerConfig } from './keyTracker'
import { NoteSegmenter, type SegmenterConfig } from './noteSegmenter'
import { replayFrom } from './replay'
import type { KeyChangeEvent, TrackedNote, TrackerState } from './types'

export interface TrackingSessionConfig {
  segmenter?: Partial<SegmenterConfig>
  tracker?: Partial<TrackerConfig>
  keyChange?: Partial<KeyChangeConfig>
  /** Disable key-change detection entirely. */
  detectKeyChanges?: boolean
}

export interface TrackingSnapshot {
  /** Nominal key (start key plus any detected modulations). */
  key: KeySpec
  /** How far the sung key centre is from the nominal key, in cents. */
  driftCents: number
  /** Key-change evidence, 0–1. */
  keyChangeConfidence: number
  noteCount: number
  keyChanges: readonly KeyChangeEvent[]
  isSinging: boolean
  tuning: Tuning
}

/**
 * Owns one tracking run: song clock (excluding pauses), note segmentation, key
 * drift tracking and key-change detection. Plain class with no React
 * dependency; exposes `subscribe/getSnapshot` for `useSyncExternalStore`.
 * Subscribers are notified when notes open/close or the key changes — never per
 * frame. High-rate data (notes, live note, song time) is read directly by the
 * timeline's own animation loop.
 */
export class TrackingSession {
  readonly startRef: number

  private readonly clock: () => number
  private readonly trackerConfig: TrackerConfig
  private readonly segmenter: NoteSegmenter
  private readonly keyChangeConfig: Partial<KeyChangeConfig> | null
  private detector: KeyChangeDetector | null
  private currentSettings: SessionSettings
  private currentGrid: TuningGrid

  private notes: TrackedNote[] = []
  private state: TrackerState
  private keyChanges: KeyChangeEvent[] = []

  private startedAt: number | null = null
  private pausedAt: number | null = null
  private pausedTotal = 0
  private stopped = false

  private listeners = new Set<() => void>()
  private snapshot: TrackingSnapshot

  constructor(settings: SessionSettings, clock: () => number, config: TrackingSessionConfig = {}) {
    this.currentSettings = settings
    this.clock = clock
    this.currentGrid = getTuningGrid(settings.tuning, settings.key.mode)
    this.startRef = tonicMidi(settings.key)
    this.state = createTrackerState(this.startRef)
    this.trackerConfig = { ...DEFAULT_TRACKER_CONFIG, ...config.tracker }
    this.segmenter = new NoteSegmenter(config.segmenter)
    this.keyChangeConfig = config.detectKeyChanges === false ? null : (config.keyChange ?? {})
    this.detector = this.createDetector()
    this.snapshot = this.buildSnapshot()
  }

  get settings(): SessionSettings {
    return this.currentSettings
  }

  get grid(): TuningGrid {
    return this.currentGrid
  }

  /**
   * Switches between equal temperament and just intonation, re-tracking every
   * note recorded so far (drift, colours and key changes) against the new grid.
   */
  setTuning(tuning: Tuning): void {
    if (tuning === this.currentSettings.tuning) return
    this.currentSettings = { ...this.currentSettings, tuning }
    this.currentGrid = getTuningGrid(tuning, this.currentSettings.key.mode)
    this.detector = this.createDetector()
    const notes = this.notes
    this.notes = []
    this.keyChanges = []
    this.state = createTrackerState(this.startRef)
    // TrackedNote extends SegmentedNote; tracking overwrites all the annotations.
    for (const note of notes) this.addNote(note)
    this.notify()
  }

  // --- Clock ---

  start(): void {
    if (this.startedAt !== null) return
    this.startedAt = this.clock()
  }

  get isRunning(): boolean {
    return this.startedAt !== null && this.pausedAt === null && !this.stopped
  }

  /** Current song time in seconds (frozen while paused or stopped). */
  now(): number {
    if (this.startedAt === null) return 0
    const t = this.pausedAt ?? this.clock()
    return t - this.startedAt - this.pausedTotal
  }

  pause(): void {
    if (!this.isRunning) return
    this.flushLiveNote()
    this.pausedAt = this.clock()
    this.notify()
  }

  resume(): void {
    if (this.pausedAt === null || this.stopped) return
    this.pausedTotal += this.clock() - this.pausedAt
    this.pausedAt = null
    this.notify()
  }

  stop(): void {
    if (this.stopped) return
    if (this.isRunning) {
      this.flushLiveNote()
      this.pausedAt = this.clock()
    }
    this.stopped = true
    this.notify()
  }

  // --- Input ---

  /** Feed one pitch detector reading (Hz, or null when unvoiced). Ignored unless running. */
  pushPitch(hz: number | null): void {
    if (!this.isRunning) return
    const hadLive = this.segmenter.current !== null
    const closed = this.segmenter.push({ time: this.now(), midi: hz === null ? null : hzToMidi(hz) })
    for (const note of closed) this.addNote(note)
    const hasLive = this.segmenter.current !== null
    if (closed.length > 0 || hadLive !== hasLive) this.notify()
  }

  // --- Read access for rendering ---

  getNotes(): readonly TrackedNote[] {
    return this.notes
  }

  /** The note being sung right now, evaluated against the current key estimate. */
  getLiveNote(): TrackedNote | null {
    const live = this.segmenter.current
    if (!live) return null
    return evaluateNote(this.state, { ...live, endTime: Math.max(live.endTime, this.now()) }, this.grid, this.trackerConfig)
  }

  getTrackerState(): TrackerState {
    return this.state
  }

  /** Key centre in force at a song time (current estimate if no notes yet). */
  keyRefAt(time: number): number {
    return keyRefAt(this.notes, time, this.state.keyRef)
  }

  getKeyChanges(): readonly KeyChangeEvent[] {
    return this.keyChanges
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): TrackingSnapshot => this.snapshot

  // --- Internals ---

  private createDetector(): KeyChangeDetector | null {
    return this.keyChangeConfig === null ? null : new KeyChangeDetector(this.currentGrid, this.keyChangeConfig)
  }

  private flushLiveNote(): void {
    const note = this.segmenter.flush()
    if (note) this.addNote(note)
  }

  private addNote(note: Parameters<typeof trackNote>[1]): void {
    const result = trackNote(this.state, note, this.grid, this.trackerConfig)
    this.state = result.state
    this.notes.push(result.note)
    const detection = this.detector?.push(result.note, this.notes.length - 1)
    if (detection) this.applyKeyChange(detection.noteIndex, detection.semitones)
  }

  private applyKeyChange(noteIndex: number, semitones: number): void {
    const detectedAtIndex = this.notes.length - 1
    const replayed = replayFrom(this.notes, noteIndex, semitones, this.grid, this.trackerConfig)
    this.notes = replayed.notes
    this.state = replayed.state
    this.keyChanges = [
      ...this.keyChanges,
      { noteIndex, time: this.notes[noteIndex].startTime, semitones, detectedAtIndex },
    ]
    // Re-score the notes since the change point against the new key, so evidence starts fresh.
    this.detector!.reset()
    for (let i = noteIndex; i < this.notes.length; i++) this.detector!.push(this.notes[i], i)
  }

  private currentKey(): KeySpec {
    const modulation = Math.round(this.state.referenceRef - this.startRef)
    return { ...this.settings.key, tonic: (((this.settings.key.tonic + modulation) % 12) + 12) % 12 }
  }

  private buildSnapshot(): TrackingSnapshot {
    return {
      key: this.currentKey(),
      driftCents: (this.state.keyRef - this.state.referenceRef) * 100,
      keyChangeConfidence: this.detector?.confidence ?? 0,
      noteCount: this.notes.length,
      keyChanges: this.keyChanges,
      isSinging: this.segmenter.current !== null,
      tuning: this.currentSettings.tuning,
    }
  }

  private notify(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }
}
