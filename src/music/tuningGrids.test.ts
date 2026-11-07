import { describe, expect, it } from 'vitest'
import { getTuningGrid, nearestDegree } from './tuningGrids'

describe('getTuningGrid', () => {
  it('equal temperament degrees are whole semitones', () => {
    const grid = getTuningGrid('equal', 'major')
    expect(grid.map((d) => d.semitones)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  })

  it('just intonation major third is a 5:4 ratio (about 13.7¢ flat of ET)', () => {
    const grid = getTuningGrid('just', 'major')
    expect(grid[4].semitones).toBeCloseTo(12 * Math.log2(5 / 4))
    expect((grid[4].semitones - 4) * 100).toBeCloseTo(-13.69, 1)
  })

  it('major diatonic degrees have full weight and chromatic degrees reduced weight', () => {
    const grid = getTuningGrid('equal', 'major')
    const inKey = grid.flatMap((d, i) => (d.weight === 1 ? [i] : []))
    expect(inKey).toEqual([0, 2, 4, 5, 7, 9, 11])
  })

  it('minor treats the natural minor scale as in key', () => {
    const grid = getTuningGrid('equal', 'minor')
    const inKey = grid.flatMap((d, i) => (d.weight === 1 ? [i] : []))
    expect(inKey).toEqual([0, 2, 3, 5, 7, 8, 10])
  })
})

describe('nearestDegree', () => {
  const et = getTuningGrid('equal', 'major')
  const ji = getTuningGrid('just', 'major')

  it('finds the degree and signed offset in ET', () => {
    const m = nearestDegree(4.1, et)
    expect(m.degree).toBe(4)
    expect(m.offsetCents).toBeCloseTo(10)
  })

  it('handles octaves above and below the tonic', () => {
    expect(nearestDegree(19.05, et)).toMatchObject({ degree: 7, target: 19 })
    const below = nearestDegree(-1.2, et)
    expect(below.degree).toBe(11)
    expect(below.target).toBe(-1)
    expect(below.offsetCents).toBeCloseTo(-20)
  })

  it('a pure JI third is in tune against the JI grid but flat against ET', () => {
    const third = 12 * Math.log2(5 / 4)
    expect(nearestDegree(third, ji).offsetCents).toBeCloseTo(0)
    expect(nearestDegree(third, et).offsetCents).toBeCloseTo(-13.69, 1)
  })

  it('wraps near the octave boundary', () => {
    const m = nearestDegree(11.9, et)
    expect(m.degree).toBe(0)
    expect(m.target).toBe(12)
    expect(m.offsetCents).toBeCloseTo(-10)
  })

  it('gives scale tones a wider hit area than accidentals (60:40)', () => {
    // E is a scale tone in C major; E♭ is an accidental. Boundary is 60¢ below E.
    expect(nearestDegree(3.5, et)).toMatchObject({ degree: 4, offsetCents: expect.closeTo(-50) })
    expect(nearestDegree(3.42, et)).toMatchObject({ degree: 4, offsetCents: expect.closeTo(-58) })
    expect(nearestDegree(3.38, et)).toMatchObject({ degree: 3, offsetCents: expect.closeTo(38) })
    // Sharp of a scale tone towards an accidental behaves the same way.
    expect(nearestDegree(7.55, et).degree).toBe(7)
    expect(nearestDegree(7.62, et).degree).toBe(8)
  })

  it('keeps a 50:50 split between two adjacent scale tones', () => {
    expect(nearestDegree(4.49, et).degree).toBe(4)
    expect(nearestDegree(4.51, et).degree).toBe(5)
  })
})
