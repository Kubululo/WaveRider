<script setup lang="ts">
import { ref, shallowRef, computed, onUnmounted } from 'vue'
import { useBassSurferStore } from '~/stores/bassSurferStore'
import { useAudioAnalyzer, type AudioAnalysis } from '~/composables/useAudioAnalyzer'
import { generateTrack } from '~/lib/bass-surfer/trackGenerator'
import type { TrackData } from '~/lib/bass-surfer/types'
import SongSelector from '~/components/bass-surfer/SongSelector.vue'
import AnalysisLoader from '~/components/bass-surfer/AnalysisLoader.vue'
import GamePlay from '~/components/bass-surfer/GamePlay.vue'

type Screen = 'home' | 'analyzing' | 'game'

const store = useBassSurferStore()
const analyzer = useAudioAnalyzer()

const screen = ref<Screen>('home')
const songTitle = ref('Unknown')
const trackData = shallowRef<TrackData | null>(null)
const audioBuffer = shallowRef<AudioBuffer | null>(null)
const audioAnalysis = shallowRef<AudioAnalysis | null>(null)
const quality = computed(() => store.quality)

async function handleFileSelect(file: File) {
  songTitle.value = file.name.replace(/\.[^/.]+$/, '')
  screen.value = 'analyzing'

  try {
    const analysis = await analyzer.analyze(file)
    audioBuffer.value = analysis.buffer
    audioAnalysis.value = analysis
    trackData.value = generateTrack(analysis)
    screen.value = 'game'
  } catch (error) {
    console.error('Analysis failed:', error)
    screen.value = 'home'
  }
}

function handleGameClose() {
  screen.value = 'home'
  trackData.value = null
  audioBuffer.value = null
  audioAnalysis.value = null
}

onUnmounted(() => {
  analyzer.dispose()
})
</script>

<template>
  <div class="w-full h-full">
    <!-- Home / Song Selection Screen -->
    <div
      v-if="screen === 'home'"
      class="relative h-screen overflow-hidden flex items-center justify-center"
    >
      <!-- Glow lines -->
      <div class="absolute bottom-0 left-0 right-0 h-px bg-cyan-500/20" />
      <div
        class="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-40 bg-gradient-to-t from-cyan-500/30 to-transparent"
      />

      <!-- Content -->
      <div class="relative z-10 w-full mx-auto max-w-3xl px-6">
        <!-- Logo -->
        <div class="mb-12 text-center">
          <h1
            class="text-6xl sm:text-8xl font-black tracking-tighter uppercase italic leading-none drop-shadow-[0_0_24px_rgba(0,200,255,0.55)]"
          >
            <span class="text-white">WAVE</span><span class="text-cyan-400">RIDER</span>
          </h1>
          <p
            class="mt-3 text-cyan-300 font-bold tracking-[0.3em] uppercase text-xs drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]"
          >
            Surf the Frequency
          </p>
        </div>

        <!-- Quality + Zen controls -->
        <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mb-8">
          <div class="flex items-center gap-2">
            <span
              class="text-white/70 text-xs uppercase tracking-widest drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]"
              >Quality</span
            >
            <button
              v-for="level in ['low', 'medium', 'high'] as const"
              :key="level"
              @click="store.quality = level"
              class="px-4 py-1.5 text-xs font-black uppercase tracking-widest border transition-all backdrop-blur-sm"
              :class="
                store.quality === level
                  ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-[0_0_16px_rgba(0,255,255,0.35)]'
                  : 'bg-black/40 border-white/25 text-white/80 hover:text-white hover:border-white/50'
              "
            >
              {{ level }}
            </button>
          </div>

          <button
            @click="store.zenMode = !store.zenMode"
            class="flex items-center gap-2 px-4 py-1.5 text-xs font-black uppercase tracking-widest border transition-all backdrop-blur-sm"
            :class="
              store.zenMode
                ? 'bg-purple-500/30 border-purple-300 text-purple-200 shadow-[0_0_16px_rgba(168,85,247,0.35)]'
                : 'bg-black/40 border-white/25 text-white/80 hover:text-white hover:border-white/50'
            "
          >
            <svg
              class="w-3 h-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <circle cx="12" cy="12" r="4" />
              <path
                d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
              />
            </svg>
            Zen
          </button>
        </div>

        <!-- Song selector -->
        <SongSelector @select-file="handleFileSelect" />

        <!-- Controls hint -->
        <p class="mt-8 text-center text-white/20 text-xs uppercase tracking-widest">
          ← / → or A / D to change lanes &nbsp;·&nbsp; Esc to pause
        </p>
      </div>

      <!-- Footer -->
      <div class="absolute bottom-4 left-0 right-0 text-center text-white/15 text-xs">
        © 2026 Jakub Skurčák &nbsp;·&nbsp; WaveRider
      </div>
    </div>

    <!-- Analysis loader -->
    <AnalysisLoader
      v-if="screen === 'analyzing'"
      :progress="analyzer.analysisProgress.value"
      :song-title="songTitle"
    />

    <!-- Game screen -->
    <Transition name="fade">
      <GamePlay
        v-if="screen === 'game' && trackData && audioBuffer && audioAnalysis"
        class="fixed inset-0"
        :track-data="trackData"
        :audio-buffer="audioBuffer"
        :analysis="audioAnalysis"
        :track-name="songTitle"
        :quality="quality"
        :zen-mode="store.zenMode"
        @close="handleGameClose"
      />
    </Transition>
  </div>
</template>

<style scoped>

</style>
