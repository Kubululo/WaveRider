import { ref, shallowRef } from 'vue'

/**
 * --- ANALYSIS CONFIGURATION ---
 */
const ANALYSIS_CONFIG = {
  // Filter Settings (Hz)
  // Aligned with the standard EQ band division: bass below ~250, midrange
  // 250-4k (low/mid/upper-mid), presence + brilliance above 4k. Bass is cut at
  // 150 to isolate kick/sub punch from snare body; mids span 150-4k so vocals,
  // snare crack and lead synths stay "mids"; highs above 4k are what's actually
  // perceived as highs (hi-hats, cymbals, sparkle).
  LOW_PASS_FREQ: 150,
  MID_LOW_FREQ: 150,
  MID_HIGH_FREQ: 4000,
  HIGH_PASS_FREQ: 4000,

  // Precision Settings
  FPS: 60,
  DB_MIN: -100, // Noise floor for decibel conversion
  FLUX_THRESHOLD_DB: 2, // Minimum dB rise above the recent average to consider a "hit"
  FLUX_WINDOW_SEC: 0.15, // Moving-average window the current frame is compared against
  SILENCE_GATE_DB: -45, // Frames quieter than this produce no flux (noise floor chatter)
  // Bass must additionally rise this much within a single frame (~16ms) to count.
  // Punchy kicks jump 10-20dB in one frame; slow bass slides/swells (~0.5dB/frame)
  // creep past the moving average but fail this gate.
  BASS_ATTACK_GATE_DB: 4,

  // Adaptive Normalization
  NORMALIZATION_WINDOW_SEC: 3, // 3-second sliding window for local normalization
  // Prevents silence from being normalized to 100%. Highs/mids carry less energy
  // than bass, so their flux deltas are naturally smaller — lower floors keep them usable.
  LOCAL_MAX_FLOOR: { FULL: 10, BASS: 10, MIDS: 8, HIGHS: 6 },
}

export interface AudioFrame {
  time: number
  // Energy (RMS normalized 0-1)
  energy: number
  subBass: number
  mids: number
  highs: number
  // Flux (Locally Normalized 0-1)
  spectralFlux: number // Combined "Impact"
  spectralFluxBass: number // Kick / Sub hits
  spectralFluxMids: number // Snare / Vocal hits
  spectralFluxHighs: number // Hi-hat / Cymbal hits
}

export interface AudioAnalysis {
  buffer: AudioBuffer
  duration: number
  frames: AudioFrame[]
}

