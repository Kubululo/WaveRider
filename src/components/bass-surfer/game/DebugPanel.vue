<script setup lang="ts">
import type { DebugEntry } from '~/composables/useGameEngine'

defineProps<{
  entries: DebugEntry[]
  fps: number
  driver: string
}>()
</script>

<template>
  <div
    class="absolute bottom-20 right-4 z-40 p-4 bg-black/90 backdrop-blur-md border border-cyan-500/30 rounded-lg w-72 shadow-[0_0_20px_rgba(0,0,0,0.8)] pointer-events-none"
  >
    <h3
      class="text-cyan-400 font-bold text-xs uppercase mb-4 tracking-[0.2em] border-b border-cyan-500/30 pb-2 flex justify-between"
    >
      <span>Analysis Stream</span>
      <span class="text-cyan-600 animate-pulse">● LIVE</span>
    </h3>
    <div class="space-y-3 text-[10px] font-bold tracking-wider">
      <div class="flex justify-between text-gray-400 uppercase">
        <span>FPS</span>
        <span class="font-mono text-white">{{ fps }}</span>
      </div>
      <div v-for="entry in entries" :key="entry.key" class="flex flex-col gap-1">
        <div class="flex justify-between text-gray-400 uppercase">
          <span>{{ entry.key }}</span>
          <span class="font-mono text-white">{{ entry.value.toFixed(4) }}</span>
        </div>
        <div
          class="h-1.5 w-full rounded-full overflow-hidden"
          style="background: rgba(255, 255, 255, 0.06)"
        >
          <div
            class="h-full transition-all duration-75"
            :style="{ width: `${entry.pct}%`, backgroundColor: entry.color }"
          />
        </div>
      </div>
      <div
        v-if="driver"
        class="flex justify-between items-center uppercase pt-2 border-t border-cyan-500/30"
      >
        <span class="text-gray-400">Driven by</span>
        <div class="flex gap-3 font-mono">
          <span
            class="transition-colors duration-150"
            :class="driver === 'MIDS' ? 'text-orange-400' : 'text-gray-600'"
            >MIDS</span
          >
          <span
            class="transition-colors duration-150"
            :class="driver === 'HIGHS' ? 'text-green-400' : 'text-gray-600'"
            >HIGHS</span
          >
        </div>
      </div>
    </div>
  </div>
</template>
