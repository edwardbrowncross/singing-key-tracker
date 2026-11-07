import { RECORDER_WORKLET_NAME, RECORDER_WORKLET_SOURCE } from './recorderWorklet'

export interface Recording {
  samples: Float32Array
  sampleRate: number
}

/**
 * Captures raw mono PCM from a source node via an AudioWorklet. Recording can be
 * paused and resumed; paused audio is not captured, so sample index maps
 * directly to song time.
 */
export class AudioRecorder {
  private readonly ctx: AudioContext
  private node: AudioWorkletNode | null = null
  private sink: GainNode | null = null
  private chunks: Float32Array[] = []
  private moduleLoaded: Promise<void> | null = null
  private flushResolve: (() => void) | null = null

  constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  private loadModule(): Promise<void> {
    if (!this.moduleLoaded) {
      const url = URL.createObjectURL(new Blob([RECORDER_WORKLET_SOURCE], { type: 'application/javascript' }))
      this.moduleLoaded = this.ctx.audioWorklet.addModule(url).finally(() => URL.revokeObjectURL(url))
    }
    return this.moduleLoaded
  }

  /** Connects to `source` and starts capturing, discarding any previous recording. */
  async start(source: AudioNode): Promise<void> {
    this.dispose()
    await this.loadModule()
    const node = new AudioWorkletNode(this.ctx, RECORDER_WORKLET_NAME, { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 })
    node.port.onmessage = (event: MessageEvent<{ type: string; samples?: Float32Array }>) => {
      if (event.data.type === 'chunk' && event.data.samples) {
        this.chunks.push(event.data.samples)
      } else if (event.data.type === 'flushed') {
        this.flushResolve?.()
        this.flushResolve = null
      }
    }
    // The worklet must be pulled by the graph to run; route it to a silent sink.
    const sink = this.ctx.createGain()
    sink.gain.value = 0
    source.connect(node)
    node.connect(sink)
    sink.connect(this.ctx.destination)
    this.node = node
    this.sink = sink
    this.chunks = []
    this.setRecording(true)
  }

  setRecording(value: boolean): void {
    this.node?.port.postMessage({ type: 'record', value })
  }

  /** Stops capturing and returns everything recorded since `start`. */
  async stop(): Promise<Recording> {
    if (this.node) {
      this.setRecording(false)
      await new Promise<void>((resolve) => {
        this.flushResolve = resolve
        this.node!.port.postMessage({ type: 'flush' })
      })
    }
    const total = this.chunks.reduce((sum, c) => sum + c.length, 0)
    const samples = new Float32Array(total)
    let offset = 0
    for (const chunk of this.chunks) {
      samples.set(chunk, offset)
      offset += chunk.length
    }
    this.dispose()
    return { samples, sampleRate: this.ctx.sampleRate }
  }

  dispose(): void {
    this.node?.disconnect()
    this.sink?.disconnect()
    if (this.node) this.node.port.onmessage = null
    this.node = null
    this.sink = null
    this.chunks = []
  }
}
