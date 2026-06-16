<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { TrackData, GameScore } from '~/lib/bass-surfer/types'
import { RetrowaveScene, LANE_WIDTH, type SceneSettings } from '~/lib/bass-surfer/sceneGenerator'
import { FrostedGlass } from '~/components/ui/frosted-glass'
import type { AudioAnalysis } from '~/composables/useAudioAnalyzer'

const props = defineProps<{
  trackData: TrackData
  audioBuffer: AudioBuffer
  trackName?: string
  analysis?: AudioAnalysis
  settings?: SceneSettings
  zenMode?: boolean
}>()

const emit = defineEmits(['close'])

const canvasRef = ref<HTMLDivElement | null>(null)
const isPlaying = ref(false)
const gameEnded = ref(false)
const isPaused = ref(false)
const currentTimeDisplay = ref('0:00')

// Debug State
const showDebug = ref(false)
interface DebugEntry {
  key: string
  value: number
  pct: number
  color: string
}
const debugEntries = ref<DebugEntry[]>([])
const _fieldMax: Record<string, number> = {}
const debugDriver = ref('')
const debugFps = ref(0)
let fpsFrameCount = 0
let fpsLastTime = 0

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

// Lane & Player State
const currentLane = ref(0)
const playerX = ref(0)

// Score State
const score = ref<GameScore>({
  score: 0,
  combo: 0,
  maxCombo: 0,
  multiplier: 1,
  collectiblesHit: 0,
  collectiblesTotal: 0,
})

const displayScore = ref(0)

// --- Globals ---
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

const BASE_FOV = 95

// Touch detection & flash state
const isTouchDevice = ref(false)
const touchFlash = ref<'left' | 'right' | null>(null)
let touchFlashTimer: ReturnType<typeof setTimeout> | null = null

function moveLane(delta: -1 | 1) {
  if (isPaused.value || !isPlaying.value) return
  currentLane.value = Math.max(-1, Math.min(1, currentLane.value + delta))

  touchFlash.value = delta < 0 ? 'left' : 'right'
  if (touchFlashTimer) clearTimeout(touchFlashTimer)
  touchFlashTimer = setTimeout(() => {
    touchFlash.value = null
  }, 150)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (isPlaying.value && !gameEnded.value) {
      togglePause()
    }
    return
  }

  if (isPaused.value || !isPlaying.value) return

  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    moveLane(-1)
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    moveLane(1)
  }
}

onMounted(async () => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  window.addEventListener('keydown', onKeyDown)

  if (canvasRef.value) {
    sceneManager = new RetrowaveScene(
      `${import.meta.env.BASE_URL}assets/retrowave/`,
      canvasRef.value,
      props.settings
    )

    if (props.trackData.segments) {
      const heights = props.trackData.segments.map((s) => s.y)
      const centers = props.trackData.segments.map((s) => s.centerX)
      const rolls = props.trackData.segments.map((s) => s.roll || 0)
      sceneManager.setTrackData(heights, centers, rolls, props.audioBuffer.duration)
      sceneManager.latency = 0.0
    }

    await sceneManager.prepareScene(false)

    if (props.trackData.segments && !props.zenMode) {
      sceneManager.spawnCollectibles(props.trackData.segments, props.audioBuffer.duration)
      score.value.collectiblesTotal = props.trackData.segments.filter(
        (s) => s.collectible !== null
      ).length
    }

    tick()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  cleanup()
})

