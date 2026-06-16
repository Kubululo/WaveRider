import type { TrackData, TrackSegment } from './types'
import type { AudioAnalysis, AudioFrame } from '~/composables/useAudioAnalyzer.ts'

/**
 * --- GENERATOR CONFIGURATION ---
 * Adjust thresholds, intensities, and cooldown timings here.
 */
const GENERATOR_CONFIG = {
  // Base Settings
  MESH_FPS: 60,
  SEGMENT_DEPTH: 8,
  BASE_WIDTH: 30,

  // 1. Thresholds (0.0 to 1.0)
  THRESHOLDS: {
    BASS: 0.45,
    MID: 0.4,
    HIGH: 0.3,
  },

  // 2. Bump Height (World Units)
  // These are the "jumps" added ON TOP of the terrain when a beat hits
  INTENSITY: {
    BASS: 5,
    MID: 4,
    HIGH: 2,
  },

  // 3. Cooldowns (in Milliseconds)
  // Mid/high self-cooldowns are short so melodic sections (where bass is silent
  // and only mids/highs fire) don't get capped at ~1 bump per second.
  COOLDOWNS: {
    BASS_TRIGGER: {
      BLOCK_BASS: 300,
      BLOCK_MID: 800,
      BLOCK_HIGH: 300,
    },
    MID_TRIGGER: {
      BLOCK_BASS: 400,
      BLOCK_MID: 450,
      BLOCK_HIGH: 200,
    },
    HIGH_TRIGGER: {
      BLOCK_BASS: 400,
      BLOCK_MID: 500,
      BLOCK_HIGH: 450,
    },
  },

  // 4. Physics for the "Jump" effect
  GRAVITY: 0.85,
  // Reduced smoothing so we don't wash out the beat bumps,
  // since the terrain is already smooth math.
  SMOOTHING_PASSES: 1,

  // 5. Baseline terrain that follows overall loudness, so sections without
  // detected onsets gently roll instead of being dead flat.
  BASELINE: {
    HEIGHT: 2.0, // World units at full energy
    SMOOTHING: 0.05, // EMA factor per segment (~330ms time constant at 60fps)
  },

  // 6. Track curvature — Audiosurf-style sweeping turns, deliberately NOT
  // coupled to the audio: the bumps capture the music, the curves just make
  // the ride. Two slow sine waves with incommensurate periods produce varied,
  // progressive left/right arcs that ease in and out over ~10s. The heading
  // model keeps the turn rate physical, hard-capped at MAX_ANGLE_DEG, while a
  // spring pulls the road back toward center so it snakes instead of wandering.
  CURVE: {
    // Keep this <= 45: the offset integrates tan(heading), and tan explodes
    // past 45 (tan 80 = 5.7 -> ~170 units/s sideways). Worst-case target is
    // STEER_ANGLE * (1 + RETURN_SPRING), so 18 * 2.2 = ~40, safely under cap.
    MAX_ANGLE_DEG: 45, // Hard cap on heading deviation from straight ahead
    // How sharp the mid-curve gets. The steer EMAs and the spring ease the
    // entry and exit regardless, so raising this steepens the apex without
    // making transitions abrupt. Worst-case targets above MAX_ANGLE are
    // simply clamped by the cap.
    STEER_ANGLE_DEG: 30,
    MAX_OFFSET: 30, // World units the road center may drift from x = 0
    TURN_PERIOD_A_SEC: 13, // Primary sweep period (one full left-right cycle)
    TURN_PERIOD_B_SEC: 7.3, // Secondary period — incommensurate, so turns vary
    RESPONSE: 0.1, // How fast the heading chases the steering target
    // Must be > 1 so the spring can always cancel a full steer INSIDE the
    // offset bounds. At 0.6 a strong steer pinned the offset against the
    // MAX_OFFSET clamp, and riding that rail froze the lateral motion — the
    // road visibly snapped straight. With 1.2 the equilibrium offset is
    // MAX_OFFSET * steer / 1.2 (max 25), approached exponentially: curves
    // ease into their apex and ease back out, never touching the clamp.
    RETURN_SPRING: 1.2,
    WORLD_SPEED: 30, // Forward world units/sec — must match RetrowaveScene.animationSpeed
    // Superelevation: the road surface rolls into curves like a bullet train,
    // proportional to the current heading, easing in/out via the EMA.
    BANK_MAX_DEG: 6, // Maximum lean of the road surface
    // Heading fraction (of STEER_ANGLE) at which the bank saturates. The
    // spring system means heading peaks mid-transition at roughly half the
    // steer angle and decays to ~0 once a curve settles — normalizing by the
    // FULL steer angle made the bank nearly invisible.
    BANK_FULL_AT: 0.5,
    // Slow enough that the lean crosses zero over a wide neutral stretch at
    // curve direction changes — bumps landing there shouldn't tilt opposite ways
    BANK_SMOOTHING: 0.02, // EMA factor per segment (~800ms at 60fps)
  },

  // 7b. Collectible spacing — orbs are gated by their OWN minimum interval,
  // decoupled from the beat-jump cooldowns above. The terrain bumps still land
  // on every qualifying beat (so the track keeps tracking the music), but an orb
  // only spawns if at least this long has passed since the previous orb. Without
  // this, lowering BLOCK_MID/BLOCK_HIGH (or a busy highs-driven section, where
  // BLOCK_HIGH is already only 100ms) could stack orbs a few frames apart and
  // make them impossible to collect.
  COLLECTIBLE: {
    MIN_INTERVAL_MS: 500, // ≈ at most 2 orbs/sec, comfortably catchable
  },

  // 7. Melodic driver detection (mids vs highs)
  // Per section, the band with sustained higher flux activity "drives" the song
  // and gets trigger priority, so the track responds to what the listener
  // naturally focuses on. Hysteresis + hold time make the driver flip only at
  // sustained changes (natural section breaks), not on single fills.
  DRIVER: {
    WINDOW_SEC: 2.5, // Activity window compared between mids and highs
    SWITCH_RATIO: 1.3, // Challenger must out-activate the current driver by 30%
    MIN_HOLD_SEC: 4, // Minimum section length before the driver may flip again
    // Without these two gates, near-zero noise scores in quiet/sparse sections
    // pass the ratio test (anything > 0 beats 0 * ratio) and the driver flips
    // at metronome-regular MIN_HOLD intervals with no audible change.
    MIN_SCORE: 0.005, // Challenger must show real activity, not noise
    SUSTAIN_SEC: 1.5, // Challenger must dominate continuously this long to take over
  },
}

