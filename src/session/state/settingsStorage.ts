import type { SessionSettings } from '../../types'

const STORAGE_KEY = 'singing-key-tracker:settings'

export const DEFAULT_SETTINGS: SessionSettings = {
  key: { tonic: 0, mode: 'major' },
  tuning: 'equal',
}

/** Reads saved settings, falling back to defaults for anything missing or invalid. */
export function loadSettings(): SessionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<{ key: Partial<SessionSettings['key']>; tuning: unknown }>
    const tonic = parsed.key?.tonic
    const mode = parsed.key?.mode
    return {
      key: {
        tonic: Number.isInteger(tonic) && tonic! >= 0 && tonic! < 12 ? tonic! : DEFAULT_SETTINGS.key.tonic,
        mode: mode === 'major' || mode === 'minor' ? mode : DEFAULT_SETTINGS.key.mode,
      },
      tuning: parsed.tuning === 'equal' || parsed.tuning === 'just' ? parsed.tuning : DEFAULT_SETTINGS.tuning,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(settings: SessionSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable (private mode etc.) — settings just won't persist.
  }
}

const NOTE_STYLE_KEY = 'singing-key-tracker:note-style'

export type NoteStyle = 'average' | 'contour'

export function loadNoteStyle(): NoteStyle {
  try {
    return localStorage.getItem(NOTE_STYLE_KEY) === 'contour' ? 'contour' : 'average'
  } catch {
    return 'average'
  }
}

export function saveNoteStyle(style: NoteStyle): void {
  try {
    localStorage.setItem(NOTE_STYLE_KEY, style)
  } catch {
    // Storage unavailable — preference just won't persist.
  }
}
