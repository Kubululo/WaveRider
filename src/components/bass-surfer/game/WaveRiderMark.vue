<script setup lang="ts">
// The WAVE·RIDER wordmark, matching App.vue's header / intro splash treatment.
withDefaults(defineProps<{ size?: 'sm' | 'lg'; tagline?: boolean }>(), {
  size: 'sm',
  tagline: true,
})
</script>

<template>
  <div class="text-center">
    <h1
      class="font-black tracking-tighter uppercase italic leading-none drop-shadow-[0_0_20px_rgba(0,200,255,0.55)]"
      :class="size === 'lg' ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'"
    >
      <span class="text-white">WAVE</span><span class="text-cyan-400">RIDER</span>
    </h1>
    <p
      v-if="tagline"
      class="mt-1.5 text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-300/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.9)]"
    >
      Surf the Frequency
    </p>
  </div>
</template>
