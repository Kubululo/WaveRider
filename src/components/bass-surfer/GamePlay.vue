<script setup lang="ts">
import { ref } from 'vue'
import type { TrackData } from '~/lib/bass-surfer/types'
import type { SceneSettings } from '~/lib/bass-surfer/sceneGenerator'
import type { AudioAnalysis } from '~/composables/useAudioAnalyzer'
import { useGameEngine } from '~/composables/useGameEngine'
import { useImmersiveMode } from '~/composables/useImmersiveMode'
import FullscreenButton from '~/components/bass-surfer/game/FullscreenButton.vue'
import TouchControls from '~/components/bass-surfer/game/TouchControls.vue'
import GameHud from '~/components/bass-surfer/game/GameHud.vue'
import DebugPanel from '~/components/bass-surfer/game/DebugPanel.vue'
import PauseMenu from '~/components/bass-surfer/game/PauseMenu.vue'
import ResultsScreen from '~/components/bass-surfer/game/ResultsScreen.vue'
import ShareScoreModal from '~/components/bass-surfer/game/ShareScoreModal.vue'
import RotateDevicePrompt from '~/components/bass-surfer/game/RotateDevicePrompt.vue'

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
const shareModal = ref<InstanceType<typeof ShareScoreModal> | null>(null)

// Presentation: fullscreen / orientation / device class.
const { isTouchDevice, isMobile, isPortrait, isFullscreen, fullscreenSupported, toggleFullscreen } =
  useImmersiveMode()

// Playable core: scene, audio, loop, scoring, debug stream.
const {
  isPlaying,
  gameEnded,
  isPaused,
  currentTimeDisplay,
  touchFlash,
  score,
  displayScore,
  showDebug,
  debugEntries,
  debugDriver,
  debugFps,
  moveLane,
  startGame,
  togglePause,
  resumeGame,
  restartGame,
  cleanup,
} = useGameEngine(props, canvasRef)

function closeGame() {
  cleanup()
  emit('close')
}
</script>

<template>
  <div class="relative w-full h-full font-mono select-none overflow-hidden bg-[#00020a]">
    <div ref="canvasRef" class="w-full h-full block outline-none" />

    <FullscreenButton
      v-if="fullscreenSupported && !isMobile"
      :is-fullscreen="isFullscreen"
      @toggle="toggleFullscreen"
    />

    <TouchControls
      v-if="isTouchDevice && isPlaying && !gameEnded && !isPaused"
      :touch-flash="touchFlash"
      @move="moveLane"
    />

    <GameHud
      v-if="isPlaying && !gameEnded"
      :current-time-display="currentTimeDisplay"
      :track-name="trackName"
      :score="score"
      :display-score="displayScore"
      @pause="togglePause"
    />

    <DebugPanel
      v-if="showDebug && isPlaying"
      :entries="debugEntries"
      :fps="debugFps"
      :driver="debugDriver"
    />

    <PauseMenu
      v-if="isPaused"
      :show-debug="showDebug"
      :has-analysis="!!analysis"
      @resume="resumeGame"
      @restart="restartGame"
      @exit="closeGame"
      @toggle-debug="showDebug = !showDebug"
    />

    <ResultsScreen
      v-if="!isPlaying"
      :game-ended="gameEnded"
      :score="score"
      :track-name="trackName"
      :zen-mode="zenMode"
      @start="startGame"
      @share="shareModal?.open()"
      @close="closeGame"
    />

    <ShareScoreModal
      ref="shareModal"
      :score="score"
      :track-name="trackName"
      :zen-mode="zenMode"
    />

    <RotateDevicePrompt v-if="isMobile && isPortrait" />
  </div>
</template>
