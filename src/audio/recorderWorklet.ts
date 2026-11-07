/**
 * Source of the AudioWorklet processor used by `AudioRecorder`. Kept as a plain
 * JS string (loaded through a Blob URL) so it needs no separate bundling step
 * or AudioWorkletGlobalScope typings.
 *
 * Messages in:  { type: 'record', value: boolean } | { type: 'flush' }
 * Messages out: { type: 'chunk', samples: Float32Array } | { type: 'flushed' }
 */
export const RECORDER_WORKLET_NAME = 'singing-key-tracker-recorder'

export const RECORDER_WORKLET_SOURCE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this.recording = false
    this.chunk = new Float32Array(8192)
    this.length = 0
    this.port.onmessage = (event) => {
      const msg = event.data
      if (msg.type === 'record') {
        this.recording = msg.value
      } else if (msg.type === 'flush') {
        this.sendChunk()
        this.port.postMessage({ type: 'flushed' })
      }
    }
  }

  sendChunk() {
    if (this.length === 0) return
    const samples = this.chunk.slice(0, this.length)
    this.port.postMessage({ type: 'chunk', samples }, [samples.buffer])
    this.length = 0
  }

  process(inputs) {
    const input = inputs[0]
    if (!this.recording || !input || input.length === 0) return true
    const channel = input[0]
    for (let i = 0; i < channel.length; i++) {
      this.chunk[this.length++] = channel[i]
      if (this.length === this.chunk.length) this.sendChunk()
    }
    return true
  }
}
registerProcessor('${RECORDER_WORKLET_NAME}', RecorderProcessor)
`
