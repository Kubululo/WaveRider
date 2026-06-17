import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import type { TrackData, GameScore } from '~/lib/bass-surfer/types'
import { RetrowaveScene, LANE_WIDTH, type SceneSettings } from '~/lib/bass-surfer/sceneGenerator'
import type { AudioAnalysis } from '~/composables/useAudioAnalyzer'

export interface DebugEntry {
  key: string
  value: number
  pct: number
  color: string
}

/** Options the engine reads from the host component's (reactive) props. */
export interface GameEngineOptions {
  trackData: TrackData
  audioBuffer: AudioBuffer
  analysis?: AudioAnalysis
  settings?: SceneSettings
  zenMode?: boolean
}

const BASE_FOV = 95

function debugColor(key: string): string {
  if (key === 'time') return '#22d3ee'
  if (key === 'subBass') return '#ef4444'
  if (key === 'mids') return '#34d399'
  if (key === 'highs') return '#60a5fa'
  if (key === 'energy') return '#ffffff'
  if (key === 'spectralFlux') return '#facc15'
  if (key.includes('Bass')) return '#a78bfa'
  if (key.includes('Mids')) return '#fb923c'
  if (key.includes('Highs')) return '#4ade80'
  return '#9ca3af'
}

/** Lifecycle hooks the host wires to the loading bar / screen transition. */
export interface GameEngineHooks {
  /** Scene build progress, 0..1. */
  onProgress?: (p: number) => void
  /** Fired once the scene is built and the first frame has rendered. */
  onReady?: () => void
}

const COUNTDOWN_FROM = 3

/**
 * The playable core of WaveRider: owns the Three.js scene, the audio clock, the
 * requestAnimationFrame loop, orb collision + scoring, and the optional debug
 * analysis stream. It registers its own mount/unmount lifecycle and a keyboard
 * handler; the host component just renders the returned state and wires buttons
 * to the returned controls.
 */
