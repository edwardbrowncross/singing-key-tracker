export type Tuning = 'equal' | 'just'

export type Mode = 'major' | 'minor'

/** A key, as a tonic pitch class (0 = C … 11 = B) plus mode. */
export interface KeySpec {
  tonic: number
  mode: Mode
}

export interface SessionSettings {
  key: KeySpec
  tuning: Tuning
}
