<script setup lang="ts">
import type { GameScore } from '~/lib/bass-surfer/types'
import { FrostedGlass } from '~/components/ui/frosted-glass'

defineProps<{
  currentTimeDisplay: string
  trackName?: string
  score: GameScore
  displayScore: number
}>()
const emit = defineEmits<{ pause: [] }>()
</script>

<template>
  <FrostedGlass
    container-class="fixed bottom-4 z-[90] h-14 max-w-4xl w-full left-1/2 -translate-x-1/2"
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
        @click="emit('pause')"
        @touchstart.prevent="emit('pause')"
        aria-label="Pause"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="4" width="4" height="16" rx="1" />
          <rect x="14" y="4" width="4" height="16" rx="1" />
        </svg>
      </button>
    </div>
  </FrostedGlass>
</template>
