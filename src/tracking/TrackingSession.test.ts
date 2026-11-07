import { describe, expect, it, vi } from 'vitest'
import { midiToHz } from '../audio/cents'
import { TrackingSession } from './TrackingSession'
import { MAJOR_MELODY } from './testing/synth'

function makeSession(detectKeyChanges = true, tuning: 'equal' | 'just' = 'equal') {
  let t = 100
  const clock = { now: () => t, advance: (dt: number) => (t += dt) }
  const session = new TrackingSession({ key: { tonic: 0, mode: 'major' }, tuning }, clock.now, { detectKeyChanges })
  return { session, clock }
}

/** Sings `midi` for `seconds` at 60 fps, then `gap` seconds of silence. */
function sing(session: TrackingSession, clock: { advance: (dt: number) => void }, midi: number, seconds = 0.5, gap = 0.1) {
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    clock.advance(1 / 60)
    session.pushPitch(midiToHz(midi))
  }
  for (let i = 0; i < Math.round(gap * 60); i++) {
    clock.advance(1 / 60)
    session.pushPitch(null)
  }
}

describe('TrackingSession', () => {
  it('ignores input until started', () => {
    const { session, clock } = makeSession()
    sing(session, clock, 60)
    expect(session.getNotes()).toHaveLength(0)
  })

  it('records notes in song time starting from zero', () => {
    const { session, clock } = makeSession()
    session.start()
    sing(session, clock, 60)
    sing(session, clock, 64)
    const notes = session.getNotes()
    expect(notes).toHaveLength(2)
    expect(notes[0].startTime).toBeCloseTo(0, 1)
    expect(notes[1].pitch).toBeCloseTo(64)
  })

  it('excludes paused time from the song clock and closes the live note on pause', () => {
    const { session, clock } = makeSession()
    session.start()
    sing(session, clock, 60, 0.5, 0)
    session.pause()
    expect(session.getNotes()).toHaveLength(1)
    const pausedAt = session.now()
    clock.advance(10)
    expect(session.now()).toBeCloseTo(pausedAt)
    sing(session, clock, 62) // ignored while paused
    expect(session.getNotes()).toHaveLength(1)
    session.resume()
    sing(session, clock, 64)
    expect(session.getNotes()[1].startTime).toBeLessThan(pausedAt + 0.2)
  })

  it('notifies on note boundaries, not on every frame', () => {
    const { session, clock } = makeSession()
    const listener = vi.fn()
    session.subscribe(listener)
    session.start()
    sing(session, clock, 60)
    expect(listener.mock.calls.length).toBeLessThanOrEqual(3)
    expect(session.getSnapshot().noteCount).toBe(1)
  })

  it('reports drift in the snapshot', () => {
    const { session, clock } = makeSession()
    session.start()
    for (let i = 0; i < 60; i++) sing(session, clock, 60 + MAJOR_MELODY[i % MAJOR_MELODY.length] - 0.2)
    expect(session.getSnapshot().driftCents).toBeCloseTo(-20, 0)
  })

  it('detects a key change, records it and moves the nominal key', () => {
    const { session, clock } = makeSession()
    session.start()
    for (let i = 0; i < 70; i++) sing(session, clock, 60 + MAJOR_MELODY[i % MAJOR_MELODY.length] + (i >= 30 ? 1 : 0))
    const { keyChanges, key, driftCents } = session.getSnapshot()
    expect(keyChanges).toHaveLength(1)
    expect(keyChanges[0].semitones).toBe(1)
    expect(Math.abs(keyChanges[0].noteIndex - 30)).toBeLessThanOrEqual(3)
    expect(key.tonic).toBe(1)
    expect(Math.abs(driftCents)).toBeLessThan(2)
    expect(Math.abs(session.getNotes()[60].colourCents)).toBeLessThan(2)
  })

  it('re-tracks recorded notes when the tuning changes', () => {
    const { session, clock } = makeSession()
    session.start()
    const justThird = 12 * Math.log2(5 / 4)
    for (let i = 0; i < 12; i++) sing(session, clock, 60 + [0, justThird, 7][i % 3])
    const etThird = session.getNotes()[1]
    expect(etThird.offsetCents).toBeLessThan(-10)

    const listener = vi.fn()
    session.subscribe(listener)
    session.setTuning('just')
    expect(listener).toHaveBeenCalled()
    expect(session.getSnapshot().tuning).toBe('just')
    expect(session.getNotes()).toHaveLength(12)
    expect(session.getNotes()[1].offsetCents).toBeCloseTo(0, 0)
    expect(session.getSnapshot().driftCents).toBeCloseTo(0, 0)
  })
})
