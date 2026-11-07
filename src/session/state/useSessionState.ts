import { useCallback, useEffect, useReducer, useState } from 'react'
import { micErrorMessage, useAudio } from '../../audio/AudioProvider'
import type { Recording } from '../../audio/AudioRecorder'
import { TrackingSession } from '../../tracking/TrackingSession'
import type { SessionSettings } from '../../types'
import { initialPhase, sessionReducer } from './sessionReducer'
import { saveSettings } from './settingsStorage'

const wallClock = () => performance.now() / 1000

/**
 * Main entry-point hook for a tracking run. Owns the phase reducer and drives
 * the side effects: pitch detector and recorder lifecycle, creating the
 * TrackingSession, and feeding detector frames into it.
 */
export function useSessionState() {
  const { getOrCreateAudioContext, getPitchDetector, getRecorder, getPlayer } = useAudio()
  const [phase, dispatch] = useReducer(sessionReducer, initialPhase)
  const [session, setSession] = useState<TrackingSession | null>(null)
  const [recording, setRecording] = useState<Recording | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Feed every detector frame (raw, unsmoothed) into the active session.
  useEffect(() => {
    const detector = getPitchDetector()
    if (!session || !detector) return
    return detector.subscribe(() => session.pushPitch(detector.getSnapshot().pitch))
  }, [session, getPitchDetector])

  const handleStart = useCallback(async (settings: SessionSettings) => {
    setError(null)
    saveSettings(settings)
    getOrCreateAudioContext()
    const detector = getPitchDetector()
    if (!detector) return
    try {
      await detector.start()
    } catch (err) {
      setError(micErrorMessage(err))
      return
    }

    const source = detector.getSource()
    const recorder = getRecorder()
    if (source && recorder) {
      try {
        await recorder.start(source)
      } catch (err) {
        // Tracking still works without a recording; playback just won't be available.
        console.warn('Recording unavailable', err)
      }
    }

    const next = new TrackingSession(settings, wallClock)
    next.start()
    setRecording(null)
    setSession(next)
    dispatch({ type: 'START', settings })
  }, [getOrCreateAudioContext, getPitchDetector, getRecorder])

  const handlePause = useCallback(() => {
    session?.pause()
    getRecorder()?.setRecording(false)
    dispatch({ type: 'PAUSE' })
  }, [session, getRecorder])

  const handleResume = useCallback(() => {
    session?.resume()
    getRecorder()?.setRecording(true)
    dispatch({ type: 'RESUME' })
  }, [session, getRecorder])

  const handleStop = useCallback(async () => {
    session?.stop()
    dispatch({ type: 'STOP' })
    const recorder = getRecorder()
    const result = recorder ? await recorder.stop() : null
    getPitchDetector()?.stop()
    setRecording(result && result.samples.length > 0 ? result : null)
  }, [session, getRecorder, getPitchDetector])

  const handleReset = useCallback(() => {
    getPlayer()?.stop()
    session?.stop()
    getRecorder()?.dispose()
    getPitchDetector()?.stop()
    setSession(null)
    setRecording(null)
    setError(null)
    dispatch({ type: 'RESET' })
  }, [session, getPlayer, getRecorder, getPitchDetector])

  return { phase, session, recording, error, handleStart, handlePause, handleResume, handleStop, handleReset }
}
