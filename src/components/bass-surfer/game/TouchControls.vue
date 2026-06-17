<script setup lang="ts">
import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'

defineProps<{ touchFlash: 'left' | 'right' | null }>()
const emit = defineEmits<{ move: [delta: -1 | 1] }>()
</script>

<template>
  <!-- Left / right tap zones for lane changes on touch devices. -->
  <div
    class="absolute left-0 top-0 bottom-20 w-1/2 z-[99999] flex items-center justify-start pl-4"
    @touchstart.prevent="emit('move', -1)"
  >
    <IconChevronLeft
      class="w-8 h-8 text-white transition-opacity duration-150"
      :class="touchFlash === 'left' ? 'opacity-40' : 'opacity-0'"
    />
  </div>
  <div
    class="absolute right-0 top-0 bottom-20 w-1/2 z-[99999] flex items-center justify-end pr-4"
    @touchstart.prevent="emit('move', 1)"
  >
    <IconChevronRight
      class="w-8 h-8 text-white transition-opacity duration-150"
      :class="touchFlash === 'right' ? 'opacity-40' : 'opacity-0'"
    />
  </div>
</template>
