<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBassSurferStore, type QualityLevel } from '~/stores/bassSurferStore'
import type { SceneSettings } from '~/lib/bass-surfer/sceneGenerator'

const store = useBassSurferStore()

const levels: QualityLevel[] = ['low', 'medium', 'high', 'custom']

// The Custom graphics editor opens as a modal overlay so it never grows the
// page — picking "custom" opens it; other presets close it.
const customOpen = ref(false)
function pickQuality(level: QualityLevel) {
  store.selectQuality(level)
  customOpen.value = level === 'custom'
}

// Only the numeric SceneSettings fields are exposed as sliders.
type NumericKey =
  | 'pixelRatio'
  | 'renderDistance'
  | 'palmCount'
  | 'palmSpacing'
  | 'pyramidCount'
  | 'pyramidInstances'

interface SliderDef {
  key: NumericKey
  label: string
  min: number
  max: number
  step: number
  format?: (v: number) => string
}

const sliders: SliderDef[] = [
  {
    key: 'pixelRatio',
    label: 'Supersampling',
    min: 0.5,
    max: 4,
    step: 0.05,
    format: (v) => `${v.toFixed(2)}×`,
  },
  { key: 'renderDistance', label: 'Render Distance', min: 400, max: 2000, step: 50 },
  { key: 'palmCount', label: 'Palm Trees', min: 0, max: 60, step: 1 },
  { key: 'palmSpacing', label: 'Palm Spacing', min: 10, max: 60, step: 1 },
  { key: 'pyramidCount', label: 'Pyramid Clusters', min: 0, max: 120, step: 1 },
  { key: 'pyramidInstances', label: 'Pyramids / Cluster', min: 0, max: 20, step: 1 },
]

interface ToggleDef {
  key: 'bloomEnabled' | 'scanlineEnabled'
  label: string
}

const toggles: ToggleDef[] = [
  { key: 'bloomEnabled', label: 'Bloom' },
  { key: 'scanlineEnabled', label: 'Scanlines' },
]

const settings = computed<SceneSettings>(() => store.customSettings)

function sliderPct(s: SliderDef): number {
  return ((settings.value[s.key] - s.min) / (s.max - s.min)) * 100
}
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <!-- Preset + Zen row -->
    <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
      <div class="flex items-center gap-2">
        <span
          class="text-white/70 text-xs uppercase tracking-widest drop-shadow-[0_1px_6px_rgba(0,0,0,0.9)]"
          >Quality</span
        >
        <button
          v-for="level in levels"
          :key="level"
          @click="pickQuality(level)"
          class="rounded-xl px-4 py-1.5 text-xs font-black uppercase tracking-widest border transition-all backdrop-blur-sm"
          :class="
            store.quality === level
              ? 'bg-cyan-500/30 border-cyan-400 text-cyan-200 shadow-[0_0_16px_rgba(0,255,255,0.35)]'
              : 'bg-black/40 border-white/25 text-white/80 hover:text-white hover:border-white/50'
          "
        >
          {{ level }}
        </button>
      </div>

      <button
        @click="store.zenMode = !store.zenMode"
        class="flex items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-black uppercase tracking-widest border transition-all backdrop-blur-sm"
        :class="
          store.zenMode
            ? 'bg-purple-500/30 border-purple-300 text-purple-200 shadow-[0_0_16px_rgba(168,85,247,0.35)]'
            : 'bg-black/40 border-white/25 text-white/80 hover:text-white hover:border-white/50'
        "
      >
        <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <circle cx="12" cy="12" r="4" />
          <path
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
        Zen
      </button>
    </div>

    <!-- Custom controls — modal overlay (Teleported to body so it floats above
         the single-screen layout instead of growing the page). -->
    <Teleport to="body">
      <Transition name="custom-fade">
        <div
          v-if="customOpen && store.quality === 'custom'"
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="customOpen = false" />

          <!-- Panel -->
          <div
            class="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-cyan-500/25 bg-black/80 p-5 shadow-[0_0_40px_rgba(0,0,0,0.6)] backdrop-blur-md"
          >
            <div
              class="mb-4 flex items-center justify-between border-b border-cyan-500/20 pb-2"
            >
              <h3 class="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-300/90">
                Custom Graphics
              </h3>
              <button
                @click="customOpen = false"
                aria-label="Close custom graphics"
                class="-mr-1 flex h-6 w-6 items-center justify-center rounded-lg text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path stroke-linecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <!-- Sliders -->
            <div class="flex flex-col gap-4">
          <label v-for="s in sliders" :key="s.key" class="block">
            <div
              class="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider"
            >
              <span class="text-white/70">{{ s.label }}</span>
              <span class="font-mono text-cyan-300 tabular-nums">
                {{ s.format ? s.format(settings[s.key]) : settings[s.key] }}
              </span>
            </div>
            <input
              type="range"
              :min="s.min"
              :max="s.max"
              :step="s.step"
              v-model.number="settings[s.key]"
              class="quality-slider w-full"
              :style="{ '--pct': sliderPct(s) + '%' }"
            />
          </label>
        </div>

        <!-- Effect toggles -->
        <div class="mt-5 flex flex-wrap gap-2 border-t border-cyan-500/20 pt-4">
          <button
            v-for="t in toggles"
            :key="t.key"
            @click="settings[t.key] = !settings[t.key]"
            class="rounded-xl px-3 py-1.5 text-[11px] font-black uppercase tracking-widest border transition-all"
            :class="
              settings[t.key]
                ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
                : 'bg-black/40 border-white/20 text-white/50 hover:text-white/80'
            "
          >
            {{ t.label }} {{ settings[t.key] ? 'On' : 'Off' }}
          </button>

          <!-- Scanline intensity, only relevant when scanlines are on -->
          <label
            v-if="settings.scanlineEnabled"
            class="flex items-center gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60"
          >
            <span>Scanline</span>
            <input
              type="range"
              min="0"
              max="0.2"
              step="0.01"
              v-model.number="settings.scanlineOpacity"
              class="quality-slider w-24"
              :style="{ '--pct': (settings.scanlineOpacity / 0.2) * 100 + '%' }"
            />
          </label>
        </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.quality-slider {
  -webkit-appearance: none;
  appearance: none;
  height: 4px;
  border-radius: 9999px;
  background: linear-gradient(
    to right,
    rgb(34 211 238) var(--pct, 0%),
    rgba(255, 255, 255, 0.12) var(--pct, 0%)
  );
  cursor: pointer;
  outline: none;
}

.quality-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: rgb(165 243 252);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
  border: none;
}

.quality-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 9999px;
  background: rgb(165 243 252);
  box-shadow: 0 0 8px rgba(0, 255, 255, 0.6);
  border: none;
}

.custom-fade-enter-active,
.custom-fade-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.custom-fade-enter-from,
.custom-fade-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
