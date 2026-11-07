import { useCallback, useEffect, useRef, useState } from 'react'
import { useAudio } from '../../audio/AudioProvider'
import type { Recording } from '../../audio/AudioRecorder'
import { pitchShift } from '../../audio/pitchShift'
import { buildDriftCurve, driftAt } from '../../tracking/driftCurve'
import type { TrackingSession } from '../../tracking/TrackingSession'

/**
 * Playback of the recorded take after stopping, optionally pitch-shifted to
 * undo the key drift (a plain frequency-ratio shift following the drift curve).
 */
export function usePlayback(session: TrackingSession | null, recording: Recording | null) {
  const { getOrCreateAudioContext, getPlayer } = useAudio()
  const [correct, setCorrectState] = useState(true)
  // Which recording is playing; comparing with the current one means a new take never inherits "playing".
  const [playingRecording, setPlayingRecording] = useState<Recording | null>(null)
  const isPlaying = playingRecording !== null && playingRecording === recording
  const [isProcessing, setIsProcessing] = useState(false)
  const buffers = useRef<{ raw?: AudioBuffer; corrected?: AudioBuffer; correctedFor?: readonly unknown[] }>({})

  useEffect(() => {
    buffers.current = {}
    const player = getPlayer()
    if (!player) return
    player.stop()
    player.onEnded = () => setPlayingRecording(null)
    return () => {
      player.onEnded = null
    }
  }, [recording, getPlayer])

  const getBuffer = useCallback(async (corrected: boolean): Promise<AudioBuffer | null> => {
    if (!recording) return null
    const key = corrected ? 'corrected' : 'raw'
    // The corrected take depends on the tracked notes, which are rebuilt if the tuning changes.
    const notes = session?.getNotes()
    if (corrected && buffers.current.correctedFor !== notes) buffers.current.corrected = undefined
    const cached = buffers.current[key]
    if (cached) return cached

    let samples = recording.samples
    if (corrected && session) {
      setIsProcessing(true)
      // Let React paint the processing state before the (synchronous) shift runs.
      await new Promise((resolve) => setTimeout(resolve, 20))
      const curve = buildDriftCurve(session.getNotes())
      samples = pitchShift(samples, recording.sampleRate, (t) => -driftAt(curve, t) * 100)
      setIsProcessing(false)
    }
    const ctx = getOrCreateAudioContext()
    const buffer = ctx.createBuffer(1, samples.length, recording.sampleRate)
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0)
    buffers.current[key] = buffer
    if (corrected) buffers.current.correctedFor = notes
    return buffer
  }, [recording, session, getOrCreateAudioContext])

  const play = useCallback(async (from = 0, useCorrection = correct) => {
    const buffer = await getBuffer(useCorrection)
    const player = getPlayer()
    if (!buffer || !player) return
    player.play(buffer, from >= buffer.duration - 0.05 ? 0 : from)
    setPlayingRecording(recording)
  }, [getBuffer, getPlayer, correct, recording])

  const stop = useCallback(() => {
    getPlayer()?.stop()
    setPlayingRecording(null)
  }, [getPlayer])

  /** Switching correction while playing continues from the same position with the other buffer. */
  const setCorrect = useCallback((value: boolean) => {
    setCorrectState(value)
    const position = getPlayer()?.getPosition()
    if (position != null) void play(position, value)
  }, [getPlayer, play])

  const getPosition = useCallback(() => getPlayer()?.getPosition() ?? null, [getPlayer])

  return { available: recording !== null, isPlaying, isProcessing, correct, setCorrect, play, stop, getPosition }
}
