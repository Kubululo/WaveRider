<script setup lang="ts">
// Pre-roll 3-2-1 shown over the (frozen) scene before play begins / resumes.
defineProps<{ count: number }>()
</script>

<template>
  <div class="pointer-events-none absolute inset-0 z-[9999999] flex items-center justify-center">
    <!-- Soft pink glow, matching the overlay family -->
    <div
      class="absolute left-1/2 top-1/2 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(255,45,120,0.18),transparent_70%)]"
    />
    <div
      :key="count"
      class="countdown-pop text-[10rem] sm:text-[14rem] font-black italic leading-none text-white drop-shadow-[0_0_45px_rgba(0,200,255,0.7)]"
    >
      {{ count }}
    </div>
  </div>
</template>

<style scoped>
.countdown-pop {
  animation: countdown-pop 1s cubic-bezier(0.22, 1, 0.36, 1) both;
}
@keyframes countdown-pop {
  0% {
    opacity: 0;
    transform: scale(1.6);
    filter: blur(8px);
  }
  30% {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
  100% {
    opacity: 0.15;
    transform: scale(0.86);
  }
}
</style>
