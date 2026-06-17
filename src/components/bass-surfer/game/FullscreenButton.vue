<script setup lang="ts">
import IconMaximize from '~icons/lucide/maximize'
import IconMinimize from '~icons/lucide/minimize'

defineProps<{ isFullscreen: boolean }>()
defineEmits<{ toggle: [] }>()
</script>

<template>
  <!-- A faint corner ghost that brightens on hover (desktop only; mobile
       force-enters fullscreen on load instead). -->
  <button
    @click="$emit('toggle')"
    :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
    :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
    class="absolute right-3 top-3 z-[9999998] flex h-8 w-8 items-center justify-center rounded-lg text-white/80 opacity-25 transition-all duration-200 hover:bg-white/5 hover:text-cyan-200 hover:opacity-100"
  >
    <IconMaximize v-if="!isFullscreen" class="h-4 w-4" />
    <IconMinimize v-else class="h-4 w-4" />
  </button>
</template>
