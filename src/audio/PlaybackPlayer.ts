/**
 * Plays an AudioBuffer from a given position and reports the current play
 * position (seconds into the buffer) for the timeline cursor.
 */
export class PlaybackPlayer {
  private readonly ctx: AudioContext
  private source: AudioBufferSourceNode | null = null
  private startedAtCtx = 0
  private offset = 0
  onEnded: (() => void) | null = null

  constructor(ctx: AudioContext) {
    this.ctx = ctx
  }

  get isPlaying(): boolean {
    return this.source !== null
  }

  play(buffer: AudioBuffer, from = 0): void {
    this.stop()
    const source = this.ctx.createBufferSource()
    source.buffer = buffer
    source.connect(this.ctx.destination)
    source.onended = () => {
      if (this.source !== source) return
      this.source = null
      this.onEnded?.()
    }
    const offset = Math.min(Math.max(0, from), buffer.duration)
    source.start(0, offset)
    this.source = source
    this.offset = offset
    this.startedAtCtx = this.ctx.currentTime
  }

  stop(): void {
    const source = this.source
    this.source = null
    if (source) {
      source.onended = null
      source.stop()
      source.disconnect()
    }
  }

  /** Seconds into the buffer, or null when not playing. */
  getPosition(): number | null {
    if (!this.source) return null
    return this.offset + this.ctx.currentTime - this.startedAtCtx
  }
}
