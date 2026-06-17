<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import type { TrackData, GameScore } from '~/lib/bass-surfer/types'
import { RetrowaveScene, LANE_WIDTH, type SceneSettings } from '~/lib/bass-surfer/sceneGenerator'
import { FrostedGlass } from '~/components/ui/frosted-glass'
import type { AudioAnalysis } from '~/composables/useAudioAnalyzer'
import { useFullscreen } from '~/composables/useFullscreen'
import IconX from '~icons/simple-icons/x'
import IconTelegram from '~icons/simple-icons/telegram'
import IconWhatsapp from '~icons/simple-icons/whatsapp'
import IconFacebook from '~icons/simple-icons/facebook'
import IconReddit from '~icons/simple-icons/reddit'
import IconDiscord from '~icons/simple-icons/discord'
import IconInstagram from '~icons/simple-icons/instagram'
import IconMaximize from '~icons/lucide/maximize'
import IconMinimize from '~icons/lucide/minimize'
import IconChevronLeft from '~icons/lucide/chevron-left'
import IconChevronRight from '~icons/lucide/chevron-right'
import IconShare from '~icons/lucide/share'
import IconDownload from '~icons/lucide/download'
import IconClose from '~icons/lucide/x'

const props = defineProps<{
  trackData: TrackData
  audioBuffer: AudioBuffer
  trackName?: string
  analysis?: AudioAnalysis
  settings?: SceneSettings
  zenMode?: boolean
}>()

const emit = defineEmits(['close'])

const canvasRef = ref<HTMLDivElement | null>(null)
const isPlaying = ref(false)
const gameEnded = ref(false)
const isPaused = ref(false)
const currentTimeDisplay = ref('0:00')

// Debug State
const showDebug = ref(false)
interface DebugEntry {
  key: string
  value: number
  pct: number
  color: string
}
const debugEntries = ref<DebugEntry[]>([])
const _fieldMax: Record<string, number> = {}
const debugDriver = ref('')
const debugFps = ref(0)
let fpsFrameCount = 0
let fpsLastTime = 0

function debugColor(key: string): string {
  if (key === 'time') return '#22d3ee'
  if (key === 'subBass') return '#ef4444'
  if (key === 'mids') return '#34d399'
  if (key === 'highs') return '#60a5fa'
  if (key === 'energy') return '#ffffff'
  if (key === 'spectralFlux') return '#facc15'
  if (key.includes('Bass')) return '#a78bfa'
  if (key.includes('Mids')) return '#fb923c'
  if (key.includes('Highs')) return '#4ade80'
  return '#9ca3af'
}

// Lane & Player State
const currentLane = ref(0)
const playerX = ref(0)

// Score State
const score = ref<GameScore>({
  score: 0,
  combo: 0,
  maxCombo: 0,
  multiplier: 1,
  collectiblesHit: 0,
  collectiblesTotal: 0,
})

const displayScore = ref(0)

// --- Share Score ---
const showShare = ref(false)
const shareBusy = ref(false)
const shareImageUrl = ref('')
const shareHint = ref('')
let shareBlob: Blob | null = null
const canNativeShare =
  typeof navigator !== 'undefined' && typeof navigator.share === 'function'

// Brand share targets. Telegram/Facebook/Reddit/X/WhatsApp expose web share
// intents that prefill the post; Discord/Instagram have none, so for those we
// copy the image + text to the clipboard and open the app for a manual paste.
// Icons are simple-icons SVGs inlined at build time via unplugin-icons.
const sharePlatforms = [
  { id: 'x', label: 'X', color: '#ffffff', icon: IconX },
  { id: 'telegram', label: 'Telegram', color: '#26A5E4', icon: IconTelegram },
  { id: 'whatsapp', label: 'WhatsApp', color: '#25D366', icon: IconWhatsapp },
  { id: 'facebook', label: 'Facebook', color: '#1877F2', icon: IconFacebook },
  { id: 'reddit', label: 'Reddit', color: '#FF4500', icon: IconReddit },
  { id: 'discord', label: 'Discord', color: '#5865F2', icon: IconDiscord },
  { id: 'instagram', label: 'Instagram', color: '#E4405F', icon: IconInstagram },
]

