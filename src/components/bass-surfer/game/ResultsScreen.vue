<script setup lang="ts">
import type { GameScore } from '~/lib/bass-surfer/types'
import IconShare from '~icons/lucide/share'

defineProps<{
  gameEnded: boolean
  score: GameScore
  trackName?: string
  zenMode?: boolean
}>()
const emit = defineEmits<{
  start: []
  share: []
  close: []
}>()
</script>

<template>
  <div class="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50">
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
        <div class="flex items-center justify-center gap-6 text-sm font-bold uppercase tracking-wider">
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
        @click="emit('start')"
        class="pointer-events-auto px-12 py-4 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-3xl uppercase tracking-widest transform -skew-x-12 hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,0,255,0.6)]"
      >
        <span class="skew-x-12 block">{{ gameEnded ? 'RESTART' : 'START' }}</span>
      </button>

      <button
        v-if="gameEnded"
        @click="emit('share')"
        class="pointer-events-auto mt-4 mx-auto flex items-center gap-2 px-8 py-3 bg-cyan-500/15 border border-cyan-400/60 text-cyan-200 font-black uppercase tracking-widest hover:bg-cyan-500/25 hover:border-cyan-300 transition-all shadow-[0_0_20px_rgba(0,255,255,0.25)]"
      >
        <IconShare class="h-5 w-5" />
        Share Score
      </button>

      <button
        @click="emit('close')"
        class="pointer-events-auto mt-4 block mx-auto px-8 py-2 border border-white/20 text-white/60 font-bold uppercase tracking-widest hover:text-white hover:border-white/40 transition-all"
      >
        {{ gameEnded ? 'BACK TO MENU' : 'BACK' }}
      </button>
    </div>
  </div>
</template>
