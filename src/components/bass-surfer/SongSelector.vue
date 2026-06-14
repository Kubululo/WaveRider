<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{
  selectFile: [file: File]
}>()

const isDragging = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

const ACCEPTED = 'audio/*'
const MAX_SIZE = 20 * 1024 * 1024 // 20MB

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false

  const file = e.dataTransfer?.files[0]
  if (file) processFile(file)
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) processFile(file)
}

function processFile(file: File) {
  if (!file.type.startsWith('audio/')) {
    alert('Please select an audio file')
    return
  }
  if (file.size > MAX_SIZE) {
    alert('File too large (max 20 MB)')
    return
  }
  emit('selectFile', file)
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div>
      <h2 class="mb-4 text-lg font-semibold text-white/80">Upload a Song</h2>
      <div
        class="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer"
        :class="
          isDragging
            ? 'border-cyan-400 bg-cyan-400/5'
            : 'border-white/15 hover:border-white/30 bg-white/5'
        "
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="fileInput?.click()"
      >
        <svg
          class="h-10 w-10 text-white/30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15m0-3-3-3m0 0-3 3m3-3V15"
          />
        </svg>
        <p class="text-sm text-white/50">
          Drag & drop an audio file or <span class="text-cyan-400 underline">browse</span>
        </p>
        <p class="text-xs text-white/30">MP3, WAV, OGG, FLAC, M4A — max 20 MB</p>
        <input
          ref="fileInput"
          type="file"
          :accept="ACCEPTED"
          class="hidden"
          @change="handleFileSelect"
        />
      </div>
    </div>
  </div>
</template>
