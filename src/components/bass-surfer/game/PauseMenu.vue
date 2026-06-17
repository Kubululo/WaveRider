<script setup lang="ts">
import { FrostedGlass } from '~/components/ui/frosted-glass'

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
  <div
    class="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-[9999999]"
  >
    <FrostedGlass
      container-class="relative z-50 w-[min(90vw,400px)]"
      class="flex flex-col items-center gap-4 border border-white/10 p-8"
      position="relative"
    >
      <h2 class="text-4xl font-black text-white italic tracking-widest mb-4 -skew-x-6">PAUSED</h2>
      <button
        @click="emit('resume')"
        class="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black text-xl uppercase tracking-widest hover:scale-105 transition-transform"
      >
        RESUME
      </button>
      <button
        @click="emit('restart')"
        class="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-xl uppercase tracking-widest hover:scale-105 transition-transform"
      >
        RESTART
      </button>
      <button
        @click="emit('exit')"
        class="w-full py-3 border border-white/20 text-white/70 font-bold text-lg uppercase tracking-widest hover:text-white hover:border-white/40 transition-all"
      >
        EXIT
      </button>
      <button
        v-if="hasAnalysis"
        @click="emit('toggleDebug')"
        class="mt-2 text-xs px-3 py-1 border font-bold uppercase transition-all"
        :class="
          showDebug
            ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
            : 'border-gray-700 text-gray-500 hover:text-cyan-400'
        "
      >
        DEBUG {{ showDebug ? 'ON' : 'OFF' }}
      </button>
    </FrostedGlass>
  </div>
</template>
