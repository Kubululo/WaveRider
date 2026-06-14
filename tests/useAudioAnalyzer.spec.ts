import { describe, it, expect, vi, afterEach } from 'vitest'
import { useAudioAnalyzer } from '../src/composables/useAudioAnalyzer'

// --- Mock factory ---

const SAMPLE_RATE = 44100
const DURATION = 1
const SAMPLES = SAMPLE_RATE * DURATION

/**
 * Installs global mocks for AudioContext and OfflineAudioContext.
 * Returns the inner mock objects for assertion use.
 */
function mockWebAudio() {
  // All four rendered channels return a flat 0.05 signal so flux stays zero
  // (all frames identical → no dB rise → no spectral flux output).
  const silentChannel = new Float32Array(SAMPLES).fill(0.05)
  const renderedBuffer = {
    getChannelData: vi.fn(() => silentChannel),
  }

  const makeFilter = () => ({
    type: '',
    frequency: { value: 0 },
    connect: vi.fn(),
  })

  const mockOfflineCtx = {
    createBufferSource: vi.fn(() => ({
      buffer: null as unknown,
      connect: vi.fn(),
      start: vi.fn(),
      onended: null,
    })),
    createBiquadFilter: vi.fn(makeFilter),
    createChannelMerger: vi.fn(() => ({ connect: vi.fn() })),
    destination: {},
    suspend: vi.fn(() => Promise.resolve()),
    resume: vi.fn(() => Promise.resolve()),
    startRendering: vi.fn(() => Promise.resolve(renderedBuffer)),
  }

  const decodedBuffer = {
    length: SAMPLES,
    sampleRate: SAMPLE_RATE,
    duration: DURATION,
    getChannelData: vi.fn(() => new Float32Array(SAMPLES).fill(0.05)),
  }

  const mockAudioCtx = {
    decodeAudioData: vi.fn(() => Promise.resolve(decodedBuffer)),
    close: vi.fn(() => Promise.resolve()),
    state: 'suspended',
  }

  // Arrow functions cannot be used as constructors; regular functions must be used here.
  vi.stubGlobal('AudioContext', vi.fn(function () { return mockAudioCtx }))
  vi.stubGlobal('OfflineAudioContext', vi.fn(function () { return mockOfflineCtx }))

  return { mockAudioCtx, mockOfflineCtx, renderedBuffer, decodedBuffer }
}

function makeFile(): File {
  return {
    arrayBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(44))),
    type: 'audio/mpeg',
    name: 'test.mp3',
    size: 44,
  } as unknown as File
}

// --- Tests ---

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useAudioAnalyzer — initial state', () => {
  it('exposes the correct reactive properties', () => {
    const { isAnalyzing, analysisProgress, audioAnalysis } = useAudioAnalyzer()
    expect(isAnalyzing.value).toBe(false)
    expect(analysisProgress.value).toBe(0)
    expect(audioAnalysis.value).toBeNull()
  })

  it('exposes analyze and dispose as functions', () => {
    const { analyze, dispose } = useAudioAnalyzer()
    expect(typeof analyze).toBe('function')
    expect(typeof dispose).toBe('function')
  })
})

describe('useAudioAnalyzer — dispose()', () => {
  it('resets all reactive state', async () => {
    const { isAnalyzing, analysisProgress, audioAnalysis, dispose } = useAudioAnalyzer()
    await dispose()
    expect(isAnalyzing.value).toBe(false)
    expect(analysisProgress.value).toBe(0)
    expect(audioAnalysis.value).toBeNull()
  })
})

