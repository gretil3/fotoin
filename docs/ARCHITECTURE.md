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
POST /api/v1/uploads          multer writes to storage/uploads, returns photo descriptors
        │
POST /api/v1/orders           zod validates shape
        │                     order.service.createOrder validates against the paid pack
        │                     status: draft ──► menunggu_pembayaran
        │                     payment.service.createCharge issues a QRIS payload
        │                     whatsapp.service sends "order received"
        │
POST /api/v1/orders/:id/pay   (in production: the provider webhook, not the client)
        │                     status ──► diproses_ai
        │                     pipeline.service.enqueue(orderId)
        │
   [async] pipeline           image.service.generateForOrder
        │                       for each style × marketplace × output spec:
        │                         background SVG + contact shadow + product, composited
        │                         written at the exact spec dimensions
        │                     progress written to the order as it goes
        │                     status ──► menunggu_review
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
  product: { name, categoryId, notes },
  packId, priceIdr,
  styleIds[], marketplaceIds[],
  photos[],                    // what the seller uploaded
  payment,                     // charge record: method, qrPayload, status, paidAt
  results[],                   // generated images; `approved` is null until reviewed
  review,                      // reviewer, decision, note, counts, reviewedAt
  revisionCount, dueAt, deliveredAt, progress
}
```

`results[].approved` is tri-state on purpose: `null` = not yet reviewed, `true` = delivered,
`false` = withheld. Withheld frames stay on the record for quality analysis — knowing which
style/category pairs get rejected most is how the presets improve.

## Testing strategy

Unit tests cover the pure logic (catalog integrity, validation, the status machine). The e2e
test boots the real Express app on an ephemeral port and drives it over HTTP, which is what
catches wiring mistakes: middleware order, multipart handling, the reviewer guard, and the
queue actually moving an order to the next state.
