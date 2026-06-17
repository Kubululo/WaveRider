<script setup lang="ts">
import type { GameScore } from '~/lib/bass-surfer/types'
import IconShare from '~icons/lucide/share'
import GameOverlay from '~/components/bass-surfer/game/GameOverlay.vue'
import WaveRiderMark from '~/components/bass-surfer/game/WaveRiderMark.vue'

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
  <GameOverlay solid>
    <WaveRiderMark class="mb-6" />

    <h2
      class="mb-5 text-4xl sm:text-5xl font-black italic uppercase tracking-[0.15em] leading-none drop-shadow-[0_0_22px_rgba(0,200,255,0.6)]"
      :class="gameEnded ? 'text-cyan-300' : 'text-white'"
    >
      {{ gameEnded ? 'FINISH' : 'READY' }}
    </h2>

    <!-- Finish: score + stat pills -->
    <div v-if="gameEnded" class="mb-7">
      <div
        class="text-yellow-400 text-6xl font-black italic tabular-nums leading-none drop-shadow-[0_0_18px_rgba(255,200,0,0.55)]"
      >
        {{ score.score.toLocaleString() }}
      </div>
      <div class="mt-1 text-[11px] font-bold uppercase tracking-[0.3em] text-white/40">
        Final Score
      </div>

      <div class="mt-5 flex items-center justify-center gap-2.5">
        <span
          class="rounded-full border border-pink-400/50 bg-pink-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-pink-300"
        >
          Max Combo <span class="ml-1 font-mono text-white">{{ score.maxCombo }}×</span>
        </span>
        <span
          v-if="!zenMode"
          class="rounded-full border border-cyan-400/50 bg-cyan-500/10 px-4 py-1.5 text-xs font-black uppercase tracking-wider text-cyan-300"
        >
          Orbs
          <span class="ml-1 font-mono text-white"
            >{{ score.collectiblesHit }}/{{ score.collectiblesTotal }}</span
          >
        </span>
      </div>
    </div>

    <!-- Start: track name -->
    <div
      v-else
      class="mb-7 truncate text-sm font-bold uppercase tracking-[0.2em] text-cyan-400/70"
    >
      {{ trackName || 'UNKNOWN' }}
    </div>

    <!-- Actions -->
    <div class="flex flex-col gap-3">
      <button
        @click="emit('start')"
        class="pointer-events-auto w-full rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 py-3.5 text-xl font-black uppercase tracking-widest text-white shadow-[0_0_28px_rgba(255,0,255,0.45)] transition-transform hover:scale-[1.03]"
      >
        {{ gameEnded ? 'Restart' : 'Start' }}
      </button>

      <button
        v-if="gameEnded"
        @click="emit('share')"
        class="pointer-events-auto flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/60 bg-cyan-500/15 py-3 font-black uppercase tracking-widest text-cyan-200 shadow-[0_0_16px_rgba(0,255,255,0.25)] transition-all hover:bg-cyan-500/25 hover:border-cyan-300"
      >
        <IconShare class="h-5 w-5" />
        Share Score
      </button>

      <button
        @click="emit('close')"
        class="pointer-events-auto w-full rounded-xl border border-white/15 py-2.5 font-bold uppercase tracking-widest text-white/55 transition-all hover:border-white/40 hover:text-white"
      >
        {{ gameEnded ? 'Back to Menu' : 'Back' }}
      </button>
    </div>
  </GameOverlay>
</template>
