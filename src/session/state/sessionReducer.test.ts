import { describe, expect, it } from 'vitest'
import { initialPhase, sessionReducer } from './sessionReducer'
import type { SessionPhase } from './types'
import type { SessionSettings } from '../../types'

const settings: SessionSettings = { key: { tonic: 2, mode: 'major' }, tuning: 'just' }
const running: SessionPhase = { type: 'running', settings }
const paused: SessionPhase = { type: 'paused', settings }
const stopped: SessionPhase = { type: 'stopped', settings }

describe('sessionReducer', () => {
  it('starts from setup', () => {
    expect(sessionReducer(initialPhase, { type: 'START', settings })).toEqual(running)
  })

  it('ignores START unless in setup', () => {
    expect(sessionReducer(paused, { type: 'START', settings })).toBe(paused)
  })

  it('pauses and resumes', () => {
    expect(sessionReducer(running, { type: 'PAUSE' })).toEqual(paused)
    expect(sessionReducer(paused, { type: 'RESUME' })).toEqual(running)
    expect(sessionReducer(stopped, { type: 'RESUME' })).toBe(stopped)
    expect(sessionReducer(initialPhase, { type: 'PAUSE' })).toBe(initialPhase)
  })

  it('stops from running or paused', () => {
    expect(sessionReducer(running, { type: 'STOP' })).toEqual(stopped)
    expect(sessionReducer(paused, { type: 'STOP' })).toEqual(stopped)
    expect(sessionReducer(initialPhase, { type: 'STOP' })).toBe(initialPhase)
  })

  it('resets from any phase', () => {
    for (const phase of [running, paused, stopped, initialPhase]) {
      expect(sessionReducer(phase, { type: 'RESET' })).toEqual(initialPhase)
    }
  })
})
