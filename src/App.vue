<script setup lang="ts">
import { ref, shallowRef, computed, onMounted, onUnmounted } from 'vue'
import { useBassSurferStore } from '~/stores/bassSurferStore'
import { useAudioAnalyzer, type AudioAnalysis } from '~/composables/useAudioAnalyzer'
import { generateTrack } from '~/lib/bass-surfer/trackGenerator'
import type { TrackData } from '~/lib/bass-surfer/types'
import SongSelector from '~/components/bass-surfer/SongSelector.vue'
import MusicBrowser from '~/components/bass-surfer/MusicBrowser.vue'
import AnalysisLoader from '~/components/bass-surfer/AnalysisLoader.vue'
import GamePlay from '~/components/bass-surfer/GamePlay.vue'
import QualityMenu from '~/components/bass-surfer/QualityMenu.vue'

type Screen = 'home' | 'analyzing' | 'game'
type SongSource = 'upload' | 'browse'

const store = useBassSurferStore()
const analyzer = useAudioAnalyzer()

const screen = ref<Screen>('home')
const songSource = ref<SongSource>('browse')
const songTitle = ref('Unknown')
const trackData = shallowRef<TrackData | null>(null)
const audioBuffer = shallowRef<AudioBuffer | null>(null)
const audioAnalysis = shallowRef<AudioAnalysis | null>(null)
const sceneSettings = computed(() => store.activeSettings)

// Intro splash: the wordmark holds centre-screen, then dissolves to reveal the
// real page (where the title shrinks into the fixed header). Plays once on load.
const introDone = ref(false)
onMounted(() => {
  setTimeout(() => (introDone.value = true), 800)
})

async function handleFileSelect(file: File, title?: string) {
  songTitle.value = title ?? file.name.replace(/\.[^/.]+$/, '')
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
    <!-- Intro splash: the wordmark holds centre-screen, then dissolves away. -->
    <Transition name="dissolve">
      <div
        v-if="!introDone"
        class="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center overflow-hidden px-6 bg-[linear-gradient(180deg,#11052a_0%,#2a0a4e_55%,#06010c_100%)]"
      >
        <!-- Soft glow behind the wordmark -->
        <div
          class="absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,45,120,0.28),transparent_70%)]"
        />
        <div class="intro-in relative text-center">
          <h1
            class="text-6xl sm:text-8xl font-black tracking-tighter uppercase italic leading-none drop-shadow-[0_0_28px_rgba(0,200,255,0.6)]"
          >
            <span class="text-white">WAVE</span><span class="text-cyan-400">RIDER</span>
          </h1>
          <p
            class="mt-3 text-cyan-300 font-bold tracking-[0.35em] uppercase text-sm drop-shadow-[0_2px_10px_rgba(0,0,0,0.9)]"
          >
            Surf the Frequency
          </p>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="screen === 'home'" class="relative h-screen overflow-hidden">
        <!-- Fixed header: the wordmark, shrunken. -->
        <header
          class="fixed inset-x-0 top-0 z-30 flex flex-col items-center gap-0.5 border-b border-cyan-500/15 bg-gradient-to-b from-[#06010c]/85 to-transparent px-6 pb-3 pt-4 backdrop-blur-sm"
        >
          <h1
            class="text-2xl sm:text-3xl font-black tracking-tighter uppercase italic leading-none drop-shadow-[0_0_16px_rgba(0,200,255,0.5)]"
          >
            <span class="text-white">WAVE</span><span class="text-cyan-400">RIDER</span>
          </h1>
          <p
            class="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
          >
            Surf the Frequency
          </p>
        </header>

        <!-- Content sits between the fixed header and footer. -->
        <div class="absolute inset-0 z-10 flex flex-col items-center px-6 pb-20 pt-24">
          <!-- Selection card fills the available height; the list scrolls inside. -->
          <div class="flex w-full max-w-2xl min-h-0 flex-1 flex-col">
            <div
              class="flex min-h-0 flex-1 flex-col rounded-2xl border border-white/10 bg-black/40 p-4 backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.45)] sm:p-5"
            >
              <!-- Source tabs (segmented) -->
              <div class="mb-4 flex shrink-0 items-center justify-center gap-2">
                <button
                  v-for="tab in (['browse', 'upload'] as const)"
                  :key="tab"
                  @click="songSource = tab"
                  class="rounded-xl px-5 py-1.5 text-xs font-black uppercase tracking-widest border transition-all backdrop-blur-sm"
                  :class="
                    songSource === tab
                      ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-[0_0_16px_rgba(0,255,255,0.35)]'
                      : 'bg-black/40 border-white/25 text-white/80 hover:text-white hover:border-white/50'
                  "
                >
                  {{ tab === 'browse' ? 'Browse Music' : 'Upload' }}
                </button>
              </div>

              <!-- Song selector (fills the card, scrolls internally) -->
              <div class="min-h-0 flex-1">
                <MusicBrowser v-if="songSource === 'browse'" @select-file="handleFileSelect" />
                <SongSelector v-else @select-file="handleFileSelect" />
              </div>
            </div>
          </div>

          <!-- Quality + Zen bar -->
          <div class="mt-4 shrink-0">
            <QualityMenu />
          </div>
        </div>

        <!-- Fixed footer -->
        <footer
          class="fixed inset-x-0 bottom-0 z-30 flex flex-col items-center gap-1 border-t border-cyan-500/15 bg-gradient-to-t from-[#06010c]/85 to-transparent px-6 pb-3 pt-2 backdrop-blur-sm"
        >
          <p class="text-center text-[11px] uppercase tracking-widest text-white/25">
            ← / → or A / D to change lanes &nbsp;·&nbsp; P to pause
          </p>
          <p class="text-center text-xs text-white/15">
            © 2026 Jakub Skurčák &nbsp;·&nbsp; WaveRider
          </p>
        </footer>
      </div>
    </Transition>

    <!-- Analysis loader -->
    <Transition name="fade">
      <AnalysisLoader
        v-if="screen === 'analyzing'"
        :progress="analyzer.analysisProgress.value"
        :song-title="songTitle"
      />
    </Transition>

    <!-- Game screen -->
    <Transition name="fade">
      <GamePlay
        v-if="screen === 'game' && trackData && audioBuffer && audioAnalysis"
        class="fixed inset-0"
        :track-data="trackData"
        :audio-buffer="audioBuffer"
        :analysis="audioAnalysis"
        :track-name="songTitle"
        :settings="sceneSettings"
        :zen-mode="store.zenMode"
        @close="handleGameClose"
      />
    </Transition>
  </div>
</template>

<style scoped>
/* Intro wordmark entrance */
.intro-in {
  animation: intro-in 1.1s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes intro-in {
  0% {
    opacity: 0;
    transform: scale(0.92);
    filter: blur(6px);
  }
  100% {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
}

/* Splash dissolves out */
.dissolve-leave-active {
  transition:
    opacity 0.8s ease,
    transform 0.8s ease,
    filter 0.8s ease;
}
.dissolve-leave-to {
  opacity: 0;
  transform: scale(1.08);
  filter: blur(10px);
}

/* Crossfade between screens (home → analyzing → game). The analyzing and game
   screens are opaque full-screen overlays, so a simple opacity fade reads as a
   smooth crossfade. */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
