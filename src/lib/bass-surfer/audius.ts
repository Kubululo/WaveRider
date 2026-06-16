// Audius integration — a keyless, CORS-open music API. All requests only need
// an `app_name` query param (no API key, no auth). The stream endpoint returns
// audio/mpeg with `access-control-allow-origin: *` on every redirect hop, so the
// bytes can be fetched and decoded into an AudioBuffer by the existing analyzer.
//
// Docs: https://docs.audius.org/api/

const APP_NAME = 'WaveRider'

// Official gateway. https://api.audius.co also returns a list of discovery hosts
// in `data`; we resolve one for resilience and fall back to the gateway itself.
const GATEWAY = 'https://api.audius.co'

let cachedHost: string | null = null

async function resolveHost(): Promise<string> {
  if (cachedHost) return cachedHost
  try {
    const res = await fetch(GATEWAY)
    const json = await res.json()
    const hosts: string[] = Array.isArray(json?.data) ? json.data : []
    cachedHost = hosts[0] || GATEWAY
  } catch {
    cachedHost = GATEWAY
  }
  return cachedHost
}

export interface AudiusTrack {
  id: string
  title: string
  artist: string
  duration: number // seconds
  artwork: string | null
  genre?: string
  playCount?: number
}

// The Audius genre enum. Values must match exactly (the trending endpoint
// returns an empty list for anything it doesn't recognise). Electronic-forward
// ordering since that's what suits the retrowave surf vibe.
export const AUDIUS_GENRES = [
  'Electronic',
  'House',
  'Deep House',
  'Tech House',
  'Techno',
  'Trance',
  'Trap',
  'Dubstep',
  'Drum & Bass',
  'Future Bass',
  'Future House',
  'Tropical House',
  'Progressive House',
  'Electro',
  'Disco',
  'Hardstyle',
  'Glitch Hop',
  'Jungle',
  'Downtempo',
  'Moombahton',
  'Jersey Club',
  'Vaporwave',
  'Hyperpop',
  'Lo-Fi',
  'Hip-Hop/Rap',
  'Pop',
  'R&B/Soul',
  'Rock',
  'Metal',
  'Alternative',
  'Punk',
  'Folk',
  'Acoustic',
  'Ambient',
  'Soundtrack',
  'World',
  'Jazz',
  'Funk',
  'Classical',
  'Reggae',
  'Country',
  'Blues',
  'Latin',
  'Experimental',
] as const

interface RawTrack {
  id: string
  title: string
  duration?: number
  genre?: string
  play_count?: number
  is_stream_gated?: boolean
  is_streamable?: boolean
  is_available?: boolean
  user?: { name?: string }
  artwork?: Record<string, string>
}

function isPlayable(t: RawTrack): boolean {
  return !t.is_stream_gated && t.is_streamable !== false && t.is_available !== false
}

function mapTrack(t: RawTrack): AudiusTrack {
  return {
    id: t.id,
    title: t.title,
    artist: t.user?.name ?? 'Unknown Artist',
    duration: t.duration ?? 0,
    artwork: t.artwork?.['150x150'] ?? t.artwork?.['480x480'] ?? null,
    genre: t.genre,
    playCount: t.play_count,
  }
}

async function getTracks(path: string, params: Record<string, string>): Promise<AudiusTrack[]> {
  const host = await resolveHost()
  const qs = new URLSearchParams({ app_name: APP_NAME, ...params })
  const res = await fetch(`${host}${path}?${qs}`)
  if (!res.ok) throw new Error(`Audius request failed (${res.status})`)
  const json = await res.json()
  const data: RawTrack[] = Array.isArray(json?.data) ? json.data : []
  return data.filter(isPlayable).map(mapTrack)
}

// Trending time window. 'year' is omitted — the API returns nothing for it.
export type TrendingTime = 'week' | 'month' | 'allTime'

// Search ordering. 'relevant' is the API default (sent by omitting sort_method).
export type SearchSort = 'relevant' | 'popular' | 'recent'

/** Trending tracks, optionally scoped to a genre and time window. Default browse view. */
export function getTrending(
  genre?: string,
  time: TrendingTime = 'week',
  limit = 25
): Promise<AudiusTrack[]> {
  const params: Record<string, string> = { limit: String(limit), time }
  if (genre) params.genre = genre
  return getTracks('/v1/tracks/trending', params)
}

/** Full-text track search across the Audius catalog, optionally re-sorted. */
export function searchTracks(
  query: string,
  sort: SearchSort = 'relevant',
  limit = 25
): Promise<AudiusTrack[]> {
  const params: Record<string, string> = { query, limit: String(limit) }
  if (sort !== 'relevant') params.sort_method = sort
  return getTracks('/v1/tracks/search', params)
}

/**
 * Direct stream URL for a track. Suitable as an `<audio>` element `src` for
 * instant previews — media playback streams progressively and doesn't require
 * CORS (only the full-download path below needs it, to decode the bytes).
 */
export function streamUrl(trackId: string): string {
  return `${cachedHost ?? GATEWAY}/v1/tracks/${trackId}/stream?app_name=${APP_NAME}`
}

/**
 * Downloads a track's audio and wraps it as a File so it flows through the
 * existing `useAudioAnalyzer().analyze(file)` pipeline unchanged. Reports
 * 0–1 download progress when the server sends a Content-Length.
 */
export async function fetchTrackFile(
  track: AudiusTrack,
  onProgress?: (fraction: number) => void
): Promise<File> {
  const host = await resolveHost()
  const url = `${host}/v1/tracks/${track.id}/stream?app_name=${APP_NAME}`
  const res = await fetch(url)
  if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`)

  const total = Number(res.headers.get('content-length')) || 0
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total && onProgress) onProgress(Math.min(received / total, 1))
  }
  if (!total && onProgress) onProgress(1)

  // Concatenate into one buffer (gives a definite ArrayBuffer-backed view for File()).
  const merged = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }

  return new File([merged], `${track.title}.mp3`, { type: 'audio/mpeg' })
}
