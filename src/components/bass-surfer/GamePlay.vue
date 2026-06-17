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
import CountdownOverlay from '~/components/bass-surfer/game/CountdownOverlay.vue'

const props = defineProps<{
  trackData: TrackData
  audioBuffer: AudioBuffer
  trackName?: string
  analysis?: AudioAnalysis
  settings?: SceneSettings
  zenMode?: boolean
}>()

const emit = defineEmits(['close', 'ready', 'prepareProgress', 'startIntro'])

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
  countdown,
  songStarted,
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
} = useGameEngine(props, canvasRef, {
  onProgress: (p) => emit('prepareProgress', p),
  onReady: () => emit('ready'),
})

function closeGame() {
  cleanup()
  emit('close')
}

// Play the WaveRider wordmark splash as the run begins — it masks the camera's
// jump to the high drop-in start, then dissolves to reveal the descent.
function onStart() {
  emit('startIntro')
  startGame()
}
function onRestart() {
  emit('startIntro')
  restartGame()
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
      v-if="isTouchDevice && isPlaying && songStarted && !gameEnded && !isPaused"
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
      v-if="isPaused && countdown === null"
      :show-debug="showDebug"
      :has-analysis="!!analysis"
      @resume="resumeGame"
      @restart="onRestart"
      @exit="closeGame"
      @toggle-debug="showDebug = !showDebug"
    />

    <!-- The start/finish menu doubles as the "page intro": on Start it fades out
         to reveal the camera dropping into place. -->
    <Transition name="screen-fade">
      <ResultsScreen
        v-if="!isPlaying"
        :game-ended="gameEnded"
        :score="score"
        :track-name="trackName"
        :zen-mode="zenMode"
        @start="onStart"
        @share="shareModal?.open()"
        @close="closeGame"
      />
    </Transition>

    <ShareScoreModal
      ref="shareModal"
      :score="score"
      :track-name="trackName"
      :zen-mode="zenMode"
    />

    <CountdownOverlay v-if="countdown !== null" :count="countdown" />

    <RotateDevicePrompt v-if="isMobile && isPortrait" />
  </div>
</template>

<style scoped>
/* Start menu fades out on Start, revealing the camera drop behind it. */
.screen-fade-leave-active {
  transition: opacity 0.5s ease;
}
.screen-fade-enter-active {
  transition: opacity 0.3s ease;
}
.screen-fade-enter-from,
.screen-fade-leave-to {
  opacity: 0;
}
</style>
