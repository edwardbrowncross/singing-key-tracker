import { describe, expect, it } from 'vitest'
import { pitchShift } from './pitchShift'

const SR = 16000

function sine(freq: number, seconds: number): Float32Array {
  const out = new Float32Array(Math.round(seconds * SR))
  for (let i = 0; i < out.length; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / SR)
  return out
}

/** Estimates frequency from upward zero crossings in [from, to) seconds. */
function measureFrequency(signal: Float32Array, from: number, to: number): number {
  const a = Math.round(from * SR)
  const b = Math.round(to * SR)
  let first = -1
  let last = -1
  let count = 0
  for (let i = a + 1; i < b; i++) {
    if (signal[i - 1] < 0 && signal[i] >= 0) {
      const t = i - 1 + -signal[i - 1] / (signal[i] - signal[i - 1])
      if (first < 0) first = t
      last = t
      count++
    }
  }
  return ((count - 1) * SR) / (last - first)
}

function rms(signal: Float32Array, from: number, to: number): number {
  let sum = 0
  const a = Math.round(from * SR)
  const b = Math.round(to * SR)
  for (let i = a; i < b; i++) sum += signal[i] * signal[i]
  return Math.sqrt(sum / (b - a))
}

describe('pitchShift', () => {
  it('keeps the input length', () => {
    const input = sine(220, 1)
    expect(pitchShift(input, SR, () => 100)).toHaveLength(input.length)
  })

  it('shifts a sine up by 100 cents', () => {
    const out = pitchShift(sine(220, 1.5), SR, () => 100)
    expect(measureFrequency(out, 0.3, 1.2)).toBeCloseTo(220 * 2 ** (100 / 1200), 0)
  })

  it('shifts a sine down by 250 cents', () => {
    const out = pitchShift(sine(220, 1.5), SR, () => -250)
    expect(measureFrequency(out, 0.3, 1.2)).toBeCloseTo(220 * 2 ** (-250 / 1200), 0)
  })

  it('reconstructs the input when the shift is zero', () => {
    const input = sine(220, 1)
    const out = pitchShift(input, SR, () => 0)
    for (let i = 2000; i < 14000; i += 97) expect(out[i]).toBeCloseTo(input[i], 4)
  })

  it('keeps a steady level without comb-filtering dropouts', () => {
    const out = pitchShift(sine(150, 2), SR, () => 30)
    for (let t = 0.2; t < 1.7; t += 0.1) expect(rms(out, t, t + 0.1)).toBeGreaterThan(0.6)
  })

  it('follows a time-varying shift', () => {
    const out = pitchShift(sine(220, 2), SR, (t) => (t < 1 ? 0 : 200))
    expect(measureFrequency(out, 0.2, 0.9)).toBeCloseTo(220, 0)
    expect(measureFrequency(out, 1.2, 1.9)).toBeCloseTo(220 * 2 ** (200 / 1200), 0)
  })
})
