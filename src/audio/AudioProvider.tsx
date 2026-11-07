import { createContext, useCallback, useContext, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { PitchDetector } from './PitchDetector'
import { AudioRecorder } from './AudioRecorder'
import { PlaybackPlayer } from './PlaybackPlayer'
import { useMedianBuffer } from '../hooks/useMedianBuffer'

type AudioState = 'uninitialized' | 'running' | 'suspended'

interface AudioContextValue {
  getOrCreateAudioContext: () => AudioContext
  state: AudioState
  pitchDetector: PitchDetector | null
  getPitchDetector: () => PitchDetector | null
  getRecorder: () => AudioRecorder | null
  getPlayer: () => PlaybackPlayer | null
}

const AudioCtx = createContext<AudioContextValue | null>(null)

export function AudioProvider({ children }: { children: ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null)
  const pitchDetectorRef = useRef<PitchDetector | null>(null)
  const recorderRef = useRef<AudioRecorder | null>(null)
  const playerRef = useRef<PlaybackPlayer | null>(null)
  const [state, setState] = useState<AudioState>('uninitialized')
  const [pitchDetector, setPitchDetector] = useState<PitchDetector | null>(null)

  const getOrCreateAudioContext = useCallback(() => {
    if (ctxRef.current) {
      if (ctxRef.current.state === 'suspended') void ctxRef.current.resume()
      return ctxRef.current
    }

    if ('audioSession' in navigator) {
      (navigator.audioSession as { type: string }).type = 'play-and-record'
    }

    const ctx = new AudioContext()
    ctxRef.current = ctx

    const detector = new PitchDetector(ctx)
    pitchDetectorRef.current = detector
    setPitchDetector(detector)
    recorderRef.current = new AudioRecorder(ctx)
    playerRef.current = new PlaybackPlayer(ctx)

    ctx.onstatechange = () => {
      setState(ctx.state === 'closed' ? 'uninitialized' : ctx.state as AudioState)
    }

    setState(ctx.state as AudioState)
    return ctx
  }, [])

  const getPitchDetector = useCallback(() => pitchDetectorRef.current, [])
  const getRecorder = useCallback(() => recorderRef.current, [])
  const getPlayer = useCallback(() => playerRef.current, [])

  return (
    <AudioCtx.Provider value={{ getOrCreateAudioContext, state, pitchDetector, getPitchDetector, getRecorder, getPlayer }}>
      {children}
    </AudioCtx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAudio(): AudioContextValue {
  const value = useContext(AudioCtx)
  if (!value) {
    throw new Error('useAudio must be used within an AudioProvider')
  }
  return value
}

// eslint-disable-next-line react-refresh/only-export-components
export function micErrorMessage(err: unknown): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'Microphone access was denied. Check your browser\'s site permissions, and ensure your browser has microphone access in your system settings.'
  }
  return 'Could not access the microphone. Please check your device settings.'
}

/**
 * React view of the shared PitchDetector: lifecycle controls plus a
 * median-smoothed pitch and the raw input level. Re-renders on every detector
 * frame, so use it for small live displays (e.g. the mic check), not the timeline.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function usePitchDetector(options?: { medianCount?: number }): {
  isRunning: boolean
  start: () => Promise<boolean>
  stop: () => void
  pitch: number | null
  level: number
  micError: string | null
} {
  const { getOrCreateAudioContext, pitchDetector, getPitchDetector } = useAudio()
  const medianCount = options?.medianCount ?? 1
  const { value: medianValue, push: medianPush, shift: medianShift, clear: medianClear } = useMedianBuffer(medianCount)
  const [micError, setMicError] = useState<string | null>(null)

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!pitchDetector) return () => {}
      return pitchDetector.subscribe(() => {
        const { pitch } = pitchDetector.getSnapshot()
        if (pitch !== null) {
          medianPush(pitch)
        } else {
          medianShift()
        }
        onStoreChange()
      })
    },
    [pitchDetector, medianPush, medianShift],
  )
  const defaultSnapshot = useMemo(() => ({ isRunning: false, pitch: null, level: 0 }), [])

  const snapshot = useSyncExternalStore(
    subscribe,
    pitchDetector?.getSnapshot ?? (() => defaultSnapshot),
  )

  const start = useCallback(async () => {
    setMicError(null)
    getOrCreateAudioContext()
    const detector = getPitchDetector()
    if (!detector) return false
    try {
      await detector.start()
      return true
    } catch (err) {
      setMicError(micErrorMessage(err))
      return false
    }
  }, [getOrCreateAudioContext, getPitchDetector])

  const stop = useCallback(() => {
    getPitchDetector()?.stop()
    medianClear()
    setMicError(null)
  }, [getPitchDetector, medianClear])

  return {
    isRunning: snapshot.isRunning,
    start,
    stop,
    pitch: medianValue,
    level: snapshot.level,
    micError,
  }
}
