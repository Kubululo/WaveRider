<script setup lang="ts">
import { computed } from 'vue'
import WaveRiderMark from '~/components/bass-surfer/game/WaveRiderMark.vue'

const props = defineProps<{
  progress: number
  songTitle: string
}>()

const statusText = computed(() => {
  if (props.progress < 0.68) return 'Analyzing audio...'
  if (props.progress < 0.99) return 'Generating track...'
  return 'Ready'
})

const pct = computed(() => Math.round(props.progress * 100))
</script>

<template>
  <!-- The "page intro": deep-purple gradient + WAVE·RIDER wordmark, shared with
       the start menu so the look is continuous from analysis through to Start. -->
  <div
    class="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden px-6 bg-[linear-gradient(180deg,#11052a_0%,#2a0a4e_55%,#06010c_100%)]"
  >
    <!-- Soft pink glow behind the wordmark -->
    <div
      class="pointer-events-none absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,45,120,0.22),transparent_70%)]"
    />

    <div class="relative flex flex-col items-center gap-7 text-center">
      <WaveRiderMark size="lg" />

      <p class="max-w-sm truncate text-sm font-bold uppercase tracking-[0.2em] text-cyan-400/70">
        {{ songTitle }}
      </p>

      <!-- Progress bar -->
      <div class="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
        <div
          class="h-full rounded-full bg-linear-to-r from-cyan-500 to-purple-500 transition-all duration-300"
          :style="{ width: `${pct}%` }"
        />
      </div>

      <p class="text-sm text-white/50">{{ statusText }}</p>
    </div>
  </div>
</template>
