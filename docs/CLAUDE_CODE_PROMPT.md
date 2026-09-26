# Claude Code prompt: taking FOTOIN from prototype to working product

How to use this file: open Claude Code in the repo root and paste everything below the line
into the first message. To move to a later phase, keep the whole prompt and replace only the
**Current task** section with the next item from **Roadmap of tasks**.

---

## Who you are working for and what this is

You are working on **FOTOIN**, a venture-creation (university) project turning into a real
service. FOTOIN is a **hybrid AI product-photography service for Indonesian UMKM sellers**.
A seller uploads phone photos, picks a category and a style (never writes a prompt), pays
Rp15.000-25.000 per pack, and receives marketplace-ready images (exact Shopee / Tokopedia /
TikTok Shop / Instagram sizes) after **a human reviewer has approved them**.

The business only works if three things are true, and every decision you make should protect them:

1. **Nothing reaches a seller that a person has not looked at.** The `menunggu_review` state
   is the product, not a setting.
2. **The seller never writes a prompt.** Prompts are ours, encoded per style in
   `server/src/data/catalog.js`.
3. **Cost per order stays far below the price.** Every paid API call has to be justified
   against a Rp20.000 order. Human review time is the biggest cost, so the fewer bad images
   reach the reviewer, the better.

Read these first, in this order, before touching code: `README.md`, `docs/ARCHITECTURE.md`,
`docs/API.md`, `docs/BUSINESS.md`, `docs/ROADMAP.md`, `docs/CONTRIBUTING.md`.

## Current state (verified, not aspirational)

Stack: Node 20+ ES modules, Express 4, `sharp`, `zod`, `multer`; React 18 + Vite + React Router.
npm workspaces monorepo (`server/`, `web/`). Start with `npm run dev`; test with `npm test`
(47 tests, all passing); build with `npm run build`.

**What genuinely works:** the 4-step seller wizard, server-side pack-limit validation, the
order status machine, the async queue with progress, exact marketplace pixel sizing, the
reviewer console (approve, drop frames, reject with a note, retry failed orders), and a
hardened set of endpoints (uploads are decoded and recorded, orders may only use server-issued
photo ids, the pack's `photoCount` is a hard cap via `planOutputs()`, empty generations become
`gagal` instead of reaching review, interrupted jobs are recovered at boot, order listing and
the WhatsApp outbox are staff-only, public responses mask phone numbers).

**What is fake, and you must not pretend otherwise:**

| Area | Reality |
|---|---|
| **Image generation** | The `mock` provider does **not** remove or replace the background. It pastes the seller's whole photo, as a rectangle, on a gradient. Output is not sellable. This is the biggest gap. |
| Payments | Fake QRIS string; `POST /orders/:id/pay` (mock only) and a webhook that accepts anything under the mock provider |
| WhatsApp | Dry-run only: messages are logged and stored. The inbound bot does not exist. |
| Auth | Reviewer token is a `VITE_` variable, so it ships in the public JS bundle and is not secret. Sellers have no accounts. |
| Storage | JSON file + local disk + in-memory queue. Fine for a pilot, not for scale. |

## Non-negotiable working rules

- **Never overwrite or delete `server/storage/db.json`, `server/storage/uploads/*` or
  `server/.env`.** They hold the owner's real dev data. Tests are isolated by
  `server/tests/setup.js` (temp `STORAGE_DIR`). **Every test file that touches config, the store
  or the app must `import './setup.js'` as its first import.** To try things against real data,
  copy storage and point `STORAGE_DIR` at the copy.
- All seller- and reviewer-facing text is **Bahasa Indonesia**, including errors thrown from
  services. Code, comments and commit messages are English.
- Follow `docs/CONTRIBUTING.md`: routes stay thin, business rules live in services, status
  changes go only through `transition()`, services throw `ApiError` with a stable `code`,
  `catalog.js` has **zero imports**, comments explain *why* not *what*.
- **Do not add a dependency, a paid API, or a secret without asking me first.** Propose the
  option with its trade-offs (cost per image, quality, licence, failure modes) and wait for my
  choice. Never put API keys in code, tests or committed files; env vars only, documented in
  `server/.env.example`.
- Tests must never call a paid or networked service. Use the `mock` provider or recorded fixtures.
- **Do not commit or push unless I ask.** When I do ask, use conventional-commit prefixes.
- Do not weaken a test to make it pass. If a test is wrong, say why and fix it deliberately.
- Report faithfully: if something fails, is skipped, or you could not verify it, say so with
  the actual output. Do not claim "works" without running it.

## Current task: real image generation (Roadmap task 1)

**Goal:** replace the mock with a provider that produces images a seller could actually list,
while keeping everything else in the pipeline (sizing, cap, review, failure handling) unchanged.

**Why it matters:** until this exists, no seller can be shown a result, and the pilot
assumptions in `docs/BUSINESS.md` (A1 will they pay, A2 does QA fit in ~3 minutes) cannot be tested.