function shareUrl(): string {
  return window.location.origin + window.location.pathname
}
function shareText(): string {
  const song = props.trackName || 'a track'
  return `I scored ${score.value.score.toLocaleString()} riding "${song}" on WaveRider! 🌊🏄 Surf the frequency:`
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// Render the shareable card on a canvas, mirroring App.vue's intro-splash look
// (deep-purple vertical gradient, pink glow, italic WAVE·RIDER wordmark) with a
// synthwave sun + grid and the player's score, song and stats.
async function buildShareImage(): Promise<Blob | null> {
  const S = 1080
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  try {
    await document.fonts.ready
  } catch {
    /* fonts best-effort */
  }

  // Background: deep-purple vertical gradient (matches App.vue splash).
  const bg = ctx.createLinearGradient(0, 0, 0, S)
  bg.addColorStop(0, '#11052a')
  bg.addColorStop(0.55, '#2a0a4e')
  bg.addColorStop(1, '#06010c')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, S, S)

  // Synthwave sun, low-centre, clipped behind a horizon line at y = 690.
  const horizon = 690
  const sunCx = S / 2
  const sunCy = 560
  const sunR = 230
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, S, horizon)
  ctx.clip()
  const sun = ctx.createLinearGradient(0, sunCy - sunR, 0, sunCy + sunR)
  sun.addColorStop(0, '#fde047')
  sun.addColorStop(0.5, '#fb7185')
  sun.addColorStop(1, '#a21caf')
  ctx.fillStyle = sun
  ctx.beginPath()
  ctx.arc(sunCx, sunCy, sunR, 0, Math.PI * 2)
  ctx.fill()
  // Horizontal cut bars across the sun's lower half.
  ctx.fillStyle = '#11052a'
  for (let i = 0; i < 7; i++) {
    const by = sunCy + 40 + i * 26
    ctx.globalAlpha = 0.9
    ctx.fillRect(sunCx - sunR, by, sunR * 2, 10 + i * 2)
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // Perspective grid below the horizon.
  ctx.save()
  ctx.strokeStyle = 'rgba(34,211,238,0.5)'
  ctx.lineWidth = 2
  const vanishX = S / 2
  for (let i = -7; i <= 7; i++) {
    ctx.beginPath()
    ctx.moveTo(vanishX, horizon)
    ctx.lineTo(vanishX + i * 150, S)
    ctx.stroke()
  }
  for (let i = 0; i < 9; i++) {
    const t = i / 9
    const gy = horizon + Math.pow(t, 2.2) * (S - horizon)
    ctx.globalAlpha = 0.55 - t * 0.3
    ctx.beginPath()
    ctx.moveTo(0, gy)
    ctx.lineTo(S, gy)
    ctx.stroke()
  }
  ctx.globalAlpha = 1
  ctx.restore()

  // Soft pink glow behind the wordmark.
  const glow = ctx.createRadialGradient(S / 2, 150, 0, S / 2, 150, 360)
  glow.addColorStop(0, 'rgba(255,45,120,0.30)')
  glow.addColorStop(1, 'rgba(255,45,120,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, S, 520)

  ctx.textAlign = 'center'

  // Wordmark: WAVE (white) + RIDER (cyan), bold italic.
  ctx.save()
  ctx.font = 'italic 900 92px Arial, sans-serif'
  ctx.textBaseline = 'alphabetic'
  ctx.shadowColor = 'rgba(0,200,255,0.6)'
  ctx.shadowBlur = 30
  const wave = 'WAVE'
  const rider = 'RIDER'
  const wW = ctx.measureText(wave).width
  const rW = ctx.measureText(rider).width
  const startX = S / 2 - (wW + rW) / 2
  ctx.textAlign = 'left'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(wave, startX, 150)
  ctx.fillStyle = '#22d3ee'
  ctx.fillText(rider, startX + wW, 150)
  ctx.restore()

  // Tagline.
  ctx.textAlign = 'center'
  ctx.font = '700 24px Arial, sans-serif'
  ctx.fillStyle = 'rgba(103,232,249,0.9)'
  ctx.fillText('S U R F   T H E   F R E Q U E N C Y', S / 2, 196)

  // Score label + value.
  ctx.font = '800 30px Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText('FINAL SCORE', S / 2, 730)

  ctx.save()
  ctx.font = 'italic 900 150px Arial, sans-serif'
  ctx.shadowColor = 'rgba(255,200,0,0.7)'
  ctx.shadowBlur = 40
  ctx.fillStyle = '#facc15'
  ctx.fillText(score.value.score.toLocaleString(), S / 2, 870)
  ctx.restore()

  // Song name (truncated to fit).
  let song = props.trackName || 'Unknown Track'
  ctx.font = '700 36px Arial, sans-serif'
  while (ctx.measureText(`“${song}”`).width > S - 160 && song.length > 4) {
    song = song.slice(0, -1)
  }
  const songLabel = song === (props.trackName || 'Unknown Track') ? song : `${song}…`
  ctx.fillStyle = '#ffffff'
  ctx.fillText(`“${songLabel}”`, S / 2, 935)

  // Stats pills: max combo and (when not zen) orbs.
  const pills: string[] = [`MAX COMBO  ${score.value.maxCombo}×`]
  if (!props.zenMode) {
    pills.push(`ORBS  ${score.value.collectiblesHit}/${score.value.collectiblesTotal}`)
  }
  ctx.font = '800 26px Arial, sans-serif'
  const padX = 34
  const gap = 28
  const widths = pills.map((p) => ctx.measureText(p).width + padX * 2)
  const totalW = widths.reduce((a, b) => a + b, 0) + gap * (pills.length - 1)
  let px = S / 2 - totalW / 2
  const py = 975
  const ph = 64
  pills.forEach((p, i) => {
    const pw = widths[i]
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.strokeStyle = i === 0 ? 'rgba(244,114,182,0.7)' : 'rgba(34,211,238,0.7)'
    ctx.lineWidth = 2
    roundRect(ctx, px, py, pw, ph, ph / 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = i === 0 ? '#f9a8d4' : '#67e8f9'
    ctx.textBaseline = 'middle'
    ctx.fillText(p, px + pw / 2, py + ph / 2 + 2)
    ctx.textBaseline = 'alphabetic'
    px += pw + gap
  })

  // Footer call-to-action.
  ctx.font = '700 24px Arial, sans-serif'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

async function openShare() {
  showShare.value = true
  shareBusy.value = true
  shareHint.value = ''
  try {
    shareBlob = await buildShareImage()
    if (shareImageUrl.value) URL.revokeObjectURL(shareImageUrl.value)
    shareImageUrl.value = shareBlob ? URL.createObjectURL(shareBlob) : ''
  } finally {
    shareBusy.value = false
  }
}

function closeShare() {
  showShare.value = false
}

function downloadShareImage() {
  if (!shareImageUrl.value) return
  const slug = (props.trackName || 'score').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  const a = document.createElement('a')
  a.href = shareImageUrl.value
  a.download = `waverider-${slug}.png`
  a.click()
}

async function nativeShare() {
  const data: ShareData = { title: 'WaveRider', text: shareText(), url: shareUrl() }
  try {
    if (shareBlob) {
      const file = new File([shareBlob], 'waverider-score.png', { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ ...data, files: [file] })
        return
      }
    }
    await navigator.share(data)
  } catch {
    /* user cancelled or unsupported */
  }
}

async function copyShareImage(): Promise<boolean> {
  if (!shareBlob || typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
    return false
  }
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': shareBlob })])
    return true
  } catch {
    return false
  }
}

// Web share intents (t.me, facebook, twitter, reddit, wa.me) can only carry
// text + a URL — they can't attach a local file. So to actually include the
// score image we either hand the PNG to the OS share sheet (native file share,
// mostly mobile) or copy it to the clipboard for the user to paste into the post.
const pasteKey =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
    ? '⌘V'
    : 'Ctrl+V'

async function shareTo(id: string, label: string) {
  shareHint.value = ''

  // Best path: hand the real PNG to the OS share sheet so it posts to the
  // chosen app (Discord/Instagram/WhatsApp/…) with the image attached.
  if (shareBlob) {
    const file = new File([shareBlob], 'waverider-score.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ text: `${shareText()} ${shareUrl()}`, files: [file] })
        return
      } catch {
        /* cancelled or failed — fall back to the web composer below */
      }
    }
  }

  // Desktop fallback: copy the image to the clipboard so it can be pasted into
  // the post, then open the platform's web composer (carrying the link + text).
  const copiedImg = await copyShareImage()
  const u = encodeURIComponent(shareUrl())
  const t = encodeURIComponent(shareText())
  const tu = encodeURIComponent(`${shareText()} ${shareUrl()}`)
  let url = ''
  switch (id) {
    case 'x':
      url = `https://twitter.com/intent/tweet?text=${t}&url=${u}`
      break
    case 'telegram':
      url = `https://t.me/share/url?url=${u}&text=${t}`
      break
    case 'whatsapp':
      url = `https://wa.me/?text=${tu}`
      break
    case 'facebook':
      url = `https://www.facebook.com/sharer/sharer.php?u=${u}&quote=${t}`
      break
    case 'reddit':
      url = `https://www.reddit.com/submit?url=${u}&title=${t}`
      break
    case 'discord':
      url = 'https://discord.com/app'
      break
    case 'instagram':
      url = 'https://www.instagram.com'
      break
  }
  shareHint.value = copiedImg
    ? `Image copied — press ${pasteKey} in ${label} to attach it to your post.`
    : `Couldn't copy the image automatically — use “Download Image” below, then attach it in ${label}.`
  if (url) window.open(url, '_blank', 'noopener,noreferrer')
}

