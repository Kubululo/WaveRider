<p align="center">
  <img src="docs/banner.svg" alt="WaveRider — Surf the Frequency" width="100%" />
</p>

<p align="center">
  <a href="LICENSE.md"><img src="https://img.shields.io/badge/license-MIT-22d3ee.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/Vue-3-42b883.svg" alt="Vue 3" />
  <img src="https://img.shields.io/badge/Vite-8-646cff.svg" alt="Vite 8" />
  <img src="https://img.shields.io/badge/three.js-r184-000000.svg" alt="three.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178c6.svg" alt="TypeScript 5" />
</p>

**Drop any song. Ride the wave.**

WaveRider is a browser game that turns any audio file you drop in into a playable, beat-synced retrowave surf track.
Built with Vue 3, Web Audio API, and three.js.

## Quick Start

```bash
npm install
npm run dev     # dev server at http://localhost:5173
npm run build   # production build → dist/
npm run preview # preview the production build
```

## How to Play

1. Open the game in your browser.
2. Drag & drop (or click to browse) any MP3, WAV, OGG, FLAC, or M4A file (max 20 MB).
3. WaveRider analyses the audio and generates a track from it.
4. Press **START** and surf!

### Controls

| Input            | Action              |
|------------------|---------------------|
| `←` / `A`        | Move left lane      |
| `→` / `D`        | Move right lane     |
| `Esc`            | Pause / Resume      |
| Touch left half  | Move left (mobile)  |
| Touch right half | Move right (mobile) |

### Quality Settings

- **Low** — no bloom or scanlines, 0.65× render scale and reduced draw distance; best for weak devices.
- **Medium** — bloom + scanlines, 1× render scale.
- **High** — full post-processing, maximum scene density and draw distance, and supersampling (renders above native resolution and downscales) to eliminate the neon grid's moiré shimmer. Scanlines are off here so they don't beat against a recorder's pixel grid. Best for crisp visuals and video capture; heaviest on the GPU.

## Project Structure

```
waverider/
├── public/
│   └── assets/
│       └── retrowave/       # 3D scene assets (skybox, SVGs)
│           ├── scenery/     # sun.svg, city_far.svg, city_close.svg
│           └── skybox/      # Cubemap textures (1024 / 2048 / 4096)
│
├── src/
│   ├── components/
│   │   ├── bass-surfer/
│   │   │   ├── AnalysisLoader.vue  # Loading screen shown during audio analysis
│   │   │   ├── GamePlay.vue        # Full game view (3D scene + HUD + menus)
│   │   │   └── SongSelector.vue    # Drag-and-drop file picker
│   │   └── ui/
│   │       └── frosted-glass/      # Frosted glass panel component
│   │
│   ├── composables/
│   │   └── useAudioAnalyzer.ts     # Web Audio spectral-flux analysis (per-band onsets)
│   │
│   ├── lib/
│   │   └── bass-surfer/
│   │       ├── sceneGenerator.ts   # three.js retrowave scene builder and renderer
│   │       ├── trackGenerator.ts   # Converts audio analysis → track segments
│   │       └── types.ts            # Shared TypeScript interfaces
│   │
│   ├── stores/
│   │   └── bassSurferStore.ts      # Pinia store (quality, zen mode, selected file)
│   │
│   ├── css/
│   │   └── main.css                # Tailwind CSS entry
│   │
│   ├── App.vue                     # Root component — screen routing (home → analyzing → game)
│   └── main.ts                     # App entry point
│
├── index.html
├── vite.config.ts
├── tsconfig.json
├── LICENSE.md
└── README.md
```

## Customisation

### Changing the scene path

Assets are served from `/assets/retrowave/`. If you host under a sub-path, update the first argument to
`new RetrowaveScene(...)` in `src/components/bass-surfer/GamePlay.vue`:

```ts
sceneManager = new RetrowaveScene('/your-base/assets/retrowave/', canvasRef.value, qualitySettings)
```

### Adjusting quality presets

Quality tiers are defined in `src/lib/bass-surfer/sceneGenerator.ts` under `RetrowaveScene.qualityPresets`. Change
whether bloom and scanlines are enabled, pixel ratio (resolution scale), scanline opacity, object counts, draw distance,
etc.

### Tuning audio analysis

All analysis thresholds live in `ANALYSIS_CONFIG` at the top of `src/composables/useAudioAnalyzer.ts` — band cut-off
frequencies, flux thresholds, the silence gate, and the normalization window.

### Tuning track generation

Track bump heights, cooldowns, and road curvature are in `GENERATOR_CONFIG` at the top of
`src/lib/bass-surfer/trackGenerator.ts`.

### Swapping skybox / scenery

Replace the PNG and SVG files inside `public/assets/retrowave/`. The skybox expects six faces:
`px.png`, `nx.png`, `py.png`, `nz.png`, and `invisible.png` (reused for both the bottom −Y face and the +Z face behind
the camera).
Three resolution sets are pre-built (`1024`, `2048`, `4096`); the scene always loads the `4096` set.

## Author

**Jakub Skurčák** — [jakub@skurcak.eu](mailto:jakub@skurcak.eu)

## Credits

- Retrowave 3D scene assets (skybox, SVG scenery) adapted from
  [retrowave-scene](https://github.com/moukrea/retrowave-scene) by Emeric Commenge — MIT License.
- Built
  with [three.js](https://threejs.org/), [Vue 3](https://vuejs.org/), [Pinia](https://pinia.vuejs.org/), [Vite](https://vitejs.dev/),
  and [Tailwind CSS](https://tailwindcss.com/).

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for the
development setup, code-style conventions, and the local check suite
(`typecheck` / `lint` / `format` / `build`) to run before opening a pull request.

## License

See [LICENSE.md](./LICENSE.md) — MIT.
