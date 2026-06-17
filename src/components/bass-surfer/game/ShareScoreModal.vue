<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import type { GameScore } from '~/lib/bass-surfer/types'
import IconClose from '~icons/lucide/x'
import IconShare from '~icons/lucide/share'
import IconDownload from '~icons/lucide/download'
import IconX from '~icons/simple-icons/x'
import IconTelegram from '~icons/simple-icons/telegram'
import IconWhatsapp from '~icons/simple-icons/whatsapp'
import IconFacebook from '~icons/simple-icons/facebook'
import IconReddit from '~icons/simple-icons/reddit'
import IconDiscord from '~icons/simple-icons/discord'
import IconInstagram from '~icons/simple-icons/instagram'

const props = defineProps<{
  score: GameScore
  trackName?: string
  zenMode?: boolean
}>()

const showShare = ref(false)
const shareBusy = ref(false)
const shareImageUrl = ref('')
const shareHint = ref('')
let shareBlob: Blob | null = null
const canNativeShare =
  typeof navigator !== 'undefined' && typeof navigator.share === 'function'

// Brand share targets. Telegram/Facebook/Reddit/X/WhatsApp expose web share
// intents that prefill the post; Discord/Instagram have none. Icons are
// simple-icons SVGs inlined at build time via unplugin-icons.
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
  return `I scored ${props.score.score.toLocaleString()} riding "${song}" on WaveRider! 🌊🏄 Surf the frequency:`
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
  ctx.fillText(props.score.score.toLocaleString(), S / 2, 870)
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
  const pills: string[] = [`MAX COMBO  ${props.score.maxCombo}×`]
  if (!props.zenMode) {
    pills.push(`ORBS  ${props.score.collectiblesHit}/${props.score.collectiblesTotal}`)
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
  ctx.fillText('Play free · waverider', S / 2, S - 42)

  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
}

async function open() {
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

onUnmounted(() => {
  if (shareImageUrl.value) URL.revokeObjectURL(shareImageUrl.value)
})

defineExpose({ open })
</script>

<template>
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
