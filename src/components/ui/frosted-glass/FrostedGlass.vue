<script setup lang="ts">
import type { HTMLAttributes } from 'vue'

const props = withDefaults(
  defineProps<{
    position?: 'fixed' | 'relative' | 'absolute'
    class?: HTMLAttributes['class']
    containerClass?: HTMLAttributes['class']
  }>(),
  { position: 'fixed' }
)
</script>

<template>
  <div :class="props.containerClass" :style="{ position: props.position }">
    <div
      :class="[props.class, 'rounded-2xl border border-white/6 bg-white/2 backdrop-blur-md']"
      class="size-full"
    >
      <slot />
    </div>
  </div>
</template>
