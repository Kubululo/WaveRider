<script setup lang="ts">
import { computed, ref } from 'vue'
import IconChevronDown from '~icons/lucide/chevron-down'

export interface DropdownOption {
  value: string | null
  label: string
}

const props = defineProps<{
  modelValue: string | null
  options: DropdownOption[]
  label?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const open = ref(false)

const currentLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? props.options[0]?.label
)

function select(value: string | null) {
  open.value = false
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="flex items-center gap-2">
    <span v-if="label" class="text-[11px] font-bold uppercase tracking-widest text-white/40">{{
      label
    }}</span>
    <div class="relative inline-flex">
      <button
        @click="open = !open"
        class="flex min-w-[9rem] items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all"
        :class="
          open
            ? 'bg-cyan-500/25 border-cyan-400 text-cyan-200'
            : 'bg-black/40 border-white/20 text-white/70 hover:text-white hover:border-white/40'
        "
      >
        <span>{{ currentLabel }}</span>
        <IconChevronDown
          class="h-3 w-3 shrink-0 transition-transform"
          :class="open ? 'rotate-180' : ''"
        />
      </button>

      <!-- Backdrop closes on outside click -->
      <div v-if="open" class="fixed inset-0 z-40" @click="open = false" />

      <!-- Panel -->
      <div
        v-if="open"
        class="dropdown-scroll absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-[9rem] overflow-y-auto rounded-xl border border-cyan-500/30 bg-black/95 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.6)] backdrop-blur-md"
      >
        <button
          v-for="opt in options"
          :key="opt.value ?? '__null'"
          @click="select(opt.value)"
          class="block w-full px-3 py-1.5 text-left text-[11px] font-bold uppercase tracking-wider transition-colors"
          :class="
            opt.value === modelValue
              ? 'bg-cyan-500/20 text-cyan-200'
              : 'text-white/60 hover:bg-white/5 hover:text-white'
          "
        >
          {{ opt.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dropdown-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(34, 211, 238, 0.4) transparent;
}

.dropdown-scroll::-webkit-scrollbar {
  width: 6px;
}

.dropdown-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.dropdown-scroll::-webkit-scrollbar-thumb {
  background: rgba(34, 211, 238, 0.35);
  border-radius: 9999px;
}

.dropdown-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 211, 238, 0.65);
}
</style>
