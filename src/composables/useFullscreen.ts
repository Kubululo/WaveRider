import { onMounted, onUnmounted, ref } from 'vue'

// Minimal vendor-prefixed shapes for Safari (iPad / older WebKit).
interface FsDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
}
interface FsElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

/**
 * Thin wrapper over the Fullscreen API with a WebKit fallback and a reactive
 * `isFullscreen` flag. Note: iPhone Safari does not implement the Fullscreen
 * API at all, so `isSupported` is false there.
 */
export function useFullscreen() {
  const isFullscreen = ref(false)

  const doc = (typeof document !== 'undefined' ? document : undefined) as FsDocument | undefined
  const root = doc?.documentElement as FsElement | undefined
  const isSupported =
    !!root && (root.requestFullscreen != null || root.webkitRequestFullscreen != null)

  function currentElement(): Element | null {
    if (!doc) return null
    return doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null
  }

  function update() {
    isFullscreen.value = currentElement() != null
  }

  async function enter(el: HTMLElement = document.documentElement) {
    const e = el as FsElement
    try {
      if (e.requestFullscreen) await e.requestFullscreen()
      else if (e.webkitRequestFullscreen) await e.webkitRequestFullscreen()
    } catch {
      /* user denied or not allowed without a gesture */
    }
  }

  async function exit() {
    if (!doc) return
    try {
      if (doc.exitFullscreen) await doc.exitFullscreen()
      else if (doc.webkitExitFullscreen) await doc.webkitExitFullscreen()
    } catch {
      /* ignore */
    }
  }

  async function toggle() {
    if (currentElement()) await exit()
    else await enter()
  }

  onMounted(() => {
    document.addEventListener('fullscreenchange', update)
    document.addEventListener('webkitfullscreenchange', update)
    update()
  })
  onUnmounted(() => {
    document.removeEventListener('fullscreenchange', update)
    document.removeEventListener('webkitfullscreenchange', update)
  })

  return { isFullscreen, isSupported, enter, exit, toggle }
}