describe('useAudioAnalyzer — analyze()', () => {
  it('sets isAnalyzing=true synchronously and false after completion', async () => {
    mockWebAudio()
    const { analyze, isAnalyzing } = useAudioAnalyzer()
    const promise = analyze(makeFile())
    expect(isAnalyzing.value).toBe(true)
    await promise
    expect(isAnalyzing.value).toBe(false)
  })

  it('sets analysisProgress to 1 on successful completion', async () => {
    mockWebAudio()
    const { analyze, analysisProgress } = useAudioAnalyzer()
    await analyze(makeFile())
    expect(analysisProgress.value).toBe(1)
  })

  it('populates audioAnalysis.value after completion', async () => {
    mockWebAudio()
    const { analyze, audioAnalysis } = useAudioAnalyzer()
    await analyze(makeFile())
    expect(audioAnalysis.value).not.toBeNull()
  })

  it('returns an AudioAnalysis with a non-empty frames array', async () => {
    mockWebAudio()
    const { analyze } = useAudioAnalyzer()
    const result = await analyze(makeFile())
    expect(result.frames.length).toBeGreaterThan(0)
    expect(result.duration).toBe(DURATION)
  })

  it('each frame has the correct AudioFrame shape', async () => {
    mockWebAudio()
    const { analyze } = useAudioAnalyzer()
    const result = await analyze(makeFile())
    const frame = result.frames[0]
    const numericKeys = [
      'time',
      'energy',
      'subBass',
      'mids',
      'highs',
      'spectralFlux',
      'spectralFluxBass',
      'spectralFluxMids',
      'spectralFluxHighs',
    ] as const
    for (const key of numericKeys) {
      expect(typeof frame[key], `frame.${key} should be a number`).toBe('number')
    }
  })

  it('all frame values are finite numbers', async () => {
    mockWebAudio()
    const { analyze } = useAudioAnalyzer()
    const result = await analyze(makeFile())
    for (const frame of result.frames) {
      expect(Number.isFinite(frame.time)).toBe(true)
      expect(Number.isFinite(frame.energy)).toBe(true)
      expect(Number.isFinite(frame.spectralFlux)).toBe(true)
      expect(Number.isFinite(frame.spectralFluxBass)).toBe(true)
      expect(Number.isFinite(frame.spectralFluxMids)).toBe(true)
      expect(Number.isFinite(frame.spectralFluxHighs)).toBe(true)
    }
  })

  it('flux values are normalised to [0, 1]', async () => {
    mockWebAudio()
    const { analyze } = useAudioAnalyzer()
    const result = await analyze(makeFile())
    for (const frame of result.frames) {
      expect(frame.spectralFlux).toBeGreaterThanOrEqual(0)
      expect(frame.spectralFlux).toBeLessThanOrEqual(1)
      expect(frame.spectralFluxBass).toBeGreaterThanOrEqual(0)
      expect(frame.spectralFluxBass).toBeLessThanOrEqual(1)
      expect(frame.spectralFluxMids).toBeGreaterThanOrEqual(0)
      expect(frame.spectralFluxMids).toBeLessThanOrEqual(1)
      expect(frame.spectralFluxHighs).toBeGreaterThanOrEqual(0)
      expect(frame.spectralFluxHighs).toBeLessThanOrEqual(1)
    }
  })

  it('frame times are monotonically increasing', async () => {
    mockWebAudio()
    const { analyze } = useAudioAnalyzer()
    const result = await analyze(makeFile())
    for (let i = 1; i < result.frames.length; i++) {
      expect(result.frames[i].time).toBeGreaterThan(result.frames[i - 1].time)
    }
  })

  it('the returned AudioAnalysis is also in audioAnalysis.value', async () => {
    mockWebAudio()
    const { analyze, audioAnalysis } = useAudioAnalyzer()
    const result = await analyze(makeFile())
    expect(audioAnalysis.value).toBe(result)
  })

  it('dispose() after analyze() resets the stored analysis', async () => {
    mockWebAudio()
    const { analyze, dispose, audioAnalysis } = useAudioAnalyzer()
    await analyze(makeFile())
    expect(audioAnalysis.value).not.toBeNull()
    await dispose()
    expect(audioAnalysis.value).toBeNull()
  })
})