**Requirements**

1. Create `server/src/services/providers/` with one module per provider behind a single
   contract, e.g. `generate({ sourcePath, style, order, note }) -> Buffer | filePath`, plus a
   small registry selected by `IMAGE_PROVIDER` (already read in `config.generation`).
   `mock` stays as the default for tests and offline demos. `renderOutput` in
   `image.service.js` (padding, exact marketplace sizing) stays provider-agnostic.
2. **Product fidelity comes first.** A wrong label, colour or shape on a real listing is worse
   than a plain background. For solid/studio styles prefer **background removal + compositing**
   so the product's own pixels are untouched. Use a generative image-edit model only for
   lifestyle scenes, where the human reviewer is the safety net. Recommend which approach fits
   each of the 20 styles, and explain why, before implementing.
3. Add a `prompt` field to every style in `catalog.js` (per vertical, in English or Indonesian as
   the provider needs; the seller never sees it). Extend `tests/catalog.test.js` so a style
   without a prompt fails the build. Feed the reviewer's rejection `note` into `generate()`, so a
   rerun is not byte-identical to the rejected batch.
4. Failure behaviour is already defined: an error thrown for an image is collected in `failed`,
   and if nothing renders the order becomes `gagal`. Do not swallow errors. Add timeouts and a
   bounded retry with backoff for network providers, and never leak provider errors, URLs or
   keys into seller-visible fields (`lastError` is staff-only).
5. Record per-image provider, model and cost estimate on each result, so unit economics can be
   measured from real orders. Add a config ceiling (e.g. max images or max spend per order) so a
   bug cannot run up a bill.
6. Fix `HEIC` properly or leave it explicitly unsupported: today uploads are decoded by `sharp`,
   whose prebuilt binary cannot read HEIC, so those are refused with a clear message.

**How to work**

1. First, produce a short written proposal: provider options, cost per image, expected quality
   per style group, risks, and your recommendation. **Stop and wait for my approval.**
2. Implement behind the contract with `mock` unchanged, then add the real provider.
3. Verify with your own eyes, not only with tests: generate output from a genuinely messy phone
   photo (cluttered background, a product with readable label text) and look at the images.
   Report what is wrong with them honestly. A unit test cannot tell you a label got mangled.
4. Run `npm test` and `npm run build`. Confirm `server/storage/db.json` is byte-identical before
   and after (checksum it).

**Acceptance criteria**

- With a real provider configured, a messy phone photo produces images with the original
  background actually gone, at the exact sizes in `catalog.js`, respecting the pack's `photoCount`.
- With `IMAGE_PROVIDER=mock`, everything behaves as before and all tests pass offline.
- The pipeline still ends in `menunggu_review` (never straight to `selesai`) unless
  `REQUIRE_HUMAN_REVIEW=false`.
- A provider outage or bad API key results in a `gagal` order with a staff-visible reason and a
  working retry, never a hung order or an empty review.
- `docs/ARCHITECTURE.md`, `docs/API.md` and `.env.example` are updated to match.

## Roadmap of tasks (replace "Current task" with the next one when this is done)

2. **Persistence:** replace the JSON store with SQLite (or Postgres) behind the existing
   `collection()` interface, so only `store.js` changes. Migrate existing `db.json` safely.
3. **Real payments:** Midtrans or Xendit QRIS. Settle only from a verified webhook (verify against
   the raw body, not `JSON.stringify(req.body)`; the current `verifyWebhook` is wrong for real
   providers and `timingSafeEqual` throws on a length mismatch). Delete `/pay`. Refuse to boot in
   production with `PAYMENT_PROVIDER=mock`.
4. **WhatsApp Cloud API:** delivery first, bot later. Business-initiated messages outside the
   24-hour window need pre-approved templates. Webhook signature verification needs the raw body.
5. **Real auth:** seller identity by WhatsApp OTP or tokenised order links; reviewer accounts
   instead of a bundled token. Remove the interim phone-lookup listing.
6. **Storage:** S3/R2 with signed URLs; store relative paths (result URLs currently bake in
   `PUBLIC_URL`); fix the `download` attribute, which browsers ignore for cross-origin URLs.
7. **Seller-requested revisions:** an endpoint and flow that counts against the pack's
   `freeRevisions` via `revisionCount` (distinct from reviewer `qaRerunCount`).

## Known open questions for the owner (ask, do not guess)

- What is a "photo" in a pack? A Hemat pack promises 5 photos but 1 style x 1 marketplace yields
  2 sizes. Premium with 5 styles x 4 marketplaces is 20 style/marketplace pairs against a
  15-image budget, so some combinations are dropped. Is that acceptable or should packs be redefined?
- Pilot shortcut: is a **concierge MVP** acceptable for the 20-seller pilot (static QRIS with an
  admin "mark paid" button, delivery via a `wa.me` link) so payments/WhatsApp integration can wait?