function cleanup() {
  cancelAnimationFrame(rafId)
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

function tick() {
  rafId = requestAnimationFrame(tick)
  if (!sceneManager) return

  let progress = lastProgress
  let elapsed = 0

  if (isPlaying.value && !isPaused.value && audioCtx) {
    const outputLatency = audioCtx.outputLatency || audioCtx.baseLatency || 0
    elapsed = Math.max(0, audioCtx.currentTime - startTime - outputLatency)

    if (elapsed > props.audioBuffer.duration) {
      endGame()
    } else {
      const m = Math.floor(elapsed / 60)
      const s = Math.floor(elapsed % 60)
        .toString()
        .padStart(2, '0')
      currentTimeDisplay.value = `${m}:${s}`
      progress = Math.max(0, Math.min(1, elapsed / props.audioBuffer.duration))
      lastProgress = progress

      if (showDebug.value) {
        fpsFrameCount++
        const now = performance.now()
        if (now - fpsLastTime >= 500) {
          debugFps.value = Math.round((fpsFrameCount * 1000) / (now - fpsLastTime))
          fpsFrameCount = 0
          fpsLastTime = now
        }

        if (props.analysis?.frames) {
          const analysisFPS = props.analysis.frames.length / props.analysis.duration
          const fIdx = Math.max(0, Math.floor(elapsed * analysisFPS))
          if (fIdx < props.analysis.frames.length) {
            const frame = props.analysis.frames[fIdx] as unknown as Record<string, number>
            const entries: DebugEntry[] = []
            for (const [k, v] of Object.entries(frame)) {
              const n = v as number
              let pct: number
              if (k === 'time') {
                pct = Math.min((n / (props.analysis.duration || 1)) * 100, 100)
              } else {
                if (n > (_fieldMax[k] ?? 0)) _fieldMax[k] = n
                pct = Math.min((n / (_fieldMax[k] || 1)) * 100, 100)
              }
              entries.push({ key: k, value: n, pct, color: debugColor(k) })
            }
            debugEntries.value = entries
          }
          const driver = props.trackData.melodicDriver
          if (driver && fIdx < driver.length) {
            debugDriver.value = driver[fIdx] === 1 ? 'HIGHS' : 'MIDS'
          }
        }
      }
    }
  }

  sceneManager.updateTime(progress)

  if (sceneManager.camera && props.trackData.segments.length > 0) {
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

  if (isPlaying.value && !isPaused.value && !props.zenMode) {
    sceneManager.updateCollectibles(elapsed)
  }

  if (isPlaying.value && !isPaused.value && !props.zenMode && sceneManager.playerGroup) {
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
    collectiblesTotal: props.zenMode
      ? 0
      : props.trackData.segments.filter((s) => s.collectible !== null).length,
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
  sourceNode.buffer = props.audioBuffer
  sourceNode.connect(audioCtx.destination)

  startTime = audioCtx.currentTime + 0.1
  lastProgress = 0
  lastScrollOffset = 0
  sourceNode.start(startTime)

  sourceNode.onended = () => {
    if (isPlaying.value && !gameEnded.value) endGame()
  }

  if (sceneManager && props.trackData.segments && !props.zenMode) {
    sceneManager.spawnCollectibles(props.trackData.segments, props.audioBuffer.duration)
  }

  isPlaying.value = true
  gameEnded.value = false
  isPaused.value = false
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
  if (!isPlaying.value || gameEnded.value) return
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
  isPaused.value = false
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
}

function restartGame() {
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

function closeGame() {
  cleanup()
  emit('close')
}
</script>

<template>
  <div class="relative w-full h-full font-mono select-none overflow-hidden bg-[#00020a]">
    <div ref="canvasRef" class="w-full h-full block outline-none" />

    <!-- Touch Zones (mobile only) -->
    <template v-if="isTouchDevice && isPlaying && !gameEnded && !isPaused">
      <div
        class="absolute left-0 top-0 bottom-20 w-1/2 z-[99999] flex items-center justify-start pl-4"
        @touchstart.prevent="moveLane(-1)"
      >
        <svg
          class="w-8 h-8 text-white transition-opacity duration-150"
          :class="touchFlash === 'left' ? 'opacity-40' : 'opacity-0'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </div>
      <div
        class="absolute right-0 top-0 bottom-20 w-1/2 z-[99999] flex items-center justify-end pr-4"
        @touchstart.prevent="moveLane(1)"
      >
        <svg
          class="w-8 h-8 text-white transition-opacity duration-150"
          :class="touchFlash === 'right' ? 'opacity-40' : 'opacity-0'"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
    </template>

    <!-- HUD bar (playing) -->
    <FrostedGlass
      v-if="isPlaying && !gameEnded"
      container-class="fixed bottom-4 z-[99999] h-14 max-w-4xl w-full left-1/2 -translate-x-1/2"
      class="flex items-center justify-between px-5 border border-white/10"
    >
      <div class="shrink-0 text-white/90 font-mono text-lg font-bold tabular-nums">
        {{ currentTimeDisplay }}
      </div>
      <div class="flex-1 flex items-center justify-center gap-2.5 min-w-0 px-4">
        <span class="text-sm font-bold text-cyan-400 uppercase tracking-wider truncate">
          {{ trackName || 'UNKNOWN' }}
        </span>
      </div>
      <div class="shrink-0 flex items-center gap-3">
        <div v-if="score.combo > 1" class="text-xs font-bold text-pink-400 uppercase">
          {{ score.combo }}x
        </div>
        <span class="text-sm font-bold text-yellow-400 tabular-nums">
          {{ displayScore.toLocaleString() }}
        </span>
        <button
          class="shrink-0 p-1 text-white/60 hover:text-white transition-colors"
          @click="togglePause"
          @touchstart.prevent="togglePause"
          aria-label="Pause"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        </button>
      </div>
    </FrostedGlass>

    <!-- Debug Panel -->
    <div
      v-if="showDebug && isPlaying"
      class="absolute bottom-20 right-4 z-40 p-4 bg-black/90 backdrop-blur-md border border-cyan-500/30 rounded-lg w-72 shadow-[0_0_20px_rgba(0,0,0,0.8)] pointer-events-none"
    >
      <h3
        class="text-cyan-400 font-bold text-xs uppercase mb-4 tracking-[0.2em] border-b border-cyan-500/30 pb-2 flex justify-between"
      >
        <span>Analysis Stream</span>
        <span class="text-cyan-600 animate-pulse">● LIVE</span>
      </h3>
      <div class="space-y-3 text-[10px] font-bold tracking-wider">
        <div class="flex justify-between text-gray-400 uppercase">
          <span>FPS</span>
          <span class="font-mono text-white">{{ debugFps }}</span>
        </div>
        <div v-for="entry in debugEntries" :key="entry.key" class="flex flex-col gap-1">
          <div class="flex justify-between text-gray-400 uppercase">
            <span>{{ entry.key }}</span>
            <span class="font-mono text-white">{{ entry.value.toFixed(4) }}</span>
          </div>
          <div
            class="h-1.5 w-full rounded-full overflow-hidden"
            style="background: rgba(255, 255, 255, 0.06)"
          >
            <div
              class="h-full transition-all duration-75"
              :style="{ width: `${entry.pct}%`, backgroundColor: entry.color }"
            />
          </div>
        </div>
        <div
          v-if="debugDriver"
          class="flex justify-between items-center uppercase pt-2 border-t border-cyan-500/30"
        >
          <span class="text-gray-400">Driven by</span>
          <div class="flex gap-3 font-mono">
            <span
              class="transition-colors duration-150"
              :class="debugDriver === 'MIDS' ? 'text-orange-400' : 'text-gray-600'"
              >MIDS</span
            >
            <span
              class="transition-colors duration-150"
              :class="debugDriver === 'HIGHS' ? 'text-green-400' : 'text-gray-600'"
              >HIGHS</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Pause Menu -->
    <div
      v-if="isPaused"
      class="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-[9999999]"
    >
      <FrostedGlass
        container-class="relative z-50 w-[min(90vw,400px)]"
        class="flex flex-col items-center gap-4 border border-white/10 p-8"
        position="relative"
      >
        <h2 class="text-4xl font-black text-white italic tracking-widest mb-4 -skew-x-6">PAUSED</h2>
        <button
          @click="resumeGame"
          class="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black text-xl uppercase tracking-widest hover:scale-105 transition-transform"
        >
          RESUME
        </button>
        <button
          @click="restartGame"
          class="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-xl uppercase tracking-widest hover:scale-105 transition-transform"
        >
          RESTART
        </button>
        <button
          @click="closeGame"
          class="w-full py-3 border border-white/20 text-white/70 font-bold text-lg uppercase tracking-widest hover:text-white hover:border-white/40 transition-all"
        >
          EXIT
        </button>
        <button
          v-if="analysis"
          @click="showDebug = !showDebug"
          class="mt-2 text-xs px-3 py-1 border font-bold uppercase transition-all"
          :class="
            showDebug
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
              : 'border-gray-700 text-gray-500 hover:text-cyan-400'
          "
        >
          DEBUG {{ showDebug ? 'ON' : 'OFF' }}
        </button>
      </FrostedGlass>
    </div>

    <!-- Start / Results Screen -->
    <div
      v-if="!isPlaying"
      class="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50"
    >
      <div class="text-center px-6">
        <h1
          class="text-7xl sm:text-9xl font-black text-white italic tracking-widest mb-4 drop-shadow-[0_0_20px_cyan] transform -skew-x-12"
        >
          {{ gameEnded ? 'FINISH' : 'READY' }}
        </h1>

        <div v-if="gameEnded" class="mb-8 space-y-3">
          <div
            class="text-yellow-400 text-5xl font-black tabular-nums drop-shadow-[0_0_10px_rgba(255,200,0,0.6)]"
          >
            {{ score.score.toLocaleString() }}
          </div>
          <div
            class="flex items-center justify-center gap-6 text-sm font-bold uppercase tracking-wider"
          >
            <span class="text-pink-400">
              MAX COMBO <span class="text-white font-mono ml-1">{{ score.maxCombo }}x</span>
            </span>
            <span v-if="!zenMode" class="text-cyan-400">
              ORBS
              <span class="text-white font-mono ml-1"
                >{{ score.collectiblesHit }}/{{ score.collectiblesTotal }}</span
              >
            </span>
          </div>
        </div>

        <div
          v-if="!gameEnded"
          class="mb-8 text-cyan-400/60 font-bold uppercase tracking-widest text-sm truncate max-w-sm mx-auto"
        >
          {{ trackName || 'UNKNOWN' }}
        </div>

        <button
          @click="startGame"
          class="pointer-events-auto px-12 py-4 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-3xl uppercase tracking-widest transform -skew-x-12 hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,0,255,0.6)]"
        >
          <span class="skew-x-12 block">{{ gameEnded ? 'RESTART' : 'START' }}</span>
        </button>

        <button
          @click="closeGame"
          class="pointer-events-auto mt-4 block mx-auto px-8 py-2 border border-white/20 text-white/60 font-bold uppercase tracking-widest hover:text-white hover:border-white/40 transition-all"
        >
          {{ gameEnded ? 'BACK TO MENU' : 'BACK' }}
        </button>
      </div>
    </div>
  </div>
</template>
