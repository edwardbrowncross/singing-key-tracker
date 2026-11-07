import { Macleod } from 'pitchfinder'

export interface PitchDetectorOptions {
  probabilityThreshold?: number
  bufferSize?: number
}

export interface PitchDetectorSnapshot {
  isRunning: boolean
  pitch: number | null
  /** RMS level of the latest buffer (0–1), for a simple mic meter. */
  level: number
}

const initialSnapshot: PitchDetectorSnapshot = { isRunning: false, pitch: null, level: 0 }

export class PitchDetector {
  private readonly ctx: AudioContext
  private readonly probabilityThreshold: number
  private readonly bufferSize: number

  private snapshot: PitchDetectorSnapshot = initialSnapshot
  private listeners = new Set<() => void>()

  private rafId = 0
  private stream: MediaStream | null = null
  private analyser: AnalyserNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  constructor(ctx: AudioContext, options: PitchDetectorOptions = {}) {
    this.ctx = ctx
    this.probabilityThreshold = options.probabilityThreshold ?? 0.3
    // 2048 samples covers at least two periods of a low bass note (~80 Hz) at 48 kHz
    this.bufferSize = options.bufferSize ?? 2048
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): PitchDetectorSnapshot => {
    return this.snapshot
  }

  /** The microphone source node while running, so other nodes (e.g. a recorder) can share it. */
  getSource(): MediaStreamAudioSourceNode | null {
    return this.source
  }

  async start(): Promise<void> {
    if (this.analyser) return

    const detectPitch = Macleod({
      sampleRate: this.ctx.sampleRate,
      bufferSize: this.bufferSize,
    })

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false },
    })
    const source = this.ctx.createMediaStreamSource(stream)
    const analyser = this.ctx.createAnalyser()
    analyser.fftSize = this.bufferSize
    source.connect(analyser)

    this.analyser = analyser
    this.source = source
    this.stream = stream
    this.setSnapshot({ isRunning: true, pitch: null, level: 0 })

    const buffer = new Float32Array(analyser.fftSize)

    const loop = () => {
      analyser.getFloatTimeDomainData(buffer)
      const result = detectPitch(buffer)

      let newPitch: number | null
      if (result.probability > this.probabilityThreshold && result.freq < 1e3 && result.freq > 20) {
        newPitch = result.freq
      } else {
        newPitch = null
      }

      let sumSquares = 0
      for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i] * buffer[i]
      const level = Math.sqrt(sumSquares / buffer.length)

      this.setSnapshot({ isRunning: true, pitch: newPitch, level })

      this.rafId = requestAnimationFrame(loop)
    }

    loop()
  }

  stop(): void {
    if (!this.analyser) return
    cancelAnimationFrame(this.rafId)
    this.stream?.getTracks().forEach((t) => t.stop())
    this.source?.disconnect()
    this.source = null
    this.stream = null
    this.analyser = null
    this.setSnapshot({ isRunning: false, pitch: null, level: 0 })
  }

  private setSnapshot(next: PitchDetectorSnapshot): void {
    this.snapshot = next
    for (const listener of this.listeners) {
      listener()
    }
  }
}