export function useAudioAnalyzer() {
  const isAnalyzing = ref(false)
  const analysisProgress = ref(0)
  const audioAnalysis = shallowRef<AudioAnalysis | null>(null)
  let activeOfflineCtx: OfflineAudioContext | null = null
  // Bumped on every analyze()/dispose() so a superseded in-flight analysis
  // can't overwrite the state of a newer one
  let analysisGeneration = 0

  async function dispose() {
    analysisGeneration++
    activeOfflineCtx = null
    audioAnalysis.value = null
    analysisProgress.value = 0
    isAnalyzing.value = false
  }

  // --- Helpers ---

  /** Converts linear amplitude to Decibels */
  function toDB(amplitude: number): number {
    if (amplitude <= 0) return ANALYSIS_CONFIG.DB_MIN
    const db = 20 * Math.log10(amplitude)
    return Math.max(db, ANALYSIS_CONFIG.DB_MIN)
  }

  /** Calculates Root Mean Square energy */
  function getRMS(data: Float32Array): number {
    let sum = 0
    for (const datum of data) {
      sum += datum * datum
    }
    return Math.sqrt(sum / data.length)
  }

  /**
   * Local max normalization with a centered window. Since the full song is
   * pre-decoded we can look ±1.5s ahead — a trailing window inflates flux at
   * section onsets because the local max hasn't caught up to the new loudness yet.
   */
  function normalizeLocally(data: Float32Array, fps: number, maxFloor: number): Float32Array {
    const windowSize = Math.floor(ANALYSIS_CONFIG.NORMALIZATION_WINDOW_SEC * fps)
    const halfWindow = Math.floor(windowSize / 2)
    // Create new TypedArray of same length
    const result = new Float32Array(data.length)

    for (let i = 0; i < data.length; i++) {
      const start = Math.max(0, i - halfWindow)
      const end = Math.min(data.length, i + halfWindow)

      let localMax = 0
      for (let j = start; j < end; j++) {
        if (data[j] > localMax) localMax = data[j]
      }

      const normalizer = Math.max(localMax, maxFloor)
      result[i] = Math.min(data[i] / normalizer, 1.0)
    }
    return result
  }

  /**
   * Onset detector: flux is the dB rise of the current frame above the average
   * of the preceding window. Comparing against a ~150ms average (instead of only
   * the previous frame) catches soft attacks — synth pads, piano, vocals — whose
   * energy ramps over several frames and never jumps enough in a single 16ms step.
   *
   * `attackGateDb` additionally requires the rise from the immediately previous
   * frame to exceed the gate — i.e. a sharp, punchy transient. Slow swells pass
   * the moving-average check but fail this one.
   */
  function createFluxTracker(attackGateDb = 0) {
    const windowSize = Math.max(
      1,
      Math.round(ANALYSIS_CONFIG.FLUX_WINDOW_SEC * ANALYSIS_CONFIG.FPS)
    )
    const history = new Float32Array(windowSize)
    let head = 0
    let count = 0
    let sum = 0
    let prevDb = ANALYSIS_CONFIG.DB_MIN

    return (db: number): number => {
      let flux = 0
      if (count > 0 && db > ANALYSIS_CONFIG.SILENCE_GATE_DB && db - prevDb >= attackGateDb) {
        const delta = db - sum / count
        flux = delta < ANALYSIS_CONFIG.FLUX_THRESHOLD_DB ? 0 : delta
      }
      prevDb = db

      // Push current frame into the window (silent frames included, so the
      // first hit after a quiet passage measures against that silence)
      if (count === windowSize) {
        sum -= history[head]
      } else {
        count++
      }
      history[head] = db
      sum += db
      head = (head + 1) % windowSize

      return flux
    }
  }

  async function analyze(file: File): Promise<AudioAnalysis> {
    const generation = ++analysisGeneration
    try {
      audioAnalysis.value = null
      isAnalyzing.value = true
      analysisProgress.value = 0

      // 1. Decode Source
      const tempCtx = new AudioContext()
      const arrayBuffer = await file.arrayBuffer()
      const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer)
      await tempCtx.close()

      if (generation !== analysisGeneration) throw new Error('Analysis superseded')
      analysisProgress.value = 0.1

      // 2. Setup 4-Channel Filter Graph
      // OfflineAudioContext renders the entire file much faster than real-time,
      // making whole-song centered normalization possible before play starts.
      activeOfflineCtx = new OfflineAudioContext(4, decodedBuffer.length, decodedBuffer.sampleRate)
      const offlineCtx = activeOfflineCtx
      const source = offlineCtx.createBufferSource()
      source.buffer = decodedBuffer

      // Create Filters. Biquads are 12dB/oct, so each cutoff is a cascade of two
      // (24dB/oct) to reduce bleed between bands (kick leaking into "mids" etc.)
      const makeFilter = (type: BiquadFilterType, freq: number) => {
        const f = offlineCtx.createBiquadFilter()
        f.type = type
        f.frequency.value = freq
        return f
      }
      const cascade = (...filters: BiquadFilterNode[]) => {
        for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1])
        return { first: filters[0], last: filters[filters.length - 1] }
      }

      const bassChain = cascade(
        makeFilter('lowpass', ANALYSIS_CONFIG.LOW_PASS_FREQ),
        makeFilter('lowpass', ANALYSIS_CONFIG.LOW_PASS_FREQ)
      )
      const midChain = cascade(
        makeFilter('highpass', ANALYSIS_CONFIG.MID_LOW_FREQ),
        makeFilter('highpass', ANALYSIS_CONFIG.MID_LOW_FREQ),
        makeFilter('lowpass', ANALYSIS_CONFIG.MID_HIGH_FREQ),
        makeFilter('lowpass', ANALYSIS_CONFIG.MID_HIGH_FREQ)
      )
      const highChain = cascade(
        makeFilter('highpass', ANALYSIS_CONFIG.HIGH_PASS_FREQ),
        makeFilter('highpass', ANALYSIS_CONFIG.HIGH_PASS_FREQ)
      )

      const merger = offlineCtx.createChannelMerger(4)

      // Routing
      // Channel 0: Full Mix
      source.connect(merger, 0, 0)

      // Channel 1: Bass
      source.connect(bassChain.first)
      bassChain.last.connect(merger, 0, 1)

      // Channel 2: Mids
      source.connect(midChain.first)
      midChain.last.connect(merger, 0, 2)

      // Channel 3: Highs
      source.connect(highChain.first)
      highChain.last.connect(merger, 0, 3)

      merger.connect(offlineCtx.destination)
      source.start(0)

      // Progress checkpoints during the render (must be scheduled before startRendering)
      for (let i = 1; i <= 9; i++) {
        offlineCtx
          .suspend((decodedBuffer.duration * i) / 10)
          .then(() => {
            if (generation === analysisGeneration) {
              analysisProgress.value = 0.1 + 0.6 * (i / 10)
            }
            return offlineCtx.resume()
          })
          .catch(() => {})
      }

      // 3. Perform Offline Render
      const renderedBuffer = await offlineCtx.startRendering()

      if (generation !== analysisGeneration) throw new Error('Analysis superseded')
      analysisProgress.value = 0.75

      // 4. Extraction and Flux Calculation
      const fullData = renderedBuffer.getChannelData(0)
      const bassData = renderedBuffer.getChannelData(1)
      const midData = renderedBuffer.getChannelData(2)
      const highData = renderedBuffer.getChannelData(3)

      const samplesPerFrame = Math.floor(decodedBuffer.sampleRate / ANALYSIS_CONFIG.FPS)

      // FIX: Pre-calculate exact frame count to avoid "RangeError" on push
      const totalFrames = Math.floor(fullData.length / samplesPerFrame)

      // Use Float32Array for memory efficiency (no dynamic resizing)
      const rawFluxFull = new Float32Array(totalFrames)
      const rawFluxBass = new Float32Array(totalFrames)
      const rawFluxMids = new Float32Array(totalFrames)
      const rawFluxHighs = new Float32Array(totalFrames)

      const energyArray = new Float32Array(totalFrames)
      const bassEnergyArray = new Float32Array(totalFrames)
      const midEnergyArray = new Float32Array(totalFrames)
      const highEnergyArray = new Float32Array(totalFrames)

      const fluxFull = createFluxTracker()
      const fluxBass = createFluxTracker(ANALYSIS_CONFIG.BASS_ATTACK_GATE_DB)
      const fluxMids = createFluxTracker()
      const fluxHighs = createFluxTracker()

      // Loop by Index (Safe)
      for (let i = 0; i < totalFrames; i++) {
        const start = i * samplesPerFrame
        const end = start + samplesPerFrame

        // Extract chunks
        const eFull = getRMS(fullData.subarray(start, end))
        const eBass = getRMS(bassData.subarray(start, end))
        const eMid = getRMS(midData.subarray(start, end))
        const eHigh = getRMS(highData.subarray(start, end))

        // Store Energy
        energyArray[i] = eFull
        bassEnergyArray[i] = eBass
        midEnergyArray[i] = eMid
        highEnergyArray[i] = eHigh

        // Convert to dB
        const dbFull = toDB(eFull)
        const dbBass = toDB(eBass)
        const dbMid = toDB(eMid)
        const dbHigh = toDB(eHigh)

        // Calculate and Store Flux (rise above the recent moving average)
        rawFluxFull[i] = fluxFull(dbFull)
        rawFluxBass[i] = fluxBass(dbBass)
        rawFluxMids[i] = fluxMids(dbMid)
        rawFluxHighs[i] = fluxHighs(dbHigh)
      }

      analysisProgress.value = 0.85

      // 5. Adaptive Normalization (Returns new Float32Arrays)
      const floors = ANALYSIS_CONFIG.LOCAL_MAX_FLOOR
      const normFluxFull = normalizeLocally(rawFluxFull, ANALYSIS_CONFIG.FPS, floors.FULL)
      const normFluxBass = normalizeLocally(rawFluxBass, ANALYSIS_CONFIG.FPS, floors.BASS)
      const normFluxMids = normalizeLocally(rawFluxMids, ANALYSIS_CONFIG.FPS, floors.MIDS)
      const normFluxHighs = normalizeLocally(rawFluxHighs, ANALYSIS_CONFIG.FPS, floors.HIGHS)

      // 6. Final Frame Assembly
      // We map the indices to objects. Since we know length, this is safe.
      const frames: AudioFrame[] = new Array(totalFrames)
      for (let i = 0; i < totalFrames; i++) {
        frames[i] = {
          time: i / ANALYSIS_CONFIG.FPS,
          energy: energyArray[i],
          subBass: bassEnergyArray[i],
          mids: midEnergyArray[i],
          highs: highEnergyArray[i],
          spectralFlux: normFluxFull[i],
          spectralFluxBass: normFluxBass[i],
          spectralFluxMids: normFluxMids[i],
          spectralFluxHighs: normFluxHighs[i],
        }
      }

      if (generation !== analysisGeneration) throw new Error('Analysis superseded')

      analysisProgress.value = 1
      audioAnalysis.value = {
        buffer: decodedBuffer,
        duration: decodedBuffer.duration,
        frames,
      }

      return audioAnalysis.value
    } catch (e) {
      console.error('Analysis failed:', e)
      throw e
    } finally {
      // A superseded run must not clobber the state of the newer one
      if (generation === analysisGeneration) {
        isAnalyzing.value = false
        activeOfflineCtx = null
      }
    }
  }

  return { isAnalyzing, analysisProgress, audioAnalysis, analyze, dispose }
}