// --- Globals ---
let sceneManager: RetrowaveScene | null = null
let audioCtx: AudioContext | null = null
let sourceNode: AudioBufferSourceNode | null = null
let startTime = 0
let lastProgress = 0
// Scroll distance (world units) resolved last frame, for swept orb collision.
let lastScrollOffset = 0
let playerPitch = 0
let playerYaw = 0
let rafId = 0

const BASE_FOV = 95

// Touch detection & flash state.
// `isTouchDevice` is broad (any touch input) and only gates the optional touch
// lane controls. `isMobile` is the stricter "phone/tablet" test — coarse pointer
// with no hover — used to decide whether to force fullscreen + landscape. A
// touchscreen laptop has a trackpad (hover + fine pointer) so it stays desktop.
const isTouchDevice = ref(false)
const isMobile = ref(false)
const touchFlash = ref<'left' | 'right' | null>(null)
let touchFlashTimer: ReturnType<typeof setTimeout> | null = null

// Fullscreen + immersive landscape handling (lives with the playable scene).
const {
  isFullscreen,
  isSupported: fullscreenSupported,
  enter: enterFullscreen,
  toggle: toggleFullscreen,
} = useFullscreen()
const isPortrait = ref(false)

function updateOrientation() {
  isPortrait.value =
    typeof window !== 'undefined' && window.matchMedia('(orientation: portrait)').matches
}

