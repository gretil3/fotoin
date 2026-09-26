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
between the two ways of filling it in. Nothing consumes the fragments yet: assembling them
into a prompt arrives with the first real image provider.

### Public vs. staff views of an order

Anyone holding an order id or `FTN-` code can read the order, so the public response masks
the seller's number and omits `lastError` (which can contain server paths). Staff routes
under `/review` return the full record.

## Swap points

Each row is isolated to one file. Nothing outside it needs to change.

| Concern | Today | Production | File |
|---|---|---|---|
| Persistence | JSON file | Postgres + Prisma | `data/store.js` |
| File storage | Local disk, static route | S3/GCS + signed URLs | `app.js`, `middleware/index.js` |
| Job queue | In-process FIFO | BullMQ + Redis | `services/pipeline.service.js` |
| Image model | `mock` compositor | Diffusion/editing API | `services/image.service.js` |
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
