import type { KeySpec, Mode } from '../types'

/** Generic note names used when no key context is available. */
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'] as const

/** Conventional spelling of each tonic for major and minor keys. */
const KEY_TONIC_NAMES: Record<Mode, readonly string[]> = {
  major: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'],
  minor: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'],
}

/** Labels for the tonic picker (enharmonic pairs shown together). */
export const TONIC_OPTIONS = [
  'C', 'C♯ / D♭', 'D', 'D♯ / E♭', 'E', 'F', 'F♯ / G♭', 'G', 'G♯ / A♭', 'A', 'A♯ / B♭', 'B',
].map((label, value) => ({ value: String(value), label }))

export function pitchClass(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12
}

export function keyName(key: KeySpec): string {
  return `${KEY_TONIC_NAMES[key.mode][pitchClass(key.tonic)]} ${key.mode}`
}

/** Note name with octave, e.g. 60 → "C4". Fractional values are rounded. */
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi)
  return `${NOTE_NAMES[pitchClass(rounded)]}${Math.floor(rounded / 12) - 1}`
}

/**
 * The tonic of a key as a MIDI number at concert pitch (A=440, ET), placed in
 * octave 4 (C4…B4). Only the pitch class matters to the tracker, but a concrete
 * value keeps the key reference unwrapped.
 */
export function tonicMidi(key: KeySpec): number {
  return 60 + pitchClass(key.tonic)
}
