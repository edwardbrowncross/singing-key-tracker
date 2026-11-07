export interface PitchShiftOptions {
  /** Grain length in seconds. */
  grainSeconds?: number
  /** How far (± seconds) each grain may move to line up with the previous one. */
  searchSeconds?: number
}

/**
 * Offline pitch shifter with a time-varying shift and unchanged duration. It is
 * a plain frequency-ratio shift (no formant correction).
 *
 * Each output grain (Hann-windowed, 50% overlap) is read from the input
 * resampled by the ratio 2^(cents/1200), centred on the same song time. To avoid
 * the phasey comb-filtering of a naive overlap-add, each grain's start is
 * nudged within ±searchSeconds to the position whose waveform best matches the
 * natural continuation of the previous grain (WSOLA-style alignment).
 *
 * @param centsAt shift in cents at a given time in seconds (positive = up)
 */
export function pitchShift(
  input: Float32Array,
  sampleRate: number,
  centsAt: (timeSeconds: number) => number,
  options: PitchShiftOptions = {},
): Float32Array {
  const length = input.length
  const output = new Float32Array(length)
  if (length === 0) return output

  const hop = Math.max(16, Math.round(((options.grainSeconds ?? 0.04) * sampleRate) / 2))
  const grain = hop * 2
  const search = Math.round((options.searchSeconds ?? 0.0125) * sampleRate)

  // Periodic Hann window: overlapping copies at 50% hop sum exactly to 1.
  const window = new Float32Array(grain)
  for (let j = 0; j < grain; j++) window[j] = 0.5 - 0.5 * Math.cos((2 * Math.PI * j) / grain)

  const read = (pos: number): number => {
    const i = Math.floor(pos)
    if (i < 0 || i >= length - 1) return i === length - 1 ? input[i] : 0
    const frac = pos - i
    return input[i] + frac * (input[i + 1] - input[i])
  }
  const readNearest = (pos: number): number => {
    const i = Math.round(pos)
    return i >= 0 && i < length ? input[i] : 0
  }

  const target = new Float32Array(hop)

  /** Normalised correlation between `target` and the input read from `start` at `ratio`. */
  const correlation = (start: number, ratio: number, step: number): number => {
    let dot = 0
    let energy = 0
    for (let j = 0; j < hop; j += step) {
      const v = readNearest(start + j * ratio)
      dot += v * target[j]
      energy += v * v
    }
    return energy > 0 ? dot / Math.sqrt(energy) : 0
  }

  let prevStart = 0
  let prevRatio = 1
  let first = true

  for (let outStart = -hop; outStart < length; outStart += hop) {
    const centre = outStart + hop
    const ratio = 2 ** (centsAt(centre / sampleRate) / 1200)
    const nominal = centre - ratio * hop
    let start = nominal

    if (!first) {
      // What the previous grain would have continued with over the overlap region.
      const natural = prevStart + hop * prevRatio
      let targetEnergy = 0
      for (let j = 0; j < hop; j++) {
        target[j] = read(natural + j * prevRatio)
        targetEnergy += target[j] * target[j]
      }
      if (targetEnergy > 1e-9) {
        let bestOffset = 0
        let bestScore = correlation(nominal, ratio, 8)
        for (let d = -search; d <= search; d += 4) {
          const score = correlation(nominal + d, ratio, 8)
          if (score > bestScore) {
            bestScore = score
            bestOffset = d
          }
        }
        const coarse = bestOffset
        bestScore = correlation(nominal + coarse, ratio, 2)
        for (let d = coarse - 3; d <= coarse + 3; d++) {
          const score = correlation(nominal + d, ratio, 2)
          if (score > bestScore) {
            bestScore = score
            bestOffset = d
          }
        }
        start = nominal + bestOffset
      }
    }

    for (let j = 0; j < grain; j++) {
      const o = outStart + j
      if (o < 0 || o >= length) continue
      output[o] += window[j] * read(start + j * ratio)
    }

    prevStart = start
    prevRatio = ratio
    first = false
  }

  return output
}
