<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  progress: number
  songTitle: string
}>()

const statusText = computed(() => {
  if (props.progress < 0.5) return 'Analyzing audio...'
  if (props.progress < 0.9) return 'Generating track...'
  return 'Preparing...'
})

const pct = computed(() => Math.round(props.progress * 100))
</script>

<template>
  <div class="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90">
    <div class="flex flex-col items-center gap-6 px-6 text-center">
      <h2 class="text-2xl font-bold text-white">{{ songTitle }}</h2>

      <!-- Progress bar -->
      <div class="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
        <div
          class="h-full rounded-full bg-linear-to-r from-cyan-500 to-purple-500 transition-all duration-300"
          :style="{ width: `${pct}%` }"
        />
      </div>

      <p class="text-sm text-white/50">{{ statusText }}</p>

      <!-- Animated dots -->
      <div class="flex gap-1.5">
        <div
          v-for="i in 3"
          :key="i"
          class="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"
          :style="{ animationDelay: `${i * 200}ms` }"
        />
      </div>
    </div>
  </div>
</template>
