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
  duration: number
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
