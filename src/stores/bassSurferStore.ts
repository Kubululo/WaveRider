import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'

export const useBassSurferStore = defineStore('bassSurfer', () => {
  const selectedFile = shallowRef<File | null>(null)
  const quality = ref<'low' | 'medium' | 'high'>('high')
  const zenMode = ref(false)

  return { selectedFile, quality, zenMode }
})
