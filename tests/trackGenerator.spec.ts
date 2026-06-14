import { describe, it, expect } from 'vitest'
import { generateTrack } from '../src/lib/bass-surfer/trackGenerator'
import type { AudioAnalysis, AudioFrame } from '../src/composables/useAudioAnalyzer'

function makeFrame(i: number, overrides: Partial<AudioFrame> = {}): AudioFrame {
  return {
    time: i / 60,
    energy: 0.5,
    subBass: 0.3,
    mids: 0.3,
    highs: 0.3,
    spectralFlux: 0.2,
    spectralFluxBass: 0.2,
    spectralFluxMids: 0.2,
    spectralFluxHighs: 0.2,
    ...overrides,
  }
}

function makeAnalysis(frameCount: number, duration: number): AudioAnalysis {
  return {
    buffer: {} as AudioBuffer,
    duration,
    frames: Array.from({ length: frameCount }, (_, i) => makeFrame(i)),
  }
}

describe('generateTrack', () => {
  it('returns an empty track when given no frames', () => {
    const result = generateTrack({ buffer: {} as AudioBuffer, duration: 0, frames: [] })
    expect(result.segments).toHaveLength(0)
    expect(result.totalLength).toBe(0)
    expect(result.duration).toBe(0)
  })

  it('returns segments with the correct TrackSegment shape', () => {
    const result = generateTrack(makeAnalysis(120, 2))
    expect(result.segments.length).toBeGreaterThan(0)
    for (const seg of result.segments) {
      expect(typeof seg.y).toBe('number')
      expect(typeof seg.centerX).toBe('number')
      expect(typeof seg.roll).toBe('number')
      expect(seg.collectible === null || seg.collectible === 'orb').toBe(true)
      expect([-1, 0, 1]).toContain(seg.collectibleLane)
    }
  })

  it('segment count equals floor(duration × 60)', () => {
    // MESH_FPS is 60 in GENERATOR_CONFIG
    const result = generateTrack(makeAnalysis(300, 5))
    expect(result.segments.length).toBe(Math.floor(5 * 60))
  })

  it('totalLength equals segments.length × 8 (SEGMENT_DEPTH)', () => {
    const result = generateTrack(makeAnalysis(120, 2))
    expect(result.totalLength).toBe(result.segments.length * 8)
  })

  it('produces identical output for repeated calls on the same input (determinism)', () => {
    const analysis = makeAnalysis(180, 3)
    const r1 = generateTrack(analysis)
    const r2 = generateTrack(analysis)
    expect(r1.segments.map((s) => s.y)).toEqual(r2.segments.map((s) => s.y))
    expect(r1.segments.map((s) => s.centerX)).toEqual(r2.segments.map((s) => s.centerX))
  })

  it('produces different curve paths for different variationSeeds', () => {
    const analysis = makeAnalysis(360, 6)
    const r1 = generateTrack(analysis, 'song-a')
    const r2 = generateTrack(analysis, 'song-b')
    expect(r1.segments.map((s) => s.centerX)).not.toEqual(r2.segments.map((s) => s.centerX))
  })

  it('keeps road centerX within MAX_OFFSET bounds (30 + smoothing tolerance)', () => {
    // GENERATOR_CONFIG.CURVE.MAX_OFFSET = 30; smoothing is applied afterwards so allow 31
    const result = generateTrack(makeAnalysis(3600, 60))
    for (const seg of result.segments) {
      expect(Math.abs(seg.centerX)).toBeLessThanOrEqual(31)
    }
  })

  it('generates non-zero elevation when a strong bass hit is present', () => {
    const frames = Array.from({ length: 120 }, (_, i) => makeFrame(i, { spectralFluxBass: 0 }))
    frames[30] = makeFrame(30, { spectralFluxBass: 1.0 })
    const result = generateTrack({ buffer: {} as AudioBuffer, duration: 2, frames })
    const maxY = Math.max(...result.segments.map((s) => s.y))
    expect(maxY).toBeGreaterThan(0)
  })

  it('exposes a melodicDriver array with length > 0', () => {
    const result = generateTrack(makeAnalysis(120, 2))
    expect(result.melodicDriver).toBeDefined()
    expect(result.melodicDriver!.length).toBeGreaterThan(0)
  })

  it('all y values are finite numbers', () => {
    const result = generateTrack(makeAnalysis(360, 6))
    for (const seg of result.segments) {
      expect(Number.isFinite(seg.y)).toBe(true)
    }
  })

  it('all roll values are finite numbers', () => {
    const result = generateTrack(makeAnalysis(360, 6))
    for (const seg of result.segments) {
      expect(Number.isFinite(seg.roll)).toBe(true)
    }
  })
})
