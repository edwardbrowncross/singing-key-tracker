import type { Mode, Tuning } from '../types'

export interface GridDegree {
  /** Offset from the tonic in (fractional) semitones. */
  semitones: number
  /** How strongly this degree belongs to the key: 1 = diatonic, lower = chromatic. */
  weight: number
  /**
   * Relative width of the region of pitch that snaps to this degree. Accidentals get
   * narrower regions, so between a scale tone and a neighbouring accidental the
   * boundary sits 60:40 in favour of the scale tone rather than halfway.
   */
  hitWidth: number
}

export type TuningGrid = readonly GridDegree[]

/** 5-limit just ratios for each chromatic degree above the tonic. */
const JUST_RATIOS = [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8]

export const IN_KEY_WEIGHT = 1
export const ALTERED_WEIGHT = 0.6
export const CHROMATIC_WEIGHT = 0.3

/** Hit widths by membership. 2/3 puts a scale tone / accidental boundary at 60:40. */
const HIT_WIDTHS: Record<number, number> = {
  [IN_KEY_WEIGHT]: 1,
  [ALTERED_WEIGHT]: 0.8,
  [CHROMATIC_WEIGHT]: 2 / 3,
}

/** Per-degree key membership weights for each mode. */
const DEGREE_WEIGHTS: Record<Mode, readonly number[]> = {
  //       1  b2   2  b3   3   4  #4   5  b6   6  b7   7
  major: [1, CHROMATIC_WEIGHT, 1, CHROMATIC_WEIGHT, 1, 1, CHROMATIC_WEIGHT, 1, CHROMATIC_WEIGHT, 1, CHROMATIC_WEIGHT, 1],
  // natural minor is diatonic; raised 6th and 7th (melodic/harmonic minor) are common alterations
  minor: [1, CHROMATIC_WEIGHT, 1, 1, CHROMATIC_WEIGHT, 1, CHROMATIC_WEIGHT, 1, 1, ALTERED_WEIGHT, 1, ALTERED_WEIGHT],
}

export function getTuningGrid(tuning: Tuning, mode: Mode): TuningGrid {
  return DEGREE_WEIGHTS[mode].map((weight, degree) => ({
    semitones: tuning === 'equal' ? degree : 12 * Math.log2(JUST_RATIOS[degree]),
    weight,
    hitWidth: HIT_WIDTHS[weight],
  }))
}

export interface DegreeMatch {
  /** Chromatic degree index 0–11 relative to the tonic. */
  degree: number
  /** Target pitch relative to the tonic (unwrapped, includes octave). */
  target: number
  /** Signed distance from the target in cents (positive = sharp). */
  offsetCents: number
  weight: number
}

/**
 * Finds the grid degree nearest to `relative` (a pitch in semitones relative to
 * the tonic, any octave) and returns the signed offset from it. Distance is
 * scaled by each degree's `hitWidth`, so accidentals only claim pitches that
 * are clearly closer to them (e.g. 50¢ flat of a scale tone still counts as
 * that scale tone).
 */
export function nearestDegree(relative: number, grid: TuningGrid): DegreeMatch {
  const octaveBase = Math.floor(relative / 12) * 12
  let best: DegreeMatch | null = null
  let bestScore = Infinity
  for (const octave of [octaveBase - 12, octaveBase, octaveBase + 12]) {
    for (let degree = 0; degree < grid.length; degree++) {
      const target = octave + grid[degree].semitones
      const offsetCents = (relative - target) * 100
      const score = Math.abs(offsetCents) / grid[degree].hitWidth
      if (best === null || score < bestScore) {
        best = { degree, target, offsetCents, weight: grid[degree].weight }
        bestScore = score
      }
    }
  }
  return best!
}
