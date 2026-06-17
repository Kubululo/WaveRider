<script setup lang="ts">
// Forces a landscape experience on touch devices even where orientation lock is
// unavailable (iOS). Purely presentational; the host decides when to show it.
</script>

<template>
  <div
    class="absolute inset-0 z-[99999999] flex flex-col items-center justify-center gap-5 bg-[#06010c] px-8 text-center"
  >
    <svg
      class="h-16 w-16 animate-pulse text-cyan-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" />
      <path stroke-linecap="round" d="M2 12a10 10 0 0 0 10 10M22 12A10 10 0 0 0 12 2" opacity="0.5" />
    </svg>
    <div>
      <p class="text-lg font-black uppercase tracking-widest text-white">Rotate your device</p>
      <p class="mt-2 text-sm text-white/50">WaveRider is best played in landscape.</p>
    </div>
  </div>
</template>