export function useGameEngine(
  opts: GameEngineOptions,
  canvasRef: Ref<HTMLDivElement | null>,
  hooks: GameEngineHooks = {}
) {
  // --- Reactive state surfaced to the UI ---
  const isPlaying = ref(false)
  const gameEnded = ref(false)
  const isPaused = ref(false)
  const currentTimeDisplay = ref('0:00')

  const currentLane = ref(0)
  const playerX = ref(0)
  const touchFlash = ref<'left' | 'right' | null>(null)
  // Pre-roll countdown: null when idle, else the number on screen (3 → 1).
  const countdown = ref<number | null>(null)

  const score = ref<GameScore>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    multiplier: 1,
    collectiblesHit: 0,
    collectiblesTotal: 0,
  })
  const displayScore = ref(0)

  // --- Debug stream ---
  const showDebug = ref(false)
  const debugEntries = ref<DebugEntry[]>([])
  const debugDriver = ref('')
  const debugFps = ref(0)
  const _fieldMax: Record<string, number> = {}
  let fpsFrameCount = 0
  let fpsLastTime = 0

  // --- Non-reactive engine internals ---
  let sceneManager: RetrowaveScene | null = null
  let audioCtx: AudioContext | null = null
  let sourceNode: AudioBufferSourceNode | null = null
  let startTime = 0
  let lastProgress = 0
  // Scroll distance (world units) resolved last frame, for swept orb collision.
  let lastScrollOffset = 0
  let playerPitch = 0
  let playerYaw = 0
  let rafId = 0
  let touchFlashTimer: ReturnType<typeof setTimeout> | null = null
  let countdownTimer: ReturnType<typeof setTimeout> | null = null
  // Gates the audio clock: false during the pre-roll countdown so the scene
  // holds on frame 0 instead of racing ahead (or ending) before playback starts.
  let playbackStarted = false

  function clearCountdown() {
    if (countdownTimer) {
      clearTimeout(countdownTimer)
      countdownTimer = null
    }
    countdown.value = null
  }

  // Counts 3 → 2 → 1 (1s each), then runs onComplete — a ~3s pre-roll.
  function runCountdown(onComplete: () => void) {
    clearCountdown()
    countdown.value = COUNTDOWN_FROM
    const step = () => {
      if (countdown.value === null) return
      if (countdown.value > 1) {
        countdown.value -= 1
        countdownTimer = setTimeout(step, 1000)
      } else {
        clearCountdown()
        onComplete()
      }
    }
    countdownTimer = setTimeout(step, 1000)
  }

  function moveLane(delta: -1 | 1) {
    if (isPaused.value || !isPlaying.value || countdown.value !== null) return
    currentLane.value = Math.max(-1, Math.min(1, currentLane.value + delta))

    touchFlash.value = delta < 0 ? 'left' : 'right'
    if (touchFlashTimer) clearTimeout(touchFlashTimer)
    touchFlashTimer = setTimeout(() => {
      touchFlash.value = null
    }, 150)
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // The browser reserves Esc to leave fullscreen; we don't also pop the pause
      // menu (that double action was disorienting). Pause is the HUD button or "P".
      e.preventDefault()
      return
    }

    if (e.key === 'p' || e.key === 'P') {
      if (isPlaying.value && !gameEnded.value) togglePause()
      return
    }

    if (isPaused.value || !isPlaying.value) return

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      moveLane(-1)
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      moveLane(1)
    }
  }

  function tick() {
    rafId = requestAnimationFrame(tick)
    if (!sceneManager) return

    let progress = lastProgress
    let elapsed = 0

    if (isPlaying.value && !isPaused.value && playbackStarted && audioCtx) {
      const outputLatency = audioCtx.outputLatency || audioCtx.baseLatency || 0
      elapsed = Math.max(0, audioCtx.currentTime - startTime - outputLatency)

      if (elapsed > opts.audioBuffer.duration) {
        endGame()
      } else {
        const m = Math.floor(elapsed / 60)
        const s = Math.floor(elapsed % 60)
          .toString()
          .padStart(2, '0')
        currentTimeDisplay.value = `${m}:${s}`
        progress = Math.max(0, Math.min(1, elapsed / opts.audioBuffer.duration))
        lastProgress = progress

        if (showDebug.value) {
          fpsFrameCount++
          const now = performance.now()
          if (now - fpsLastTime >= 500) {
            debugFps.value = Math.round((fpsFrameCount * 1000) / (now - fpsLastTime))
            fpsFrameCount = 0
            fpsLastTime = now
          }

          if (opts.analysis?.frames) {
            const analysisFPS = opts.analysis.frames.length / opts.analysis.duration
            const fIdx = Math.max(0, Math.floor(elapsed * analysisFPS))
            if (fIdx < opts.analysis.frames.length) {
              const frame = opts.analysis.frames[fIdx] as unknown as Record<string, number>
              const entries: DebugEntry[] = []
              for (const [k, v] of Object.entries(frame)) {
                const n = v as number
                let pct: number
                if (k === 'time') {
                  pct = Math.min((n / (opts.analysis.duration || 1)) * 100, 100)
                } else {
                  if (n > (_fieldMax[k] ?? 0)) _fieldMax[k] = n
                  pct = Math.min((n / (_fieldMax[k] || 1)) * 100, 100)
                }
                entries.push({ key: k, value: n, pct, color: debugColor(k) })
              }
              debugEntries.value = entries
            }
            const driver = opts.trackData.melodicDriver
            if (driver && fIdx < driver.length) {
              debugDriver.value = driver[fIdx] === 1 ? 'HIGHS' : 'MIDS'
            }
          }
        }
      }
    }

    sceneManager.updateTime(progress)

    if (sceneManager.camera && opts.trackData.segments.length > 0) {
      // Ease the camera toward the gameplay FOV (wider than the menu default)
      sceneManager.camera.fov += (BASE_FOV - sceneManager.camera.fov) * 0.1
      sceneManager.camera.updateProjectionMatrix()
    }

    const targetX = currentLane.value * LANE_WIDTH
    playerX.value += (targetX - playerX.value) * 0.15

    if (sceneManager.playerGroup) {
      const h = sceneManager.getTrackHeightAt(progress)
      const cx = sceneManager.getTrackCenterXAt(progress)
      const bank = sceneManager.getTrackRollAt(progress)

      sceneManager.playerGroup.position.y = h + 0.5 + 6 * Math.abs(bank) - playerX.value * bank
      sceneManager.playerGroup.position.x = playerX.value + cx

      sceneManager.camera.position.x = cx

      const targetPitch = sceneManager.getTrackPitchAt(progress)
      playerPitch += (targetPitch - playerPitch) * 0.2
      sceneManager.playerGroup.rotation.x = playerPitch

      const targetYaw = sceneManager.getTrackYawAt(progress)
      playerYaw += (targetYaw - playerYaw) * 0.2
      sceneManager.playerGroup.rotation.y = -targetYaw
      sceneManager.playerGroup.rotation.z = -Math.atan(bank)
    }

    if (isPlaying.value && !isPaused.value && playbackStarted && !opts.zenMode) {
      sceneManager.updateCollectibles(elapsed)
    }

    if (
      isPlaying.value &&
      !isPaused.value &&
      playbackStarted &&
      !opts.zenMode &&
      sceneManager.playerGroup
    ) {
      const collectibles = sceneManager.getCollectibles()
      const playerZ = sceneManager.playerGroup!.position.z

      // Swept collision: an orb sits at z = baseZ + scrollOffset, and scrollOffset
      // grows monotonically with the audio clock (= elapsed × animationSpeed). Each
      // orb crosses the player plane (dz = 0) at exactly scrollOffset = playerZ -
      // baseZ. Resolving on that crossing — instead of testing presence in a fixed
      // ±2 window each frame — means a dropped/long frame that jumps the orb clean
      // past the window can't cause a phantom miss. Frame-rate independent.
      const scrollOffset = elapsed * sceneManager.animationSpeed

      for (let i = 0; i < collectibles.length; i++) {
        const c = collectibles[i]
        if (!c.alive) continue

        const crossOffset = playerZ - c.baseZ
        // Did the orb pass the player plane somewhere between last frame and now?
        if (crossOffset > lastScrollOffset && crossOffset <= scrollOffset) {
          sceneManager.removeCollectible(i)
          if (c.lane === currentLane.value) {
            score.value.collectiblesHit++
            score.value.combo++
            if (score.value.combo > score.value.maxCombo) {
              score.value.maxCombo = score.value.combo
            }
            score.value.multiplier = 1 + Math.floor(score.value.combo / 10)
            score.value.score += 100 * score.value.multiplier
            displayScore.value = score.value.score
          } else {
            score.value.combo = 0
            score.value.multiplier = 1
          }
        }
      }

      lastScrollOffset = scrollOffset
    }

    sceneManager.renderFrame()
  }

  async function startGame() {
    if (isPlaying.value) return

    score.value = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      multiplier: 1,
      collectiblesHit: 0,
      collectiblesTotal: opts.zenMode
        ? 0
        : opts.trackData.segments.filter((s) => s.collectible !== null).length,
    }
    displayScore.value = 0
    currentLane.value = 0
    playerX.value = 0

    if (audioCtx) {
      try {
        if (audioCtx.state !== 'closed') audioCtx.close()
      } catch {}
    }

    audioCtx = new AudioContext()
    await audioCtx.resume()

    sourceNode = audioCtx.createBufferSource()
    sourceNode.buffer = opts.audioBuffer
    sourceNode.connect(audioCtx.destination)

    lastProgress = 0
    lastScrollOffset = 0
    playbackStarted = false

    sourceNode.onended = () => {
      if (isPlaying.value && !gameEnded.value) endGame()
    }

    if (sceneManager && opts.trackData.segments && !opts.zenMode) {
      sceneManager.spawnCollectibles(opts.trackData.segments, opts.audioBuffer.duration)
    }

    isPlaying.value = true
    gameEnded.value = false
    isPaused.value = false

    // Hold the scene on frame 0 through a 3-2-1 pre-roll, then drop the needle.
    runCountdown(beginPlayback)
  }

  function beginPlayback() {
    if (!audioCtx || !sourceNode) return
    startTime = audioCtx.currentTime + 0.1
    sourceNode.start(startTime)
    playbackStarted = true
  }

  function endGame() {
    if (!isPlaying.value) return
    isPlaying.value = false
    gameEnded.value = true

    if (sourceNode) {
      try {
        sourceNode.stop()
        sourceNode.disconnect()
      } catch {}
      sourceNode = null
    }
  }

  function togglePause() {
    if (!isPlaying.value || gameEnded.value || countdown.value !== null) return
    if (isPaused.value) {
      resumeGame()
    } else {
      pauseGame()
    }
  }

  function pauseGame() {
    isPaused.value = true
    if (audioCtx && audioCtx.state === 'running') {
      audioCtx.suspend()
    }
  }

  function resumeGame() {
    if (countdown.value !== null) return
    // Count back in before un-suspending the audio; the scene stays frozen on
    // the paused frame (isPaused holds) until the count reaches zero.
    runCountdown(() => {
      isPaused.value = false
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume()
      }
    })
  }

  function restartGame() {
    clearCountdown()
    isPaused.value = false
    isPlaying.value = false
    gameEnded.value = false

    if (sourceNode) {
      try {
        sourceNode.stop()
        sourceNode.disconnect()
      } catch {}
      sourceNode = null
    }
    if (audioCtx) {
      try {
        if (audioCtx.state !== 'closed') audioCtx.close()
      } catch {}
      audioCtx = null
    }

    startGame()
  }

  function cleanup() {
    cancelAnimationFrame(rafId)
    clearCountdown()
    if (sourceNode) {
      try {
        sourceNode.stop()
        sourceNode.disconnect()
      } catch {}
    }
    if (audioCtx) {
      try {
        if (audioCtx.state !== 'closed') audioCtx.close()
      } catch {}
    }
    sceneManager?.destroy()
    sceneManager = null
  }

  onMounted(async () => {
    window.addEventListener('keydown', onKeyDown)

    if (canvasRef.value) {
      sceneManager = new RetrowaveScene(
        `${import.meta.env.BASE_URL}assets/retrowave/`,
        canvasRef.value,
        opts.settings
      )

      if (opts.trackData.segments) {
        const heights = opts.trackData.segments.map((s) => s.y)
        const centers = opts.trackData.segments.map((s) => s.centerX)
        const rolls = opts.trackData.segments.map((s) => s.roll || 0)
        sceneManager.setTrackData(heights, centers, rolls, opts.audioBuffer.duration)
        sceneManager.latency = 0.0
      }

      await sceneManager.prepareScene(false, hooks.onProgress)

      if (opts.trackData.segments && !opts.zenMode) {
        sceneManager.spawnCollectibles(opts.trackData.segments, opts.audioBuffer.duration)
        score.value.collectiblesTotal = opts.trackData.segments.filter(
          (s) => s.collectible !== null
        ).length
      }

      // Paint the first frame before declaring ready so the reveal shows the
      // built scene rather than a blank canvas.
      sceneManager.renderFrame()
      hooks.onReady?.()

      tick()
    } else {
      hooks.onReady?.()
    }
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', onKeyDown)
    cleanup()
  })

  return {
    // state
    isPlaying,
    gameEnded,
    isPaused,
    currentTimeDisplay,
    currentLane,
    touchFlash,
    countdown,
    score,
    displayScore,
    showDebug,
    debugEntries,
    debugDriver,
    debugFps,
    // controls
    moveLane,
    startGame,
    endGame,
    togglePause,
    pauseGame,
    resumeGame,
    restartGame,
    cleanup,
  }
}
