/// <reference types="vite/client" />

// Pulls in Vite's ambient module declarations — including the one for
// side-effect CSS imports like `import './css/main.css'` in main.ts — plus
// typed `import.meta.env`. Without this, resolving those imports depends on the
// exact vue-tsc/TypeScript build state, which can surface as TS2882 ("Cannot
// find module or type declarations for side-effect import") on a clean CI run.
