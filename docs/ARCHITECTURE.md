# Architecture

## Shape of the system

```
┌──────────────┐        ┌───────────────────────────────────────────────┐
│  React SPA   │        │              Express API (:4000)              │
│   (:5173)    │        │                                               │
│              │ HTTP   │  routes/ ──► services/ ──► data/store.js      │
│  seller      ├───────►│     │            │                            │
│  wizard      │        │     │            ├─► image.service   (sharp)  │
│              │        │     │            ├─► pipeline.service (queue) │
│  reviewer    │        │     │            ├─► payment.service  (QRIS)  │
│  console     │        │     │            └─► whatsapp.service         │
└──────────────┘        │     └─► middleware/ (upload, auth, errors)    │
                        └───────────────┬───────────────────────────────┘
                                        │
                              storage/uploads  storage/results
                                 (served at /static/*)
```

One process, one JSON file, no external services required. Every piece that would need to
be different in production is isolated behind a module boundary, listed under
[Swap points](#swap-points).

## Request flow: creating an order

```
POST /api/v1/uploads          multer writes to storage/uploads, each file is decoded to prove it
        │                     is an image, and recorded; returns photo descriptors
        │
POST /api/v1/orders           zod validates shape; photo ids are resolved to the server's own
        │                     upload records (never client-supplied filenames)
        │                     order.service.createOrder validates against the paid pack
        │                     status: draft ──► menunggu_pembayaran
        │                     payment.service.createCharge issues a QRIS payload
        │                     whatsapp.service sends "order received"
        │
POST /api/v1/orders/:id/pay   (mock provider only; in production the provider webhook)
        │                     checkout.service.confirmPayment: shared with the webhook
        │                     status ──► diproses_ai, dueAt restarts from payment
        │                     pipeline.service.enqueue(orderId)
        │
   [async] pipeline           order.service.planOutputs decides WHAT to render, capped at
        │                     the pack's photoCount (primary sizes first)
        │                     image.service.generateForOrder renders exactly that list:
        │                       background SVG + contact shadow + photo, composited
        │                       written at the exact spec dimensions
        │                     progress written to the order as it goes
        │                     zero images rendered ──► status gagal (never reaches review)
        │                     otherwise            ──► status menunggu_review
        │
GET  /api/v1/review/queue     reviewer console polls (priority packs first)
POST /api/v1/review/:id/approve
        │                     rejected frames marked approved:false
        │                     status ──► selesai, deliveredAt set
        │                     whatsapp.service sends the delivery message
        │
GET  /api/v1/orders/:id/results   returns approved frames only, grouped per marketplace
```

## Module boundaries

| Module | Owns | Must not |
|---|---|---|
| `routes/` | HTTP shape: parsing, status codes, response envelopes | Contain business rules |
| `services/` | All business logic; throws `ApiError` with Bahasa messages | Know about `req`/`res` |
| `data/store.js` | Persistence | Contain domain rules |
| `data/catalog.js` | The product definition: verticals, styles, specs, prices | Import anything |
| `middleware/` | Cross-cutting concerns | Touch domain state |

`catalog.js` deliberately has zero imports. It is the single source of truth for what FOTOIN
sells, and it is the file a non-engineer should be able to read. Changing a price, adding a
style preset or supporting a new marketplace is an edit to that one file — the pipeline,
validation and UI all read from it.

## Key design decisions

### The human review step is structural, not a setting

`ORDER_STATUS.AWAITING_REVIEW` sits between generation and delivery in the status machine
itself (`order.service.js`). `GET /orders/:id/results` filters out anything a reviewer
rejected. There is no code path that ships an unreviewed image to a seller while
`REQUIRE_HUMAN_REVIEW=true`.

### Pack limits are enforced server-side

The wizard disables options the seller's pack does not cover, but that is a courtesy. The
same limits are re-checked in `createOrder`, which is what the e2e test asserts. A seller
who edits the request body still gets exactly what they paid for.

### `contain`, never `cover`

Marketplace outputs pad with the style background rather than cropping. A crop can cut the
label off a jar or the sleeve off a gamis, and a wrong crop is worse than a plain one. Padding
is always safe, and the product fills ~74% of the frame with margin for marketplace UI chrome.

### Providers make the product image, the renderer makes the listing

`services/providers/` holds one module per `IMAGE_PROVIDER`, each with
`generate({ sourcePath, style, order, note }) -> Buffer`. `local` posts the photo to the Python
pipeline's `POST /cutout` and gets back the color-corrected product as a transparent PNG:
product pixels are cut out, never regenerated, so labels and colours stay true. `renderOutput`
then adds the style background, shadow and exact marketplace size, the same for every provider.
`generate` is called once per (photo, style) and shared by that style's sizes. A provider error
fails only that image (`failed`); network errors and 5xx are retried once; an unknown
`IMAGE_PROVIDER` fails the order with the reason in `lastError`. Each result records `provider`.

### sharp is optional at runtime

`image.service.js` imports sharp lazily inside a `try/catch`. If the native binary will not
load, rendering degrades to copying the source file and flags `degraded: true` on the result
rather than failing the order. Useful on locked-down machines during a demo.

### Generation is async, status is polled

The API never blocks on image generation. `pipeline.service.js` runs a FIFO queue with a
concurrency of 2, writing `progress: {done, total}` to the order as it works; the frontend
polls every 3 seconds while the order is in a live state. Swapping in a real queue does not
change the API contract.

### The queue is memory, the orders are not

A restart forgets the in-memory queue but not the database, so `index.js` calls
`recoverInterruptedJobs()` at boot to re-enqueue every order still in `diproses_ai` or
`revisi`. `enqueue` ignores an order that is already waiting, so recovery cannot double a job.
A job that fails does not leave the order stranded in `diproses_ai`: it moves to `gagal`,
which staff can retry. When the queue moves to BullMQ the durable queue replaces this.

### One planner decides what gets generated

`planOutputs()` in `order.service.js` is the only place that decides which images an order
gets. The generator renders that list and the "N photos planned" figure reads its length, so
what a seller was promised and what we pay to produce cannot drift apart.

### The seller brief stands in for a prompt

Sellers never write a prompt. They answer a few questions by tapping (`BRIEF_QUESTIONS` and
each category's `productTypes` in `catalog.js`) and may add their own words in
`product.notes`. Each option carries a Bahasa `label` for the seller and an English `prompt`
fragment for the image model. `brief.service.js` validates answers against those option ids,
so the only prompt text a tap can produce is text we wrote. The free text is kept apart and
must be treated as a description, never as instructions. Prompt fragments are stripped from
every public catalog response.

The brief is stored as `{ version, answers, usedText }`. `usedText` (did the seller write their
own words?) is derived server-side so the pilot can compare rejection rates and QA time
between the two ways of filling it in.

### The seller's own words are screened, then refined

`refine.service.js` handles `product.notes` (and the product name) before any of it reaches a
model. It is pure: no network, no clock.

1. **Screening.** The text is cut into pieces at sentence ends, line breaks, ", ", joining words
   and polite openers ("tolong"). A piece that instructs the AI ("abaikan aturan", "ignore
   previous instructions", a forged `RULES` heading) or asks for what we never do (add text, a
   logo or a price; add people or a model; change the product's colour, shape or label) is
   dropped with a reason code; the rest of the text stays byte for byte. Negations ("jangan
   tambahkan logo", "tanpa orang") are kept: they agree with our rules. An attack spread over
   several lines is caught by reading the text as one line.
2. **Refinement.** What is left becomes English lines: keep (reusing the catalog's own keep
   wording), avoid, view preferences, written moods, product colours and quoted label text.
   The rules cover the common phrasing, including every quick phrase the wizard offers.
3. **AI, optional.** With `REFINER_PROVIDER=gemini`, `services/refiners/` asks a Gemini model
   for the same structure. Its answer is validated and screened like seller text; an
   instruction anywhere discards it. Any failure falls back to the rules, and the reason is
   recorded in `refinement.fallbackReason`.

The pipeline refines once per order, just before generation, and stores the result on the
order as `refinement`. A rerun reuses it (a key over the inputs detects edited text), so a
paid refiner is never called twice for the same words and a reviewer compares attempts built
from the same brief. Unpaid orders never reach it. Screening is a filter, not a guarantee:
whatever slips through is still quoted and labelled as data, and the fixed rules come last.

`prompt.service.js` turns the brief and the refinement into the final image prompt: a pure
function of the order and the catalog, layered as task, product (name, the category's own
`prompt`, type), scene (the style's `prompt`, goal, mood, seller preferences), keep-unchanged,
avoid, the seller's words (quoted, flattened to one line, labelled as data), reviewer feedback
on a rerun, and the fixed rules last. Staff can read the result per style, with the
refinement, at `GET /review/:orderId/prompts`. Nothing sends the prompt to an image model yet:
that arrives with the first real image provider.

### Public vs. staff views of an order

Anyone holding an order id or `FTN-` code can read the order, so the public response masks
the seller's number and omits `lastError` (which can contain server paths) and `refinement`
(prompt text). What the seller needs from the refinement, which of their sentences were
ignored and why, is in `briefSummary.ignored`. Staff routes under `/review` return the full
record.

## Swap points

Each row is isolated to one file. Nothing outside it needs to change.

| Concern | Today | Production | File |
|---|---|---|---|
| Persistence | JSON file | Postgres + Prisma | `data/store.js` |
| File storage | Local disk, static route | S3/GCS + signed URLs | `app.js`, `middleware/index.js` |
| Job queue | In-process FIFO | BullMQ + Redis | `services/pipeline.service.js` |
| Image model | `mock` rectangle, or `local` cutout (Python `pipeline/`, `IMAGE_PROVIDER=local`) | + generative backgrounds for lifestyle styles | `services/providers/` |
| Seller text refiner | Built-in rules | Gemini (`REFINER_PROVIDER=gemini`), rules as fallback | `services/refiners/` |
| Payments | Fake QRIS payload | Midtrans / Xendit | `services/payment.service.js` |
| WhatsApp | Logged dry-run | Cloud API | `services/whatsapp.service.js` |
| Reviewer auth | Shared bearer token | Accounts + roles | `middleware/index.js` |

## Data model

```js
Order {
  id, code,                    // code is the FTN-XXXXXX the seller quotes over WhatsApp
  status, timeline[],          // every transition, with a timestamp and a note
  seller:  { name, whatsapp, storeName },
  product: { name, categoryId, notes },   // notes: the seller's own words (optional)
  brief:   { version, answers, usedText }, // tap answers as option ids; null on older orders
  refinement,                  // notes screened + refined (rules or AI), stored at generation; staff-only
  packId, priceIdr,
  styleIds[], marketplaceIds[],
  photos[],                    // what the seller uploaded
  payment,                     // charge record: method, qrPayload, status, paidAt
  results[],                   // generated images; `approved` is null until reviewed
  review,                      // reviewer, decision, note, counts, reviewedAt
  revisionCount,               // revisions the SELLER asked for (counts against freeRevisions)
  qaRerunCount,                // times a reviewer sent it back: our own quality failures
  dueAt,                       // restarts when payment is confirmed
  deliveredAt, progress,
  lastError                    // raw failure reason, staff-only
}

Upload { id, filename, originalName, mimeType, bytes, width, height, url, uploadedAt }
                               // the server's record of every accepted file; orders reference these
```

`results[].approved` is tri-state on purpose: `null` = not yet reviewed, `true` = delivered,
`false` = withheld. Withheld frames stay on the record for quality analysis — knowing which
style/category pairs get rejected most is how the presets improve.

## Testing strategy

Unit tests cover the pure logic (catalog integrity, validation, the status machine). The e2e
test boots the real Express app on an ephemeral port and drives it over HTTP, which is what
catches wiring mistakes: middleware order, multipart handling, the reviewer guard, and the
queue actually moving an order to the next state.
