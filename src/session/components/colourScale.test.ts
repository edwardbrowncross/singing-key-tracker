import { describe, expect, it } from 'vitest'
import { centsToHue, formatCents } from './colourScale'

describe('colourScale', () => {
  it('is green in tune, blue when sharp and red when flat', () => {
    expect(centsToHue(0)).toBe(150)
    expect(centsToHue(50)).toBe(255)
    expect(centsToHue(-50)).toBe(25)
  })

  it('clamps beyond the range', () => {
    expect(centsToHue(400)).toBe(255)
    expect(centsToHue(-400)).toBe(25)
  })

  it('formats cents with sign', () => {
    expect(formatCents(12.4)).toBe('+12¢')
    expect(formatCents(-7.6)).toBe('−8¢')
    expect(formatCents(0.2)).toBe('0¢')
  })
})
