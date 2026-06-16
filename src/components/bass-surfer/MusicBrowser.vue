<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  getTrending,
  searchTracks,
  fetchTrackFile,
  streamUrl,
  AUDIUS_GENRES,
  type AudiusTrack,
  type TrendingTime,
  type SearchSort,
} from '~/lib/bass-surfer/audius'
import DropdownSelect, { type DropdownOption } from '~/components/ui/DropdownSelect.vue'

const emit = defineEmits<{
  selectFile: [file: File, title: string]
}>()

const query = ref('')
const activeGenre = ref<string | null>(null)
const trendingTime = ref<TrendingTime>('week')
const searchSort = ref<SearchSort>('relevant')
const tracks = ref<AudiusTrack[]>([])
const loading = ref(false)
const error = ref<string | null>(null)

const genreOptions: DropdownOption[] = [
  { value: null, label: 'Trending' },
  ...AUDIUS_GENRES.map((g) => ({ value: g, label: g })),
]

const timeOptions: DropdownOption[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'allTime', label: 'All Time' },
]

const searchSortOptions: DropdownOption[] = [
  { value: 'relevant', label: 'Relevant' },
  { value: 'popular', label: 'Most Played' },
  { value: 'recent', label: 'Newest' },
]

// v-model bridges between DropdownSelect's `string | null` and the typed refs.
const genreModel = computed({
  get: () => activeGenre.value,
  set: (v) => {
    activeGenre.value = v
    load()
  },
})
const timeModel = computed({
  get: () => trendingTime.value,
  set: (v) => {
    trendingTime.value = (v as TrendingTime) ?? 'week'
    load()
  },
})
const sortModel = computed({
  get: () => searchSort.value,
  set: (v) => {
    searchSort.value = (v as SearchSort) ?? 'relevant'
    load()
  },
})

// Track currently being downloaded + its progress (0–1).
const loadingId = ref<string | null>(null)
const downloadProgress = ref(0)

// Inline audio preview (one at a time, streamed — not the full download).
const previewId = ref<string | null>(null)
let previewAudio: HTMLAudioElement | null = null

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause()
    previewAudio.removeAttribute('src')
  }
  previewId.value = null
}

function togglePreview(track: AudiusTrack) {
  if (previewId.value === track.id) {
    stopPreview()
    return
  }
  if (!previewAudio) {
    previewAudio = new Audio()
    previewAudio.addEventListener('ended', () => (previewId.value = null))
    previewAudio.addEventListener('error', () => (previewId.value = null))
  }
  previewAudio.src = streamUrl(track.id)
  previewAudio.play().catch(() => (previewId.value = null))
  previewId.value = track.id
}

let searchToken = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

async function load() {
  const token = ++searchToken
  loading.value = true
  error.value = null
  try {
    const q = query.value.trim()
    const result = q
      ? await searchTracks(q, searchSort.value)
      : await getTrending(activeGenre.value ?? undefined, trendingTime.value)
    if (token !== searchToken) return // a newer request superseded this one
    tracks.value = result
  } catch (e) {
    if (token !== searchToken) return
    error.value = e instanceof Error ? e.message : 'Failed to load tracks'
    tracks.value = []
  } finally {
    if (token === searchToken) loading.value = false
  }
}

watch(query, () => {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(load, 350)
})

async function pick(track: AudiusTrack) {
  if (loadingId.value) return
  stopPreview()
  loadingId.value = track.id
  downloadProgress.value = 0
  error.value = null
  try {
    const file = await fetchTrackFile(track, (f) => (downloadProgress.value = f))
    emit('selectFile', file, `${track.artist} — ${track.title}`)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load track'
    loadingId.value = null
  }
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, '0')
  return `${m}:${s}`
}

