import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { RetrowaveScene, type SceneSettings } from '~/lib/bass-surfer/sceneGenerator'

export type QualityLevel = 'low' | 'medium' | 'high' | 'custom'

export const useBassSurferStore = defineStore('bassSurfer', () => {
  const selectedFile = shallowRef<File | null>(null)
  const quality = ref<QualityLevel>('high')
  const zenMode = ref(false)

  // Custom mode starts as a copy of the High preset so tweaking begins from the
  // best-looking baseline. selectQuality() reseeds it from whichever preset was
  // active when the user switches into custom.
  const customSettings = ref<SceneSettings>({ ...RetrowaveScene.qualityPresets.high })

  // The settings actually handed to the scene: a named preset, or the custom set.
  const activeSettings = computed<SceneSettings>(() =>
    quality.value === 'custom'
      ? customSettings.value
      : RetrowaveScene.qualityPresets[quality.value]
  )

  function selectQuality(level: QualityLevel) {
    if (level === 'custom' && quality.value !== 'custom') {
      customSettings.value = { ...RetrowaveScene.qualityPresets[quality.value] }
    }
    quality.value = level
  }

  return { selectedFile, quality, zenMode, customSettings, activeSettings, selectQuality }
})