async function lockLandscape() {
  // Android Chrome supports this (needs fullscreen + a gesture); on iOS it's a
  // no-op and the rotate-device overlay is the fallback. `window.screen` —
  // local refs would otherwise shadow nothing here, but be explicit.
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

// Fallback: requesting fullscreen on mount can be blocked if the transient user
// activation from track selection expired during loading. If so, the first tap
// anywhere on the scene completes it.
function onImmersiveGesture() {
  if (isMobile.value && !isFullscreen.value) void goImmersive()
}

function moveLane(delta: -1 | 1) {
  if (isPaused.value || !isPlaying.value) return
  currentLane.value = Math.max(-1, Math.min(1, currentLane.value + delta))

  touchFlash.value = delta < 0 ? 'left' : 'right'
  if (touchFlashTimer) clearTimeout(touchFlashTimer)
  touchFlashTimer = setTimeout(() => {
    touchFlash.value = null
  }, 150)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    // The browser reserves Esc to leave fullscreen; we don't also pop the pause
    // menu (that double action was disorienting). Pause is the HUD button or "P".
    e.preventDefault()
    return
  }

  if (e.key === 'p' || e.key === 'P') {
    if (isPlaying.value && !gameEnded.value) togglePause()
    return
  }

  if (isPaused.value || !isPlaying.value) return

  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
    moveLane(-1)
  } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
    moveLane(1)
  }
}

