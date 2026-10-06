# CLAUDE.md

FOTOIN: hybrid AI product photography for Indonesian UMKM. npm-workspace monorepo:
`server/` (Express 4, ES modules, sharp, zod, multer) and `web/` (React 18 + Vite).
Deeper context: `docs/CLAUDE_CODE_PROMPT.md` (current state, rules, task list), `docs/ARCHITECTURE.md`.

## Commands

- `npm run dev`: API :4000 + web :5173 (reviewer console at `/review`)
- `npm test`: server suite, `node:test` only. One file: `node --test server/tests/<file>.test.js`
- `npm run build`: web production build

## Hard rules

- Never overwrite/delete `server/storage/db.json`, `server/storage/uploads/*`, `server/.env` (owner's real data).
- Every test file touching config/store/app must `import './setup.js'` first (temp `STORAGE_DIR`).
- Tests never hit the network or a paid API; inject fakes (see `fetchImpl` in `refiners/gemini.js`).
- Seller/reviewer-facing text (incl. service errors) is Bahasa Indonesia; code/comments/commits English.
- Routes thin, rules in services; status changes only via `transition()`; services throw `ApiError` with a stable `code`.
- `server/src/data/catalog.js` has zero imports: it is the product definition (categories, styles, marketplaces, packs, brief).
- No new dependency, paid API or secret without asking. Keys live in env vars, documented in `server/.env.example`.
- `menunggu_review` (human QA) is the product: never route generation straight to `selesai`.

## Flow

Upload → order (brief + seller notes screened by `refine.service.js`, optional Gemini refiner in
`services/refiners/`) → pay (mock) → `pipeline.service.js` queue → `image.service.js` generate +
exact marketplace sizing → reviewer approves/rejects (`review.service.js`) → WhatsApp (dry-run).
`prompt.service.js` builds the per-style image prompt (pure function); it is shown to reviewers.
Providers (`IMAGE_PROVIDER`): `mock` (default, pastes the photo; offline fallback), `local` (the
one we use: the Python `pipeline/` cuts the product out over HTTP, `POST /cutout`, and
`image.service.js` composites it on the style backdrop), `gemini` (`services/providers/`, paid,
kept but unused: sends the prompt with the photo, one call per style, logs staff-only `generations`).
Generative backgrounds will be local (Stable Diffusion inpainting, background only).