const DRIVER_MIDS = 0
const DRIVER_HIGHS = 1

/** FNV-1a string hash, for deterministic per-song curve variation */
function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/**
 * Content fingerprint of the song: FNV-1a over ~64 evenly spaced frame
 * energies (quantized to swallow float noise) plus the duration. The same
 * file always hashes the same regardless of its filename.
 */
function hashAnalysisContent(frames: AudioFrame[], duration: number): number {
  let h = 2166136261
  const mix = (v: number) => {
    h ^= v & 0xff
    h = Math.imul(h, 16777619)
    h ^= (v >>> 8) & 0xff
    h = Math.imul(h, 16777619)
  }
  const step = Math.max(1, Math.floor(frames.length / 64))
  for (let i = 0; i < frames.length; i += step) {
    mix(Math.round(frames[i].energy * 1e4))
  }
  mix(Math.round(duration * 1000))
  return h >>> 0
}

/** Mulberry32 — tiny seeded PRNG, returns values in [0, 1) */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Classifies every frame as mids-driven or highs-driven, with hysteresis so the
 * driver flips only at sustained changes. The window is centered, so the flip
 * lands right at a section break instead of lagging behind it.
 *
 * Dominance combines two windowed measures, multiplied:
 *  - trigger rate: how often the band's flux clears its own trigger threshold
 *  - amplitude: the band's RMS energy relative to its own song-wide peak
 * Flux alone is misleading here — it's locally normalized per band, so a quiet
 * but busy band (e.g. constant vocal mids) can out-sum the band you actually hear.
 */
