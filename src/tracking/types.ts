/** A single pitch detector reading in song time. `midi` is null when no pitch was detected. */
export interface PitchFrame {
  time: number
  midi: number | null
}

/** One smoothed pitch reading within a note. */
export interface PitchPoint {
  time: number
  midi: number
}

/** A sung note as produced by the segmenter. Times are song time in seconds. */
export interface SegmentedNote {
  startTime: number
  endTime: number
  /** Representative pitch (median, attack excluded) as fractional MIDI. */
  pitch: number
  frameCount: number
  /** Smoothed pitch over the course of the note (including the attack). */
  contour: readonly PitchPoint[]
}

/** A segmented note annotated by the key tracker. */
export interface TrackedNote extends SegmentedNote {
  /** Key centre (tonic, fractional MIDI, unwrapped) in force when the note was sung. */
  keyRef: number
  /** Where the tonic should be (start key, or start key + modulations) when the note was sung. */
  referenceRef: number
  /** Chromatic degree 0–11 relative to `keyRef`. */
  degree: number
  /** Offset from the nearest degree of the current key centre, in cents. */
  offsetCents: number
  /** Offset from where the note should be in the reference key, in cents. Drives the colour. */
  colourCents: number
  /** Influence this note had on the key estimate (0 = ignored). */
  weight: number
}

export interface TrackerState {
  keyRef: number
  referenceRef: number
}

export interface KeyChangeEvent {
  /** Index of the first note in the new key (back-propagated change point). */
  noteIndex: number
  /** Song time at which the new key starts. */
  time: number
  /** Modulation in semitones (positive = up). */
  semitones: number
  /** Index of the note that pushed confidence over the threshold. */
  detectedAtIndex: number
}
