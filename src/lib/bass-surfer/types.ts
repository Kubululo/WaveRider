export interface TrackSegment {
  y: number
  centerX: number
  roll: number
  collectible: 'orb' | null
  collectibleLane: number
}

export interface TrackData {
  segments: TrackSegment[]
  totalLength: number
  // Total track length in seconds, INCLUDING the silent intro lead-in.
  duration: number
  // Seconds of silent lead-in track prepended before the audio begins.
  introDuration?: number
  // Per analysis frame: 0 = mids drive the section, 1 = highs (for debug/tuning)
  melodicDriver?: Uint8Array
}

export interface GameScore {
  score: number
  combo: number
  maxCombo: number
  multiplier: number
  collectiblesHit: number
  collectiblesTotal: number
}