onMounted(async () => {
  isTouchDevice.value = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  isMobile.value = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  window.addEventListener('keydown', onKeyDown)

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

  if (canvasRef.value) {
    sceneManager = new RetrowaveScene(
      `${import.meta.env.BASE_URL}assets/retrowave/`,
      canvasRef.value,
      props.settings
    )

    if (props.trackData.segments) {
      const heights = props.trackData.segments.map((s) => s.y)
      const centers = props.trackData.segments.map((s) => s.centerX)
      const rolls = props.trackData.segments.map((s) => s.roll || 0)
      sceneManager.setTrackData(heights, centers, rolls, props.audioBuffer.duration)
      sceneManager.latency = 0.0
    }

    await sceneManager.prepareScene(false)

    if (props.trackData.segments && !props.zenMode) {
      sceneManager.spawnCollectibles(props.trackData.segments, props.audioBuffer.duration)
      score.value.collectiblesTotal = props.trackData.segments.filter(
        (s) => s.collectible !== null
      ).length
    }

    tick()
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('resize', updateOrientation)
  window.removeEventListener('orientationchange', updateOrientation)
  window.removeEventListener('pointerdown', onImmersiveGesture)
  try {
    window.screen.orientation.unlock()
  } catch {
    /* unsupported */
  }
  if (shareImageUrl.value) URL.revokeObjectURL(shareImageUrl.value)
  cleanup()
})

function cleanup() {
  cancelAnimationFrame(rafId)
  if (sourceNode) {
    try {
      sourceNode.stop()
      sourceNode.disconnect()
    } catch {}
  }
  if (audioCtx) {
    try {
      if (audioCtx.state !== 'closed') audioCtx.close()
    } catch {}
  }
  sceneManager?.destroy()
  sceneManager = null
}

function tick() {
  rafId = requestAnimationFrame(tick)
  if (!sceneManager) return

  let progress = lastProgress
  let elapsed = 0

  if (isPlaying.value && !isPaused.value && audioCtx) {
    const outputLatency = audioCtx.outputLatency || audioCtx.baseLatency || 0
    elapsed = Math.max(0, audioCtx.currentTime - startTime - outputLatency)

    if (elapsed > props.audioBuffer.duration) {
      endGame()
    } else {
      const m = Math.floor(elapsed / 60)
      const s = Math.floor(elapsed % 60)
        .toString()
        .padStart(2, '0')
      currentTimeDisplay.value = `${m}:${s}`
      progress = Math.max(0, Math.min(1, elapsed / props.audioBuffer.duration))
      lastProgress = progress

      if (showDebug.value) {
        fpsFrameCount++
        const now = performance.now()
        if (now - fpsLastTime >= 500) {
          debugFps.value = Math.round((fpsFrameCount * 1000) / (now - fpsLastTime))
          fpsFrameCount = 0
          fpsLastTime = now
        }

        if (props.analysis?.frames) {
          const analysisFPS = props.analysis.frames.length / props.analysis.duration
          const fIdx = Math.max(0, Math.floor(elapsed * analysisFPS))
          if (fIdx < props.analysis.frames.length) {
            const frame = props.analysis.frames[fIdx] as unknown as Record<string, number>
            const entries: DebugEntry[] = []
            for (const [k, v] of Object.entries(frame)) {
              const n = v as number
              let pct: number
              if (k === 'time') {
                pct = Math.min((n / (props.analysis.duration || 1)) * 100, 100)
              } else {
                if (n > (_fieldMax[k] ?? 0)) _fieldMax[k] = n
                pct = Math.min((n / (_fieldMax[k] || 1)) * 100, 100)
              }
              entries.push({ key: k, value: n, pct, color: debugColor(k) })
            }
            debugEntries.value = entries
          }
          const driver = props.trackData.melodicDriver
          if (driver && fIdx < driver.length) {
            debugDriver.value = driver[fIdx] === 1 ? 'HIGHS' : 'MIDS'
          }
        }
      }
    }
  }

  sceneManager.updateTime(progress)

  if (sceneManager.camera && props.trackData.segments.length > 0) {
    // Ease the camera toward the gameplay FOV (wider than the menu default)
    sceneManager.camera.fov += (BASE_FOV - sceneManager.camera.fov) * 0.1
    sceneManager.camera.updateProjectionMatrix()
  }

  const targetX = currentLane.value * LANE_WIDTH
  playerX.value += (targetX - playerX.value) * 0.15

  if (sceneManager.playerGroup) {
    const h = sceneManager.getTrackHeightAt(progress)
    const cx = sceneManager.getTrackCenterXAt(progress)
    const bank = sceneManager.getTrackRollAt(progress)

    sceneManager.playerGroup.position.y = h + 0.5 + 6 * Math.abs(bank) - playerX.value * bank
    sceneManager.playerGroup.position.x = playerX.value + cx

    sceneManager.camera.position.x = cx

    const targetPitch = sceneManager.getTrackPitchAt(progress)
    playerPitch += (targetPitch - playerPitch) * 0.2
    sceneManager.playerGroup.rotation.x = playerPitch

    const targetYaw = sceneManager.getTrackYawAt(progress)
    playerYaw += (targetYaw - playerYaw) * 0.2
    sceneManager.playerGroup.rotation.y = -targetYaw
    sceneManager.playerGroup.rotation.z = -Math.atan(bank)
  }

  if (isPlaying.value && !isPaused.value && !props.zenMode) {
    sceneManager.updateCollectibles(elapsed)
  }

  if (isPlaying.value && !isPaused.value && !props.zenMode && sceneManager.playerGroup) {
    const collectibles = sceneManager.getCollectibles()
    const playerZ = sceneManager.playerGroup!.position.z

    // Swept collision: an orb sits at z = baseZ + scrollOffset, and scrollOffset
    // grows monotonically with the audio clock (= elapsed × animationSpeed). Each
    // orb crosses the player plane (dz = 0) at exactly scrollOffset = playerZ -
    // baseZ. Resolving on that crossing — instead of testing presence in a fixed
    // ±2 window each frame — means a dropped/long frame that jumps the orb clean
    // past the window can't cause a phantom miss. Frame-rate independent.
    const scrollOffset = elapsed * sceneManager.animationSpeed

    for (let i = 0; i < collectibles.length; i++) {
      const c = collectibles[i]
      if (!c.alive) continue

      const crossOffset = playerZ - c.baseZ
      // Did the orb pass the player plane somewhere between last frame and now?
      if (crossOffset > lastScrollOffset && crossOffset <= scrollOffset) {
        sceneManager.removeCollectible(i)
        if (c.lane === currentLane.value) {
          score.value.collectiblesHit++
          score.value.combo++
          if (score.value.combo > score.value.maxCombo) {
            score.value.maxCombo = score.value.combo
          }
          score.value.multiplier = 1 + Math.floor(score.value.combo / 10)
          score.value.score += 100 * score.value.multiplier
          displayScore.value = score.value.score
        } else {
          score.value.combo = 0
          score.value.multiplier = 1
        }
      }
    }

    lastScrollOffset = scrollOffset
  }

  sceneManager.renderFrame()
}

async function startGame() {
  if (isPlaying.value) return

  score.value = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    multiplier: 1,
    collectiblesHit: 0,
    collectiblesTotal: props.zenMode
      ? 0
      : props.trackData.segments.filter((s) => s.collectible !== null).length,
  }
  displayScore.value = 0
  currentLane.value = 0
  playerX.value = 0

  if (audioCtx) {
    try {
      if (audioCtx.state !== 'closed') audioCtx.close()
    } catch {}
  }

  audioCtx = new AudioContext()
  await audioCtx.resume()

  sourceNode = audioCtx.createBufferSource()
  sourceNode.buffer = props.audioBuffer
  sourceNode.connect(audioCtx.destination)

  startTime = audioCtx.currentTime + 0.1
  lastProgress = 0
  lastScrollOffset = 0
  sourceNode.start(startTime)

  sourceNode.onended = () => {
    if (isPlaying.value && !gameEnded.value) endGame()
  }

  if (sceneManager && props.trackData.segments && !props.zenMode) {
    sceneManager.spawnCollectibles(props.trackData.segments, props.audioBuffer.duration)
  }

  isPlaying.value = true
  gameEnded.value = false
  isPaused.value = false
}

