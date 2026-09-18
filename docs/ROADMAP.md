# Roadmap

Phases are ordered by what has to be *learned*, not by what is fun to build. Each phase has
an exit condition; do not start the next one until it is met.

---

## Phase 0 — Prototype ✅ (this repository)

Everything needed to demo and to run a manual pilot.

- [x] Four UMKM verticals with prompt-less style presets
- [x] Exact output specs for Shopee, Tokopedia, TikTok Shop, Instagram
- [x] Three non-subscription packs, Rp15.000–Rp25.000
- [x] Four-step seller wizard, Bahasa Indonesia throughout
- [x] Async generation pipeline with live progress
- [x] Reviewer console: approve, drop individual frames, reject with a note
- [x] Mock QRIS charge + WhatsApp message templates (dry-run)
- [x] End-to-end test covering upload → pay → generate → review → deliver

**Exit condition:** a stranger can run `npm run dev` and complete the loop unaided.

---

## Phase 1 — Pilot (target: 20 paying sellers, one vertical)

The point of this phase is to test assumptions **A1** (will they pay) and **A2** (can QA fit
in 3 minutes) from [BUSINESS.md](BUSINESS.md). Build only what those tests require.

**Build**
- [ ] Real image model behind `image.service.js` — background replacement with product fidelity
- [ ] Postgres via Prisma, replacing `data/store.js`
- [ ] S3/GCS storage with signed URLs
- [ ] Live QRIS through Midtrans or Xendit, settled by webhook only
- [ ] Delete `POST /orders/:id/pay`
- [ ] WhatsApp Cloud API delivery (send only), with signature verification on the webhook
- [ ] Reviewer accounts instead of a shared token
- [ ] Per-order QA stopwatch, and a structured rejection log (reason codes, not free text alone)

**Explicitly not yet:** WhatsApp ordering bot, multiple verticals, anything self-serve at
scale, a mobile app.

**Exit condition:** 20 sellers have paid real money, median QA time is measured (not guessed),
and the rejection log shows which presets fail and why.

---

## Phase 2 — WhatsApp-first (target: 200 sellers, three verticals)

**Build**
- [ ] Conversational intake bot: photo → category → style → pack → QRIS, entirely in chat
- [ ] WhatsApp OTP login, so the web app and the bot share one identity
- [ ] Revision requests handled by replying to the delivery message
- [ ] Reviewer batch mode — approve a whole batch in one action, with keyboard shortcuts
- [ ] Preset v2 per vertical, rewritten from Phase 1 rejection data
- [ ] Referral incentive (a free pack for a referral that converts)
- [ ] BullMQ + Redis, replacing the in-process queue

**Exit condition:** most orders arrive through WhatsApp without a human in the loop before
generation, and 60-day repeat rate is measured (assumption **A3**).

---

## Phase 3 — Scale (target: 1.000+ sellers, all four verticals)

**Build**
- [ ] Auto-approve the styles whose QA rejection rate is provably near zero, keeping humans on
      the rest — this is how QA cost per order drops without dropping the promise
- [ ] Marketplace integrations: push images straight into a Shopee/Tokopedia listing
- [ ] Bulk mode for sellers with large catalogues
- [ ] Brand kit: a seller's own colours, logo watermark, consistent look across products
- [ ] Reviewer performance dashboard; a small paid reviewer pool
- [ ] Partnership onboarding: bulk pack purchase for a UMKM association cohort

**Exit condition:** contribution margin holds above 50% while volume grows — meaning QA cost
per order fell as planned rather than tracking volume linearly.

---

## Later, if earned

- Short product videos (the same pipeline, different output specs)
- Marketplace-ready copy: title, description, keywords alongside the images
- Reseller white-label — an agency running FOTOIN under their own name
- Expansion to a comparable market (Philippines, Vietnam) once the playbook is proven

---

## Explicit non-goals

Saying no to these is what keeps the product understandable:

- **A general-purpose image editor.** We sell finished results, not a canvas.
- **Prompt input.** The moment a seller writes a prompt, we are a tool and our positioning is gone.
- **A subscription tier before repeat behaviour exists.** Earn the recurrence first.
- **Removing the human check to cut cost.** Phase 3 narrows *where* humans look based on
  evidence; it never removes accountability for a wrong result.
