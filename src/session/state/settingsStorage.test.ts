import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './settingsStorage'

describe('settingsStorage', () => {
  beforeEach(() => localStorage.clear())

  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })

  it('round-trips settings', () => {
    const settings = { key: { tonic: 9, mode: 'minor' as const }, tuning: 'just' as const }
    saveSettings(settings)
    expect(loadSettings()).toEqual(settings)
  })

  it('falls back per field for invalid data', () => {
    localStorage.setItem('singing-key-tracker:settings', JSON.stringify({ key: { tonic: 14, mode: 'minor' }, tuning: 'bogus' }))
    expect(loadSettings()).toEqual({ key: { tonic: 0, mode: 'minor' }, tuning: 'equal' })
  })

  it('survives corrupt JSON', () => {
    localStorage.setItem('singing-key-tracker:settings', '{nope')
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS)
  })
})