function detectMelodicDriver(frames: AudioFrame[], fps: number): Uint8Array {
  const cfg = GENERATOR_CONFIG.DRIVER
  const n = frames.length
  const window = Math.max(1, Math.round(cfg.WINDOW_SEC * fps))
  const halfBack = Math.floor(window / 2)
  const halfFwd = Math.ceil(window / 2)
  const result = new Uint8Array(n)

  // Prefix sums for O(1) windowed averages
  const prefMidsTrig = new Float64Array(n + 1)
  const prefHighsTrig = new Float64Array(n + 1)
  const prefMidsEnergy = new Float64Array(n + 1)
  const prefHighsEnergy = new Float64Array(n + 1)
  let maxMidsEnergy = 0
  let maxHighsEnergy = 0
  for (let i = 0; i < n; i++) {
    const f = frames[i]
    prefMidsTrig[i + 1] =
      prefMidsTrig[i] + (f.spectralFluxMids > GENERATOR_CONFIG.THRESHOLDS.MID ? 1 : 0)
    prefHighsTrig[i + 1] =
      prefHighsTrig[i] + (f.spectralFluxHighs > GENERATOR_CONFIG.THRESHOLDS.HIGH ? 1 : 0)
    prefMidsEnergy[i + 1] = prefMidsEnergy[i] + f.mids
    prefHighsEnergy[i + 1] = prefHighsEnergy[i] + f.highs
    if (f.mids > maxMidsEnergy) maxMidsEnergy = f.mids
    if (f.highs > maxHighsEnergy) maxHighsEnergy = f.highs
  }

  const score = (
    prefTrig: Float64Array,
    prefEnergy: Float64Array,
    maxEnergy: number,
    i: number
  ) => {
    const start = Math.max(0, i - halfBack)
    const end = Math.min(n, i + halfFwd)
    const len = end - start
    const triggerRate = (prefTrig[end] - prefTrig[start]) / len
    const amplitude = maxEnergy > 0 ? (prefEnergy[end] - prefEnergy[start]) / len / maxEnergy : 0
    return triggerRate * amplitude
  }

  const midsScore = (i: number) => score(prefMidsTrig, prefMidsEnergy, maxMidsEnergy, i)
  const highsScore = (i: number) => score(prefHighsTrig, prefHighsEnergy, maxHighsEnergy, i)

  let driver = highsScore(0) > midsScore(0) ? DRIVER_HIGHS : DRIVER_MIDS
  let lastSwitch = -Infinity
  let challengeStreak = 0
  const minHold = Math.round(cfg.MIN_HOLD_SEC * fps)
  const sustainFrames = Math.round(cfg.SUSTAIN_SEC * fps)

  for (let i = 0; i < n; i++) {
    const mids = midsScore(i)
    const highs = highsScore(i)
    const challenger = driver === DRIVER_MIDS ? highs : mids
    const current = driver === DRIVER_MIDS ? mids : highs

    const dominates = challenger > cfg.MIN_SCORE && challenger > current * cfg.SWITCH_RATIO
    challengeStreak = dominates ? challengeStreak + 1 : 0

    if (challengeStreak >= sustainFrames && i - lastSwitch >= minHold) {
      driver = driver === DRIVER_MIDS ? DRIVER_HIGHS : DRIVER_MIDS
      lastSwitch = i
      challengeStreak = 0
    }
    result[i] = driver
  }
  return result
}