function endGame() {
  if (!isPlaying.value) return
  isPlaying.value = false
  gameEnded.value = true

  if (sourceNode) {
    try {
      sourceNode.stop()
      sourceNode.disconnect()
    } catch {}
    sourceNode = null
  }
}

function togglePause() {
  if (!isPlaying.value || gameEnded.value) return
  if (isPaused.value) {
    resumeGame()
  } else {
    pauseGame()
  }
}

function pauseGame() {
  isPaused.value = true
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.suspend()
  }
}

function resumeGame() {
  isPaused.value = false
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
}

function restartGame() {
  isPaused.value = false
  isPlaying.value = false
  gameEnded.value = false

  if (sourceNode) {
    try {
      sourceNode.stop()
      sourceNode.disconnect()
    } catch {}
    sourceNode = null
  }
  if (audioCtx) {
    try {
      if (audioCtx.state !== 'closed') audioCtx.close()
    } catch {}
    audioCtx = null
  }

  startGame()
}

function closeGame() {
  cleanup()
  emit('close')
}
</script>

<template>
  <div class="relative w-full h-full font-mono select-none overflow-hidden bg-[#00020a]">
    <div ref="canvasRef" class="w-full h-full block outline-none" />

    <!-- Fullscreen toggle (desktop only): a faint corner ghost that brightens
         on hover. Mobile force-enters fullscreen on START instead. -->
    <button
      v-if="fullscreenSupported && !isMobile"
      @click="toggleFullscreen"
      :aria-label="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
      :title="isFullscreen ? 'Exit fullscreen' : 'Fullscreen'"
      class="absolute right-3 top-3 z-[9999998] flex h-8 w-8 items-center justify-center rounded-lg text-white/80 opacity-25 transition-all duration-200 hover:bg-white/5 hover:text-cyan-200 hover:opacity-100"
    >
      <IconMaximize v-if="!isFullscreen" class="h-4 w-4" />
      <IconMinimize v-else class="h-4 w-4" />
    </button>

    <!-- Touch Zones (mobile only) -->
    <template v-if="isTouchDevice && isPlaying && !gameEnded && !isPaused">
      <div
        class="absolute left-0 top-0 bottom-20 w-1/2 z-[99999] flex items-center justify-start pl-4"
        @touchstart.prevent="moveLane(-1)"
      >
        <IconChevronLeft
          class="w-8 h-8 text-white transition-opacity duration-150"
          :class="touchFlash === 'left' ? 'opacity-40' : 'opacity-0'"
        />
      </div>
      <div
        class="absolute right-0 top-0 bottom-20 w-1/2 z-[99999] flex items-center justify-end pr-4"
        @touchstart.prevent="moveLane(1)"
      >
        <IconChevronRight
          class="w-8 h-8 text-white transition-opacity duration-150"
          :class="touchFlash === 'right' ? 'opacity-40' : 'opacity-0'"
        />
      </div>
    </template>

    <!-- HUD bar (playing) -->
    <FrostedGlass
      v-if="isPlaying && !gameEnded"
      container-class="fixed bottom-4 z-[99999] h-14 max-w-4xl w-full left-1/2 -translate-x-1/2"
      class="flex items-center justify-between px-5 border border-white/10"
    >
      <div class="shrink-0 text-white/90 font-mono text-lg font-bold tabular-nums">
        {{ currentTimeDisplay }}
      </div>
      <div class="flex-1 flex items-center justify-center gap-2.5 min-w-0 px-4">
        <span class="text-sm font-bold text-cyan-400 uppercase tracking-wider truncate">
          {{ trackName || 'UNKNOWN' }}
        </span>
      </div>
      <div class="shrink-0 flex items-center gap-3">
        <div v-if="score.combo > 1" class="text-xs font-bold text-pink-400 uppercase">
          {{ score.combo }}x
        </div>
        <span class="text-sm font-bold text-yellow-400 tabular-nums">
          {{ displayScore.toLocaleString() }}
        </span>
        <button
          class="shrink-0 p-1 text-white/60 hover:text-white transition-colors"
          @click="togglePause"
          @touchstart.prevent="togglePause"
          aria-label="Pause"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        </button>
      </div>
    </FrostedGlass>

    <!-- Debug Panel -->
    <div
      v-if="showDebug && isPlaying"
      class="absolute bottom-20 right-4 z-40 p-4 bg-black/90 backdrop-blur-md border border-cyan-500/30 rounded-lg w-72 shadow-[0_0_20px_rgba(0,0,0,0.8)] pointer-events-none"
    >
      <h3
        class="text-cyan-400 font-bold text-xs uppercase mb-4 tracking-[0.2em] border-b border-cyan-500/30 pb-2 flex justify-between"
      >
        <span>Analysis Stream</span>
        <span class="text-cyan-600 animate-pulse">● LIVE</span>
      </h3>
      <div class="space-y-3 text-[10px] font-bold tracking-wider">
        <div class="flex justify-between text-gray-400 uppercase">
          <span>FPS</span>
          <span class="font-mono text-white">{{ debugFps }}</span>
        </div>
        <div v-for="entry in debugEntries" :key="entry.key" class="flex flex-col gap-1">
          <div class="flex justify-between text-gray-400 uppercase">
            <span>{{ entry.key }}</span>
            <span class="font-mono text-white">{{ entry.value.toFixed(4) }}</span>
          </div>
          <div
            class="h-1.5 w-full rounded-full overflow-hidden"
            style="background: rgba(255, 255, 255, 0.06)"
          >
            <div
              class="h-full transition-all duration-75"
              :style="{ width: `${entry.pct}%`, backgroundColor: entry.color }"
            />
          </div>
        </div>
        <div
          v-if="debugDriver"
          class="flex justify-between items-center uppercase pt-2 border-t border-cyan-500/30"
        >
          <span class="text-gray-400">Driven by</span>
          <div class="flex gap-3 font-mono">
            <span
              class="transition-colors duration-150"
              :class="debugDriver === 'MIDS' ? 'text-orange-400' : 'text-gray-600'"
              >MIDS</span
            >
            <span
              class="transition-colors duration-150"
              :class="debugDriver === 'HIGHS' ? 'text-green-400' : 'text-gray-600'"
              >HIGHS</span
            >
          </div>
        </div>
      </div>
    </div>

    <!-- Pause Menu -->
    <div
      v-if="isPaused"
      class="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-[9999999]"
    >
      <FrostedGlass
        container-class="relative z-50 w-[min(90vw,400px)]"
        class="flex flex-col items-center gap-4 border border-white/10 p-8"
        position="relative"
      >
        <h2 class="text-4xl font-black text-white italic tracking-widest mb-4 -skew-x-6">PAUSED</h2>
        <button
          @click="resumeGame"
          class="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black text-xl uppercase tracking-widest hover:scale-105 transition-transform"
        >
          RESUME
        </button>
        <button
          @click="restartGame"
          class="w-full py-3 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-xl uppercase tracking-widest hover:scale-105 transition-transform"
        >
          RESTART
        </button>
        <button
          @click="closeGame"
          class="w-full py-3 border border-white/20 text-white/70 font-bold text-lg uppercase tracking-widest hover:text-white hover:border-white/40 transition-all"
        >
          EXIT
        </button>
        <button
          v-if="analysis"
          @click="showDebug = !showDebug"
          class="mt-2 text-xs px-3 py-1 border font-bold uppercase transition-all"
          :class="
            showDebug
              ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
              : 'border-gray-700 text-gray-500 hover:text-cyan-400'
          "
        >
          DEBUG {{ showDebug ? 'ON' : 'OFF' }}
        </button>
      </FrostedGlass>
    </div>

    <!-- Start / Results Screen -->
    <div
      v-if="!isPlaying"
      class="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-50"
    >
      <div class="text-center px-6">
        <h1
          class="text-7xl sm:text-9xl font-black text-white italic tracking-widest mb-4 drop-shadow-[0_0_20px_cyan] transform -skew-x-12"
        >
          {{ gameEnded ? 'FINISH' : 'READY' }}
        </h1>

        <div v-if="gameEnded" class="mb-8 space-y-3">
          <div
            class="text-yellow-400 text-5xl font-black tabular-nums drop-shadow-[0_0_10px_rgba(255,200,0,0.6)]"
          >
            {{ score.score.toLocaleString() }}
          </div>
          <div
            class="flex items-center justify-center gap-6 text-sm font-bold uppercase tracking-wider"
          >
            <span class="text-pink-400">
              MAX COMBO <span class="text-white font-mono ml-1">{{ score.maxCombo }}x</span>
            </span>
            <span v-if="!zenMode" class="text-cyan-400">
              ORBS
              <span class="text-white font-mono ml-1"
                >{{ score.collectiblesHit }}/{{ score.collectiblesTotal }}</span
              >
            </span>
          </div>
        </div>

        <div
          v-if="!gameEnded"
          class="mb-8 text-cyan-400/60 font-bold uppercase tracking-widest text-sm truncate max-w-sm mx-auto"
        >
          {{ trackName || 'UNKNOWN' }}
        </div>

        <button
          @click="startGame"
          class="pointer-events-auto px-12 py-4 bg-gradient-to-r from-pink-600 to-purple-600 text-white font-black text-3xl uppercase tracking-widest transform -skew-x-12 hover:scale-105 transition-transform shadow-[0_0_30px_rgba(255,0,255,0.6)]"
        >
          <span class="skew-x-12 block">{{ gameEnded ? 'RESTART' : 'START' }}</span>
        </button>

        <button
          v-if="gameEnded"
          @click="openShare"
          class="pointer-events-auto mt-4 mx-auto flex items-center gap-2 px-8 py-3 bg-cyan-500/15 border border-cyan-400/60 text-cyan-200 font-black uppercase tracking-widest hover:bg-cyan-500/25 hover:border-cyan-300 transition-all shadow-[0_0_20px_rgba(0,255,255,0.25)]"
        >
          <IconShare class="h-5 w-5" />
          Share Score
        </button>

        <button
          @click="closeGame"
          class="pointer-events-auto mt-4 block mx-auto px-8 py-2 border border-white/20 text-white/60 font-bold uppercase tracking-widest hover:text-white hover:border-white/40 transition-all"
        >
          {{ gameEnded ? 'BACK TO MENU' : 'BACK' }}
        </button>
      </div>
    </div>

    <!-- Share Score modal -->
    <Transition name="share-fade">
      <div
        v-if="showShare"
        class="absolute inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md px-4 py-6"
        @click.self="closeShare"
      >
        <div
          class="pointer-events-auto relative w-full max-w-3xl max-h-full overflow-y-auto rounded-2xl border border-white/10 bg-[#0c0518]/90 p-5 shadow-[0_8px_60px_rgba(0,0,0,0.6)] sm:p-6"
        >
          <button
            @click="closeShare"
            aria-label="Close"
            class="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-white/50 transition-all hover:bg-white/10 hover:text-white"
          >
            <IconClose class="h-5 w-5" />
          </button>

          <h2
            class="mb-4 text-center text-2xl font-black uppercase italic tracking-widest text-white drop-shadow-[0_0_14px_rgba(0,200,255,0.5)]"
          >
            Share Your Run
          </h2>

          <div class="flex flex-col items-stretch gap-5 sm:flex-row">
            <!-- Card preview -->
            <div class="flex shrink-0 items-center justify-center sm:w-1/2">
              <div
                class="relative aspect-square w-full max-w-[300px] overflow-hidden rounded-xl border border-white/10 bg-[#11052a]"
              >
                <div
                  v-if="shareBusy"
                  class="absolute inset-0 flex items-center justify-center text-cyan-300/70 text-sm font-bold uppercase tracking-widest"
                >
                  Rendering…
                </div>
                <img
                  v-else-if="shareImageUrl"
                  :src="shareImageUrl"
                  alt="Your WaveRider score card"
                  class="h-full w-full object-cover"
                />
              </div>
            </div>

            <!-- Actions -->
            <div class="flex min-w-0 flex-1 flex-col gap-3">
              <button
                v-if="canNativeShare"
                @click="nativeShare"
                :disabled="shareBusy"
                class="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-pink-600 to-purple-600 px-5 py-3 font-black uppercase tracking-widest text-white shadow-[0_0_20px_rgba(255,0,255,0.4)] transition-transform hover:scale-[1.02] disabled:opacity-50"
              >
                <IconShare class="h-5 w-5" />
                Share…
              </button>

              <button
                @click="downloadShareImage"
                :disabled="shareBusy || !shareImageUrl"
                class="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 font-bold uppercase tracking-widest text-white/80 transition-all hover:border-white/40 hover:text-white disabled:opacity-50"
              >
                <IconDownload class="h-5 w-5" />
                Download Image
              </button>

              <div class="mt-1 text-center text-[11px] font-bold uppercase tracking-widest text-white/35">
                Or post to
              </div>

              <div class="grid grid-cols-4 gap-2.5">
                <button
                  v-for="p in sharePlatforms"
                  :key="p.id"
                  @click="shareTo(p.id, p.label)"
                  :disabled="shareBusy"
                  :title="`Share on ${p.label}`"
                  :aria-label="`Share on ${p.label}`"
                  class="group flex aspect-square items-center justify-center rounded-xl border border-white/10 bg-white/5 transition-all hover:scale-105 hover:border-white/30 disabled:opacity-50"
                  :style="{ color: p.color }"
                >
                  <component :is="p.icon" class="h-6 w-6" />
                </button>
              </div>

              <p
                v-if="shareHint"
                class="mt-1 rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-3 py-2 text-center text-xs font-semibold text-cyan-200"
              >
                {{ shareHint }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Rotate-device prompt: forces a landscape experience on touch devices
         even where orientation lock is unavailable (iOS). -->
    <div
      v-if="isMobile && isPortrait"
      class="absolute inset-0 z-[99999999] flex flex-col items-center justify-center gap-5 bg-[#06010c] px-8 text-center"
    >
      <svg class="h-16 w-16 animate-pulse text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path stroke-linecap="round" d="M2 12a10 10 0 0 0 10 10M22 12A10 10 0 0 0 12 2" opacity="0.5" />
      </svg>
      <div>
        <p class="text-lg font-black uppercase tracking-widest text-white">Rotate your device</p>
        <p class="mt-2 text-sm text-white/50">WaveRider is best played in landscape.</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Share modal fade/scale */
.share-fade-enter-active,
.share-fade-leave-active {
  transition: opacity 0.25s ease;
}
.share-fade-enter-from,
.share-fade-leave-to {
  opacity: 0;
}
.share-fade-enter-active > div,
.share-fade-leave-active > div {
  transition: transform 0.25s cubic-bezier(0.22, 1, 0.36, 1);
}
.share-fade-enter-from > div,
.share-fade-leave-to > div {
  transform: scale(0.94);
}
</style>