function formatCount(n?: number): string {
  if (!n) return ''
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

onMounted(load)
onUnmounted(stopPreview)
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Search -->
    <div class="relative">
      <svg
        class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path stroke-linecap="round" d="m20 20-3.5-3.5" />
      </svg>
      <input
        v-model="query"
        type="text"
        placeholder="Search Audius for any track or artist…"
        class="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-white/30 outline-none transition-colors focus:border-cyan-400/60 focus:bg-cyan-400/5"
      />
    </div>

    <!-- Genre + sort: time window when browsing trending, ordering when searching -->
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <template v-if="!query.trim()">
        <DropdownSelect v-model="genreModel" :options="genreOptions" label="Genre" />
        <DropdownSelect v-model="timeModel" :options="timeOptions" label="Sort" />
      </template>
      <DropdownSelect v-else v-model="sortModel" :options="searchSortOptions" label="Sort" />
    </div>

    <!-- Results -->
    <div class="track-scroll min-h-[18rem] max-h-[22rem] overflow-y-auto pr-1 -mr-1">
      <!-- Loading skeleton -->
      <div v-if="loading" class="flex flex-col items-center justify-center gap-3 py-16 text-white/40">
        <svg class="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
          <path
            class="opacity-90"
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
          />
        </svg>
        <span class="text-xs uppercase tracking-widest">Loading tracks…</span>
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="flex flex-col items-center justify-center gap-3 py-16 text-center"
      >
        <p class="text-sm text-red-400">{{ error }}</p>
        <button
          @click="load"
          class="px-4 py-1.5 text-xs font-bold uppercase tracking-widest border border-white/25 text-white/70 hover:text-white hover:border-white/50 transition-all"
        >
          Retry
        </button>
      </div>

      <!-- Empty -->
      <div
        v-else-if="tracks.length === 0"
        class="flex items-center justify-center py-16 text-sm text-white/30"
      >
        No tracks found.
      </div>

      <!-- Track list -->
      <ul v-else class="flex flex-col gap-1.5">
        <li v-for="track in tracks" :key="track.id">
          <div
            class="group flex items-center gap-3 rounded-lg border border-transparent bg-white/[0.03] p-2 transition-all hover:border-cyan-400/40 hover:bg-cyan-400/[0.06]"
            :class="{ 'border-cyan-400/40 bg-cyan-400/[0.06]': previewId === track.id }"
          >
            <!-- Artwork = preview play/pause toggle -->
            <button
              @click="togglePreview(track)"
              class="relative h-11 w-11 shrink-0 overflow-hidden rounded bg-white/10"
              :aria-label="previewId === track.id ? 'Pause preview' : 'Preview track'"
            >
              <img
                v-if="track.artwork"
                :src="track.artwork"
                :alt="track.title"
                loading="lazy"
                class="h-full w-full object-cover"
              />
              <div
                class="absolute inset-0 flex items-center justify-center bg-black/55 transition-opacity"
                :class="previewId === track.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'"
              >
                <!-- Pause (currently previewing) -->
                <svg
                  v-if="previewId === track.id"
                  class="h-5 w-5 text-cyan-300"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
                <!-- Play (preview) -->
                <svg v-else class="h-5 w-5 text-cyan-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </button>

            <!-- Title / artist -->
            <div class="min-w-0 flex-1">
              <p
                class="truncate text-sm font-semibold transition-colors"
                :class="previewId === track.id ? 'text-cyan-300' : 'text-white/90'"
              >
                {{ track.title }}
              </p>
              <p class="truncate text-xs text-white/40">{{ track.artist }}</p>
            </div>

            <!-- Meta -->
            <div class="shrink-0 text-right">
              <p class="font-mono text-xs text-white/50 tabular-nums">
                {{ formatDuration(track.duration) }}
              </p>
              <p v-if="track.playCount" class="text-[10px] text-white/25">
                ▶ {{ formatCount(track.playCount) }}
              </p>
            </div>

            <!-- Select → starts the game (with download progress) -->
            <button
              @click="pick(track)"
              :disabled="loadingId !== null"
              class="shrink-0 w-16 rounded border border-cyan-400/40 bg-cyan-500/15 px-2 py-1.5 text-[11px] font-black uppercase tracking-widest text-cyan-200 tabular-nums transition-all hover:bg-cyan-500/30 hover:border-cyan-400 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-cyan-500/15"
            >
              <span v-if="loadingId === track.id">{{ Math.round(downloadProgress * 100) }}%</span>
              <span v-else>Play</span>
            </button>
          </div>
        </li>
      </ul>
    </div>

    <p class="text-center text-[10px] uppercase tracking-widest text-white/20">
      Powered by Audius · free & open music
    </p>
  </div>
</template>

<style scoped>
.track-scroll {
  scrollbar-width: thin;
  scrollbar-color: rgba(34, 211, 238, 0.4) transparent;
}

.track-scroll::-webkit-scrollbar {
  width: 6px;
}

.track-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.track-scroll::-webkit-scrollbar-thumb {
  background: rgba(34, 211, 238, 0.35);
  border-radius: 9999px;
}

.track-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(34, 211, 238, 0.65);
}
</style>
