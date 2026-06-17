import { onMounted, onUnmounted, ref } from 'vue'
import { useFullscreen } from '~/composables/useFullscreen'

/**
 * Drives the "lean-back" playable presentation: detects the device class,
 * tracks orientation, and on phones pushes the page into fullscreen + landscape
 * as soon as gameplay loads. Owns its own listeners and teardown.
 *
 *  - `isTouchDevice` is broad (any touch input) and only gates the optional
 *    touch lane controls.
 *  - `isMobile` is the stricter "phone/tablet" test — coarse pointer with no
 *    hover — used to decide whether to force fullscreen + landscape. A
 *    touchscreen laptop has a trackpad (hover + fine pointer) so it stays
 *    desktop.
 */
export function useImmersiveMode() {
  const isTouchDevice = ref(false)
  const isMobile = ref(false)
  const isPortrait = ref(false)

  const {
    isFullscreen,
    isSupported: fullscreenSupported,
    enter: enterFullscreen,
    toggle: toggleFullscreen,
  } = useFullscreen()

  function updateOrientation() {
    isPortrait.value =
      typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches
  }

  async function lockLandscape() {
    // Android Chrome supports this (needs fullscreen + a gesture); on iOS it's a
    // no-op and the rotate-device overlay is the fallback.
    const orientation = window.screen.orientation as ScreenOrientation & {
      lock?: (o: 'landscape' | 'portrait' | 'natural' | 'any') => Promise<void>
    }
    try {
      await orientation?.lock?.('landscape')
    } catch {
      /* unsupported / not allowed */
    }
  }

  async function goImmersive() {
    await enterFullscreen(document.documentElement)
    await lockLandscape()
  }

  // Fallback: requesting fullscreen on mount can be blocked if the transient
  // user activation from track selection expired during loading. If so, the
  // first tap anywhere on the scene completes it.
  function onImmersiveGesture() {
    if (isMobile.value && !isFullscreen.value) void goImmersive()
  }

  onMounted(() => {
    isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    isMobile.value = window.matchMedia('(hover: none) and (pointer: coarse)').matches

    updateOrientation()
    window.addEventListener('resize', updateOrientation)
    window.addEventListener('orientationchange', updateOrientation)

    // Phones go immersive as soon as the gameplay scene loads — fullscreen (hides
    // the URL bar) + landscape lock — without waiting for START.
    if (isMobile.value) {
      setTimeout(() => window.scrollTo(0, 1), 150)
      void goImmersive()
      window.addEventListener('pointerdown', onImmersiveGesture, { once: true })
    }
  })

  onUnmounted(() => {
    window.removeEventListener('resize', updateOrientation)
    window.removeEventListener('orientationchange', updateOrientation)
    window.removeEventListener('pointerdown', onImmersiveGesture)
    try {
      window.screen.orientation.unlock()
    } catch {
      /* unsupported */
    }
  })

  return {
    isTouchDevice,
    isMobile,
    isPortrait,
    isFullscreen,
    fullscreenSupported,
    toggleFullscreen,
    goImmersive,
  }
}
