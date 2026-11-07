import { describe, it, expect } from 'vitest'
import { centsDistance, midiToHz } from './cents'

describe('centsDistance', () => {
  it('returns 0 for unison', () => {
    expect(centsDistance(440, 440)).toBe(0)
  })

  it('returns 1200 for one octave up', () => {
    expect(centsDistance(880, 440)).toBeCloseTo(1200)
  })

  it('returns -1200 for one octave down', () => {
    expect(centsDistance(220, 440)).toBeCloseTo(-1200)
  })

  it('returns ~100 for one semitone up', () => {
    const semitone = 440 * 2 ** (1 / 12)
    expect(centsDistance(semitone, 440)).toBeCloseTo(100)
  })

  it('is antisymmetric', () => {
    expect(centsDistance(300, 440)).toBeCloseTo(-centsDistance(440, 300))
  })

  it('returns ~701.96 for a perfect fifth (3:2 ratio)', () => {
    expect(centsDistance(660, 440)).toBeCloseTo(701.955, 2)
  })
})

describe('midiToHz', () => {
  it('returns 440 for MIDI 69 (A4)', () => {
    expect(midiToHz(69)).toBeCloseTo(440)
  })

  it('returns ~261.63 for MIDI 60 (C4)', () => {
    expect(midiToHz(60)).toBeCloseTo(261.626, 2)
  })

  it('doubles frequency per octave', () => {
    expect(midiToHz(81)).toBeCloseTo(midiToHz(69) * 2)
  })

  it('handles fractional MIDI notes', () => {
    const half = midiToHz(69.5)
    expect(half).toBeGreaterThan(440)
    expect(half).toBeLessThan(midiToHz(70))
  })
})
