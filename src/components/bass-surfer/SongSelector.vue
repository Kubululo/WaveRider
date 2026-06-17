<script setup lang="ts">
import { ref } from 'vue'
import IconUpload from '~icons/lucide/upload'

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
  <div class="flex h-full flex-col">
    <div
      class="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer"
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
      <IconUpload class="h-10 w-10 text-white/30" />
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
</template>