export function generateTrack(analysis: AudioAnalysis, variationSeed?: string): TrackData {
  const { frames, duration } = analysis

  if (!frames || !frames.length) {
    return { segments: [], totalLength: 0, duration: 0 }
  }

  const segments: TrackSegment[] = []
  const totalSegments = Math.floor(duration * GENERATOR_CONFIG.MESH_FPS)

  // -- PHYSICS STATE (For the Beat Jumps) --
  let currentJumpY = 0

  // -- BASELINE TERRAIN STATE --
  let baselineY = 0
  let maxEnergy = 0
  for (const f of frames) {
    if (f.energy > maxEnergy) maxEnergy = f.energy
  }

  // -- COOLDOWN STATE --
  let nextAllowedBass = 0
  let nextAllowedMid = 0
  let nextAllowedHigh = 0

  // -- COLLECTIBLE SPACING STATE (independent of the beat cooldowns) --
  let nextAllowedCollectible = 0

  // -- BANKING STATE --
  let currentBanking = 0

  // -- CURVATURE STATE --
  const maxHeadingRad = (GENERATOR_CONFIG.CURVE.MAX_ANGLE_DEG * Math.PI) / 180
  const steerHeadingRad = (GENERATOR_CONFIG.CURVE.STEER_ANGLE_DEG * Math.PI) / 180
  const maxBankRad = (GENERATOR_CONFIG.CURVE.BANK_MAX_DEG * Math.PI) / 180
  const worldPerSegment = GENERATOR_CONFIG.CURVE.WORLD_SPEED / GENERATOR_CONFIG.MESH_FPS
  let heading = 0
  let currentCenterX = 0

  // Per-song curve variation: phases and period jitter come from a PRNG
  // seeded by a fingerprint of the song's CONTENT (not its filename), so the
  // same file always rides the same road no matter what it's called, while
  // different songs get different roads. The steering itself stays a pure
  // function of time — the seed picks the road, the music never steers it.
  const seed =
    variationSeed != null ? hashString(variationSeed) : hashAnalysisContent(frames, duration)
  const rand = mulberry32(seed)
  const phaseA = rand() * Math.PI * 2
  const phaseB = rand() * Math.PI * 2
  const periodA = GENERATOR_CONFIG.CURVE.TURN_PERIOD_A_SEC * (0.85 + rand() * 0.3)
  const periodB = GENERATOR_CONFIG.CURVE.TURN_PERIOD_B_SEC * (0.85 + rand() * 0.3)

  // -- MELODIC DRIVER (mids vs highs, per section) --
  const melodicDriver = detectMelodicDriver(frames, GENERATOR_CONFIG.MESH_FPS)

  const framesPerSegment = frames.length / totalSegments

  for (let i = 0; i < totalSegments; i++) {
    // Flux onsets are single-frame spikes; sampling one frame per segment can
    // skip frames entirely due to rounding. Take the max over the segment's range.
    const frameStart = Math.min(Math.floor(i * framesPerSegment), frames.length - 1)
    const frameEnd = Math.min(
      Math.max(frameStart + 1, Math.floor((i + 1) * framesPerSegment)),
      frames.length
    )

    let fluxBass = 0
    let fluxMids = 0
    let fluxHighs = 0
    for (let f = frameStart; f < frameEnd; f++) {
      if (frames[f].spectralFluxBass > fluxBass) fluxBass = frames[f].spectralFluxBass
      if (frames[f].spectralFluxMids > fluxMids) fluxMids = frames[f].spectralFluxMids
      if (frames[f].spectralFluxHighs > fluxHighs) fluxHighs = frames[f].spectralFluxHighs
    }

    const frame = frames[frameStart]

    const currentTimeMs = (i / GENERATOR_CONFIG.MESH_FPS) * 1000

    let targetJump = 0
    let spawnCollectible = false

    // ---------------------------------------------------------
    // 1. AUDIO ANALYSIS (DETERMINE BEAT JUMPS)
    // ---------------------------------------------------------
    // Priority chain: bass wins (punch-gated in the analyzer), then whichever
    // melodic band drives the current section, then the other. Each band only
    // has to beat its OWN threshold. (Requiring a band to also be the global
    // max meant a sub-threshold bass flux could starve valid mid/high hits.)

    const highsDrive = melodicDriver[frameStart] === DRIVER_HIGHS
    const canMid = fluxMids > GENERATOR_CONFIG.THRESHOLDS.MID && currentTimeMs >= nextAllowedMid
    const canHigh = fluxHighs > GENERATOR_CONFIG.THRESHOLDS.HIGH && currentTimeMs >= nextAllowedHigh

    // A. CHECK BASS
    if (fluxBass > GENERATOR_CONFIG.THRESHOLDS.BASS && currentTimeMs >= nextAllowedBass) {
      targetJump = fluxBass * GENERATOR_CONFIG.INTENSITY.BASS

      nextAllowedBass = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.BASS_TRIGGER.BLOCK_BASS
      nextAllowedMid = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.BASS_TRIGGER.BLOCK_MID
      nextAllowedHigh = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.BASS_TRIGGER.BLOCK_HIGH
    }

    // B. CHECK MID (Potential Collectible) — yields to highs when highs drive the section
    else if (canMid && (!highsDrive || !canHigh)) {
      targetJump = fluxMids * GENERATOR_CONFIG.INTENSITY.MID
      spawnCollectible = true

      nextAllowedBass = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.MID_TRIGGER.BLOCK_BASS
      nextAllowedMid = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.MID_TRIGGER.BLOCK_MID
      nextAllowedHigh = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.MID_TRIGGER.BLOCK_HIGH
    }

    // C. CHECK HIGH (Potential Collectible)
    else if (canHigh) {
      targetJump = fluxHighs * GENERATOR_CONFIG.INTENSITY.HIGH
      spawnCollectible = true

      nextAllowedBass = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.HIGH_TRIGGER.BLOCK_BASS
      nextAllowedMid = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.HIGH_TRIGGER.BLOCK_MID
      nextAllowedHigh = currentTimeMs + GENERATOR_CONFIG.COOLDOWNS.HIGH_TRIGGER.BLOCK_HIGH
    }

    // Gate collectibles by their own minimum interval, separate from the beat
    // cooldowns: the bump above still happens on the beat, but the orb is only
    // kept if enough time has passed since the last one — otherwise orbs could
    // stack a few frames apart when the mid/high block times are tuned low.
    if (spawnCollectible) {
      if (currentTimeMs < nextAllowedCollectible) {
        spawnCollectible = false
      } else {
        nextAllowedCollectible = currentTimeMs + GENERATOR_CONFIG.COLLECTIBLE.MIN_INTERVAL_MS
      }
    }

    // Apply Gravity to the "Jump" value
    currentJumpY *= GENERATOR_CONFIG.GRAVITY
    currentJumpY = Math.max(currentJumpY, targetJump)

    // ---------------------------------------------------------
    // 2. BASELINE TERRAIN (Follows overall loudness via EMA)
    // ---------------------------------------------------------
    const energyNorm = maxEnergy > 0 ? frame.energy / maxEnergy : 0
    baselineY +=
      (energyNorm * GENERATOR_CONFIG.BASELINE.HEIGHT - baselineY) *
      GENERATOR_CONFIG.BASELINE.SMOOTHING

    // ---------------------------------------------------------
    // 3. CURVATURE (autonomous sweeping turns, decoupled from the audio)
    // ---------------------------------------------------------
    const curve = GENERATOR_CONFIG.CURVE
    const tSec = i / GENERATOR_CONFIG.MESH_FPS
    const steer = Math.max(
      -1,
      Math.min(
        1,
        0.65 * Math.sin((2 * Math.PI * tSec) / periodA + phaseA) +
          0.45 * Math.sin((2 * Math.PI * tSec) / periodB + phaseB)
      )
    )

    // Steering target plus a spring back to center so the offset stays bounded.
    // Steering authority is STEER_ANGLE; the MAX_ANGLE cap only bounds the sum.
    let targetHeading =
      steer * steerHeadingRad -
      (currentCenterX / curve.MAX_OFFSET) * steerHeadingRad * curve.RETURN_SPRING
    targetHeading = Math.max(-maxHeadingRad, Math.min(maxHeadingRad, targetHeading))

    heading += (targetHeading - heading) * curve.RESPONSE
    heading = Math.max(-maxHeadingRad, Math.min(maxHeadingRad, heading))

    currentCenterX += Math.tan(heading) * worldPerSegment
    currentCenterX = Math.max(-curve.MAX_OFFSET, Math.min(curve.MAX_OFFSET, currentCenterX))

    // Bank into the curve (superelevation): proportional to heading, eased by
    // EMA so the road rolls in and out of the lean like a train on a transition
    const bankNorm = heading / (steerHeadingRad * curve.BANK_FULL_AT)
    const targetBank = Math.max(-1, Math.min(1, bankNorm)) * maxBankRad
    currentBanking += (targetBank - currentBanking) * curve.BANK_SMOOTHING

    // ---------------------------------------------------------
    // 4. COMBINE AND OUTPUT
    // ---------------------------------------------------------

    // Final Y is the Terrain Height + The Audio Beat Jump Height
    const finalY = baselineY + currentJumpY

    segments.push({
      y: finalY,
      centerX: currentCenterX,
      // Stored as the bank slope (tan of the angle) so consumers can apply
      // it as a direct y-per-lateral-unit tilt
      roll: Math.tan(currentBanking),
      collectible: spawnCollectible ? 'orb' : null,
      collectibleLane: (i % 3) - 1, // Simple oscillating lane -1, 0, 1
    })
  }

  if (GENERATOR_CONFIG.SMOOTHING_PASSES > 0) {
    applySmoothing(segments, GENERATOR_CONFIG.SMOOTHING_PASSES)
  }

  return {
    segments,
    totalLength: segments.length * GENERATOR_CONFIG.SEGMENT_DEPTH,
    duration,
    melodicDriver,
  }
}

/**
 * Simple averaging to smooth out the physical geometry
 */
function applySmoothing(segments: TrackSegment[], passes: number) {
  for (let p = 0; p < passes; p++) {
    // Start at 1 and end at length-2 to avoid boundary errors
    for (let i = 1; i < segments.length - 1; i++) {
      // 1. Smooth Y (Elevation)
      const prevY = segments[i - 1].y
      const currY = segments[i].y
      const nextY = segments[i + 1].y
      segments[i].y = (prevY + currY + nextY) / 3

      // 2. Smooth Roll (Banking)
      const prevR = segments[i - 1].roll || 0
      const currR = segments[i].roll || 0
      const nextR = segments[i + 1].roll || 0
      segments[i].roll = (prevR + currR + nextR) / 3

      // 3. Smooth CenterX (Curves)
      const prevX = segments[i - 1].centerX
      const currX = segments[i].centerX
      const nextX = segments[i + 1].centerX
      segments[i].centerX = (prevX + currX + nextX) / 3
    }
  }
}
