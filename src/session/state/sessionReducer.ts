import type { SessionAction, SessionPhase } from './types'

export const initialPhase: SessionPhase = { type: 'setup' }

export function sessionReducer(phase: SessionPhase, action: SessionAction): SessionPhase {
  switch (action.type) {
    case 'START':
      if (phase.type !== 'setup') return phase
      return { type: 'running', settings: action.settings }

    case 'PAUSE':
      if (phase.type !== 'running') return phase
      return { type: 'paused', settings: phase.settings }

    case 'RESUME':
      if (phase.type !== 'paused') return phase
      return { type: 'running', settings: phase.settings }

    case 'STOP':
      if (phase.type !== 'running' && phase.type !== 'paused') return phase
      return { type: 'stopped', settings: phase.settings }

    case 'RESET':
      return initialPhase
  }
}
