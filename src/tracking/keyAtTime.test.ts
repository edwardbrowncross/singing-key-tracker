import { describe, expect, it } from 'vitest'
import { keyRefAt } from './keyAtTime'
import type { TrackedNote } from './types'

const note = (startTime: number, keyRef: number) =>
  ({ startTime, endTime: startTime + 0.5, keyRef }) as TrackedNote

describe('keyRefAt', () => {
  const notes = [note(0, 60), note(1, 59.9), note(2, 61)]

  it('uses the fallback when there are no notes', () => {
    expect(keyRefAt([], 3, 62)).toBe(62)
  })

  it('uses the first note before any notes start', () => {
    expect(keyRefAt(notes, -1, 0)).toBe(60)
  })

  it('uses the latest note starting at or before the time', () => {
    expect(keyRefAt(notes, 0.4, 0)).toBe(60)
    expect(keyRefAt(notes, 1, 0)).toBe(59.9)
    expect(keyRefAt(notes, 1.8, 0)).toBe(59.9)
    expect(keyRefAt(notes, 10, 0)).toBe(61)
  })
})
