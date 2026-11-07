import type { SessionSettings } from '../../types'

export type SessionPhase =
  | { type: 'setup' }
  | { type: 'running'; settings: SessionSettings }
  | { type: 'paused'; settings: SessionSettings }
  | { type: 'stopped'; settings: SessionSettings }

export type SessionAction =
  | { type: 'START'; settings: SessionSettings }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'RESET' }
