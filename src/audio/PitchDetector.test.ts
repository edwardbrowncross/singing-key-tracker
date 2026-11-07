import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { PitchDetector } from './PitchDetector'

let mockDetectPitch: (buf: Float32Array) => { freq: number; probability: number }

vi.mock('pitchfinder', () => ({
  Macleod: () => (buf: Float32Array) => mockDetectPitch(buf),
}))

function createMockTrack() {
  return { stop: vi.fn() }
}

function createMockStream(tracks = [createMockTrack()]) {
  return { getTracks: () => tracks } as unknown as MediaStream
}

function createMockAnalyser() {
  return {
    fftSize: 0,
    connect: vi.fn(),
    getFloatTimeDomainData: vi.fn(),
  }
}

function createMockAudioContext(analyser: ReturnType<typeof createMockAnalyser>) {
  return {
    sampleRate: 44100,
    state: 'running' as AudioContextState,
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createAnalyser: vi.fn(() => analyser),
    destination: {},
  } as unknown as AudioContext
}

let rafCallbacks: Array<FrameRequestCallback> = []
let rafIdCounter = 1

function setupGlobalMocks(mockStream: MediaStream) {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb)
    return rafIdCounter++
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  vi.stubGlobal('navigator', {
    mediaDevices: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream),
    },
  })
}

function flushRafCallbacks(count = 1) {
  for (let i = 0; i < count; i++) {
    const cb = rafCallbacks.shift()
    cb?.(performance.now())
  }
}

describe('PitchDetector', () => {
  let analyser: ReturnType<typeof createMockAnalyser>
  let mockStream: MediaStream
  let mockTrack: ReturnType<typeof createMockTrack>
  let mockAudioCtx: AudioContext

  beforeEach(() => {
    rafCallbacks = []
    rafIdCounter = 1
    mockDetectPitch = () => ({ freq: 440, probability: 0.95 })
    analyser = createMockAnalyser()
    mockTrack = createMockTrack()
    mockStream = createMockStream([mockTrack])
    mockAudioCtx = createMockAudioContext(analyser)
    setupGlobalMocks(mockStream)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts with isRunning false and pitch null', () => {
    const detector = new PitchDetector(mockAudioCtx)
    const snap = detector.getSnapshot()
    expect(snap.isRunning).toBe(false)
    expect(snap.pitch).toBeNull()
  })

  it('sets isRunning to true after start', async () => {
    const detector = new PitchDetector(mockAudioCtx)
    await detector.start()
    expect(detector.getSnapshot().isRunning).toBe(true)
  })

  it('sets isRunning to false after stop', async () => {
    const detector = new PitchDetector(mockAudioCtx)
    await detector.start()
    detector.stop()
    expect(detector.getSnapshot().isRunning).toBe(false)
  })

  it('stops media tracks on stop', async () => {
    const detector = new PitchDetector(mockAudioCtx)
    await detector.start()
    detector.stop()
    expect(mockTrack.stop).toHaveBeenCalled()
  })

  it('is idempotent — calling start twice does not create a second analyser', async () => {
    const detector = new PitchDetector(mockAudioCtx)
    await detector.start()
    await detector.start()
    expect(mockAudioCtx.createAnalyser).toHaveBeenCalledTimes(1)
  })

  it('is idempotent — calling stop twice does not notify subscribers again', async () => {
    const detector = new PitchDetector(mockAudioCtx)
    await detector.start()

    const listener = vi.fn()
    detector.subscribe(listener)

    detector.stop()
    const callsAfterFirstStop = listener.mock.calls.length

    detector.stop()
    expect(listener).toHaveBeenCalledTimes(callsAfterFirstStop)
  })

  it('detects pitch from valid results', async () => {
    mockDetectPitch = () => ({ freq: 440, probability: 0.95 })
    const detector = new PitchDetector(mockAudioCtx)
    await detector.start()
    flushRafCallbacks(1)
    expect(detector.getSnapshot().pitch).toBe(440)
  })

  it('sets pitch to null when probability is below threshold', async () => {
    mockDetectPitch = () => ({ freq: 440, probability: 0.1 })
    const detector = new PitchDetector(mockAudioCtx, { probabilityThreshold: 0.3 })
    await detector.start()
    flushRafCallbacks(1)
    expect(detector.getSnapshot().pitch).toBeNull()
  })

  it('rejects frequencies outside the 20-1000 Hz range', async () => {
    mockDetectPitch = () => ({ freq: 5000, probability: 0.95 })
    const detector = new PitchDetector(mockAudioCtx)
    await detector.start()
    flushRafCallbacks(1)
    expect(detector.getSnapshot().pitch).toBeNull()
  })

  it('requests microphone with echo cancellation disabled', async () => {
    const detector = new PitchDetector(mockAudioCtx)
    await detector.start()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
      audio: expect.objectContaining({ echoCancellation: false }),
    })
  })

  it('notifies subscribers on snapshot change', async () => {
    const detector = new PitchDetector(mockAudioCtx)
    const listener = vi.fn()
    detector.subscribe(listener)

    await detector.start()
    // start() triggers a snapshot change (isRunning: true)
    expect(listener).toHaveBeenCalled()
  })

  it('unsubscribe removes listener', async () => {
    const detector = new PitchDetector(mockAudioCtx)
    const listener = vi.fn()
    const unsub = detector.subscribe(listener)
    unsub()

    await detector.start()
    expect(listener).not.toHaveBeenCalled()
  })

  it('notifies every frame even when pitch stays the same', async () => {
    mockDetectPitch = () => ({ freq: 440, probability: 0.95 })
    const detector = new PitchDetector(mockAudioCtx)

    const listener = vi.fn()
    detector.subscribe(listener)

    await detector.start()
    const callsAfterStart = listener.mock.calls.length

    flushRafCallbacks(3)
    expect(listener).toHaveBeenCalledTimes(callsAfterStart + 3)
  })
})
