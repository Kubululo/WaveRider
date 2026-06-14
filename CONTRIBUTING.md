# Contributing to WaveRider

Thanks for your interest in improving WaveRider! This guide covers how to get set
up and the conventions the project follows. Contributions of all sizes are
welcome — bug fixes, new features, docs, and tuning tweaks.

## Getting started

**Prerequisites:** Node.js **20.19+** and npm.

```bash
# 1. Fork & clone, then install
npm install

# 2. Start the dev server (http://localhost:5173)
npm run dev
```

## Before you open a pull request

Run the full local check suite — all four must be run:

```bash
npm run typecheck   # vue-tsc — no type errors
npm run lint        # ESLint — no lint errors
npm run format      # Prettier — auto-format your changes
npm run build       # Production build must succeed
```

Unit tests (track generation + audio analyser) live in `tests/` and run with Vitest:

```bash
npm test            # run unit tests once
npm run check       # shortcut: typecheck + lint + test in one command
```

A PR that is green on `typecheck`, `lint`, `format`, and `build` will review much faster.

## Project conventions & best practices

These are the standards the codebase is held to — please match them:

- **TypeScript everywhere.** No `any` — prefer precise types, `unknown` with
  narrowing, or the relevant library type (e.g. three.js shader parameter types).
- **Vue 3 `<script setup lang="ts">`** with the Composition API. Reusable,
  stateful logic belongs in a composable under `src/composables/` (e.g.
  `useAudioAnalyzer`).
- **Formatting is automated.** Prettier owns code style (no semicolons, single
  quotes, 100-col). Don't hand-format — run `npm run format`.
- **Linting is enforced.** ESLint runs the Vue 3 + type-aware TypeScript ruleset
  (`eslint.config.js`). Fix issues rather than disabling rules; if a disable is
  truly necessary, scope it to one line with a comment explaining why.
- **No dead code.** Remove unused exports, fields, and branches rather than
  leaving them "for later." Keep `TrackSegment`, `GameScore`, etc. limited to
  fields that are actually read.
- **Imports use the `~/` alias** for `src/` (e.g. `~/lib/bass-surfer/...`), not
  long relative paths.
- **Tailwind utility classes** for styling; keep `<style>` blocks minimal.
- **Conventional Commits** for messages (`feat:`, `fix:`, `refactor:`,
  `docs:`, `chore:`) — it keeps history readable.

## Where to tune things

- **Audio analysis** (band cut-offs, flux thresholds, silence gate, normalization):
  `ANALYSIS_CONFIG` at the top of `src/composables/useAudioAnalyzer.ts`.
- **Track generation** (bump heights, cooldowns, road curvature, melodic driver):
  `GENERATOR_CONFIG` at the top of `src/lib/bass-surfer/trackGenerator.ts`.
- **Render quality presets** (bloom, resolution scale, scanlines):
  `RetrowaveScene.qualityPresets` in `src/lib/bass-surfer/sceneGenerator.ts`.

## Reporting bugs

Open an issue with: what you did, what you expected, what happened, your
browser/OS, and — if relevant — the kind of audio file that triggered it
(genre/format). A short clip or screen recording helps a lot.

## License

By contributing, you agree that your contributions are licensed under the
project's [MIT License](./LICENSE.md).
