<script setup lang="ts">
// Shared full-screen overlay for the start / pause / end screens: App.vue's
// deep-purple gradient + soft pink glow behind a frosted, animated card. The
// gradient is slightly translucent so the live scene stays faintly visible.
withDefaults(defineProps<{ zClass?: string }>(), { zClass: 'z-50' })
</script>

<template>
  <div
    class="absolute inset-0 flex items-center justify-center overflow-hidden px-6 backdrop-blur-md bg-[linear-gradient(180deg,rgba(17,5,42,0.94)_0%,rgba(42,10,78,0.88)_55%,rgba(6,1,12,0.96)_100%)]"
    :class="zClass"
  >
    <!-- Soft pink glow behind the card -->
    <div
      class="pointer-events-none absolute left-1/2 top-1/2 h-[60vh] w-[60vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,45,120,0.22),transparent_70%)]"
    />
    <div
      class="overlay-card relative w-[min(92vw,440px)] rounded-2xl border border-white/10 bg-black/40 p-8 backdrop-blur-md shadow-[0_8px_40px_rgba(0,0,0,0.45)] text-center"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.overlay-card {
  animation: overlay-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes overlay-in {
  0% {
    opacity: 0;
    transform: scale(0.94) translateY(10px);
    filter: blur(5px);
  }
  100% {
    opacity: 1;
    transform: none;
    filter: blur(0);
  }
}
</style>
