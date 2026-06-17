<script setup lang="ts">
import GameOverlay from '~/components/bass-surfer/game/GameOverlay.vue'
import WaveRiderMark from '~/components/bass-surfer/game/WaveRiderMark.vue'

defineProps<{
  showDebug: boolean
  hasAnalysis: boolean
}>()
const emit = defineEmits<{
  resume: []
  restart: []
  exit: []
  toggleDebug: []
}>()
</script>

<template>
  <GameOverlay z-class="z-[9999999]">
    <WaveRiderMark class="mb-6" />

    <h2
      class="mb-6 text-4xl sm:text-5xl font-black italic uppercase tracking-[0.15em] leading-none text-white drop-shadow-[0_0_22px_rgba(0,200,255,0.6)]"
    >
      Paused
    </h2>

    <div class="flex flex-col gap-3">
      <button
        @click="emit('resume')"
        class="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3.5 text-xl font-black uppercase tracking-widest text-white shadow-[0_0_24px_rgba(0,200,255,0.4)] transition-transform hover:scale-[1.03]"
      >
        Resume
      </button>
      <button
        @click="emit('restart')"
        class="w-full rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 py-3 font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(255,0,255,0.35)] transition-transform hover:scale-[1.03]"
      >
        Restart
      </button>
      <button
        @click="emit('exit')"
        class="w-full rounded-xl border border-white/15 py-2.5 font-bold uppercase tracking-widest text-white/55 transition-all hover:border-white/40 hover:text-white"
      >
        Exit
      </button>
    </div>

    <button
      v-if="hasAnalysis"
      @click="emit('toggleDebug')"
      class="mt-5 rounded-lg border px-3 py-1 text-[11px] font-bold uppercase tracking-widest transition-all"
      :class="
        showDebug
          ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
          : 'border-white/15 text-white/40 hover:text-cyan-400'
      "
    >
      Debug {{ showDebug ? 'On' : 'Off' }}
    </button>
  </GameOverlay>
</template>
