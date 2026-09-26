# API Reference

Base URL: `http://localhost:4000/api/v1`

All responses are JSON. Errors use a consistent envelope, with a message written for the
seller in Bahasa Indonesia:

```json
{
  "error": {
    "code": "TOO_MANY_STYLES",
    "message": "Paket Hemat hanya mencakup 1 gaya. Kurangi pilihan atau naikkan paket.",
    "details": null
  }
}
```

| Status | When |
|---|---|
| `401` | Missing or wrong reviewer token |
| `404` | Unknown order or route |
| `409` | Illegal status transition (e.g. approving an order that is not in review) |
| `413` | Upload too large or too many files |
| `415` | Unsupported image type |
| `422` | Validation failed (shape, an unreadable image, an unknown photo id, or the brief exceeds the paid pack) |
| `501` | A provider is configured but not implemented |

---

## Catalog

### `GET /health`

Liveness, plus the current pipeline configuration.

```json
{
  "status": "ok",
  "service": "fotoin-api",
  "env": "development",
  "provider": "mock",
  "humanReview": true,
  "queue": { "waiting": 0, "running": 0, "maxConcurrent": 2 },
  "time": "2026-09-18T12:16:08.777Z"
}
```

### `GET /catalog`

Everything the order wizard needs in one round trip: `categories`, `briefQuestions`,
`marketplaces`, `packs`, `paymentMethods`, `limits`.

Each category carries its `productTypes` (the options for the brief question "Produk ini
apa?"). `briefQuestions` lists the tap-to-answer questions with their Bahasa labels, `type`
(`single` or `multi`), optional `max`, and `default`. The English prompt fragment behind each
option is **never** included: it stays on the server.

Also available individually: `GET /categories`, `GET /marketplaces`, `GET /packs`.

---

## Orders

### `POST /uploads`

`multipart/form-data`, field name `photos`, 1–`MAX_FILES_PER_ORDER` files, up to
`MAX_UPLOAD_MB` each.

Every file is decoded on arrival, not just checked by its declared Content-Type. A file that
is not a readable image is refused with **422 `UNREADABLE_IMAGE`**, and the whole batch is
discarded (nothing is left orphaned on disk). HEIC passes the type filter but the bundled
`sharp` cannot decode it, so it is currently refused here; the seller is asked to send
JPG or PNG. The server records each accepted file; an order can only reference these records.

```bash
curl -X POST http://localhost:4000/api/v1/uploads \
  -F "photos=@produk.jpg"
```

**201**
```json
{
  "photos": [{
    "id": "aB3dE5fG7h",
    "filename": "1758196800000_xY9kL2mN.jpg",
    "originalName": "produk.jpg",
    "mimeType": "image/jpeg",
    "bytes": 184320,
    "url": "http://localhost:4000/static/uploads/1758196800000_xY9kL2mN.jpg",
    "width": 3024,
    "height": 4032,
    "uploadedAt": "2026-09-18T12:00:00.000Z"
  }]
}
```

### `POST /orders`

Creates the brief, moves it to `menunggu_pembayaran` and issues a charge.

```json
{
  "sellerName": "Ibu Sari",
  "whatsapp": "081234567890",
  "storeName": "Dapur Sari",
  "productName": "Rendang Frozen 500gr",
  "categoryId": "kuliner",
  "packId": "standar",
  "styleIds": ["studio-putih", "meja-kayu"],
  "marketplaceIds": ["shopee", "tokopedia"],
  "notes": "Label harus terbaca jelas.",
  "brief": {
    "answers": {
      "productType": "frozen-kemasan",
      "goal": "foto-utama",
      "keep": ["warna", "label", "bentuk"],
      "mood": ["hangat"]
    }
  },
  "paymentMethodId": "qris",
  "photos": [{ "id": "aB3dE5fG7h" }]   // ids returned by POST /uploads
}
```

**The brief replaces a prompt.** `brief.answers` holds option ids from `GET /catalog`
(`briefQuestions`, plus the category's `productTypes`). The whole `brief`, and every question
in it, is optional: a missing answer takes the question's `default`, so a seller who taps
straight through still places a valid order. For a multi-select an explicit `[]` is kept as a
real choice. `notes` (max 500 characters) is the seller's own words and stays optional.
The stored order gets `brief: { version, answers, usedText }`. `usedText` is set by the server
from whether `notes` is non-empty; a client-sent value is ignored. Refusals (**422**):
`UNKNOWN_BRIEF_QUESTION`, `UNKNOWN_BRIEF_OPTION` (including another category's product type),
`TOO_MANY_BRIEF_OPTIONS` (e.g. more than 2 moods).

Only each photo's `id` is read from the request. Filename, size and URL come from the
server's own upload record, so a client cannot point the generator at another file on disk.
An id the server never issued returns **422 `UNKNOWN_PHOTO`**.

Validation enforced beyond the schema:

- `styleIds.length` ≤ the pack's `maxStyles`, and every style must belong to `categoryId`
- `marketplaceIds.length` ≤ the pack's `maxMarketplaces`
- at least one photo

**The pack's `photoCount` is a hard cap on generated images.** The pipeline renders at most
that many, primary sizes of every style × marketplace pair first, then secondary sizes. A
Premium order with 5 styles and 4 marketplaces is 20 pairs, so it receives 15 images.
`plannedOutputs` on the order is exactly the number that will be produced.

**201** — the order, with `status: "menunggu_pembayaran"`, a `payment.qrPayload` and a
`code` (`FTN-XXXXXX`). Public order responses mask the seller's number
(`seller.whatsapp: "62812*****890"`) and omit `lastError`; staff routes return the full order.

### `GET /orders?whatsapp=`

A seller looks up their own orders by number, newest first; `whatsapp` accepts any local
format and is **required**. Without it the request needs the reviewer token and returns every
order. Optional extra filter: `status`.

> This is interim protection. Anyone who knows a number can list its orders (masked).
> Real seller identity (WhatsApp OTP) is on the [roadmap](ROADMAP.md).

### `GET /orders/:id`

Accepts the internal id **or** the `FTN-XXXXXX` code. Adds `statusLabel`, `plannedOutputs`,
`priceFormatted` and `briefSummary`: the brief as Bahasa labels,
`{ usedText, items: [{ id, question, answers: [labels] }] }`, or `null` for orders placed
before the brief existed. Staff routes under `/review` add `briefSummary` too.

### `POST /orders/:id/pay`

Settles the mock charge, starts the turnaround clock (`dueAt` is recomputed from the moment
of payment), moves the order to `diproses_ai` and enqueues generation.

> **Development only.** It exists only while `PAYMENT_PROVIDER=mock`; with any other provider
> it returns **404**. Settlement then comes from `POST /webhooks/payment` alone, so the client
> cannot mark its own order paid.

### `POST /orders/:id/cancel`

Body: `{ "reason": "..." }` (optional). Fails with `409` from a terminal state.

### `GET /orders/:id/results`

Approved frames only, grouped per marketplace.

```json
{
  "orderId": "V1StGXR8Z5jd",
  "code": "FTN-8KQ2M1",
  "status": "selesai",
  "statusLabel": "Selesai",
  "total": 4,
  "byMarketplace": { "shopee": [ /* ... */ ], "tokopedia": [ /* ... */ ] },
  "results": [{
    "id": "r7Yh2Kq9Lm",
    "url": "http://localhost:4000/static/results/V1StGXR8Z5jd/studio-putih_shopee_1000x1000_aB3dE5.jpg",
    "styleId": "studio-putih",
    "styleName": "Studio Putih Bersih",
    "marketplaceId": "shopee",
    "marketplaceName": "Shopee",
    "label": "Foto Utama 1:1",
    "width": 1000, "height": 1000, "bytes": 98304,
    "approved": true, "reviewerNote": null
  }]
}
```

### `GET /messages?orderId=` (staff only)

The WhatsApp outbox. With `WHATSAPP_ENABLED=false`, messages are recorded here instead of
being sent — useful for reviewing the exact copy a seller receives. Requires the reviewer
token: the outbox holds every seller's full number.

---

## Review (staff only)

All `/review/*` routes require the reviewer token:

```
Authorization: Bearer <REVIEWER_TOKEN>
```
or `X-Reviewer-Token: <REVIEWER_TOKEN>`. Without it: **401**.

### `GET /review/queue`

Orders in `menunggu_review`, priority packs first then oldest first. Each row adds
`waitingMinutes` and `overdue`. Response also carries `pipeline` queue stats, and `failed`:
orders in `gagal` (generation produced nothing usable), each with the raw `lastError`.

### `POST /review/:orderId/retry`

Puts a `gagal` order back through generation. **409 `NOT_FAILED`** for any other status.

An order becomes `gagal` when every planned image fails to render (for example the source
file is missing). It is never sent to review with zero images. The seller is told there is a
technical issue and is not asked to pay again. If only *some* images fail, the rest go to
review and the timeline records how many were lost.

### `GET /review/:orderId`

One order with its original photos and all generated results.

### `POST /review/:orderId/approve`

```json
{
  "reviewer": "qa-web",
  "note": "Versi 3:4 dipangkas, sisanya bagus.",
  "rejectedResultIds": ["r7Yh2Kq9Lm"]
}
```

Marks listed frames `approved: false`, the rest `approved: true`, moves the order to
`selesai`, sets `deliveredAt`, and sends the delivery message. Rejecting *every* frame
returns **422** — use the reject endpoint instead.

### `POST /review/:orderId/reject`

```json
{ "reviewer": "qa-web", "note": "Warna kain terlalu pucat." }
```

`note` is **required** (**422** without it). Increments `qaRerunCount`, moves the order to
`revisi`, notifies the seller and re-enqueues generation. After `REVIEW_MAX_RERUNS` (default
2) reruns: **409 `QA_RERUN_LIMIT`**, which exists only to stop an endless generate/reject
loop.

A rejection is *our* quality failure, so it does **not** touch `revisionCount`. That field
is reserved for revisions the seller asks for, which count against the pack's
`freeRevisions` (seller-requested revisions are not built yet).

---

## Webhooks

### `GET /webhooks/whatsapp`

Meta's subscription handshake. Echoes `hub.challenge` when `hub.verify_token` matches
`WHATSAPP_VERIFY_TOKEN`, otherwise **403**.

### `POST /webhooks/whatsapp`

Inbound seller messages. Currently logs them and replies with an order status update when
the sender maps to a known order. Always returns **200** quickly — Meta retries otherwise.

> Not yet implemented: `X-Hub-Signature-256` verification. Required before going live.

### `POST /webhooks/payment`

```json
{ "orderCode": "FTN-8KQ2M1", "status": "paid" }
```

Settles the charge, starts the turnaround clock, moves the order to `diproses_ai` and
enqueues generation (same code path as the dev `/pay` shortcut). Idempotent:
an order that is not awaiting payment returns `{ "ok": true, "ignored": true }`. With a real
provider, the signature is checked against `PAYMENT_SERVER_KEY`.

---

## Static files

| Path | Serves |
|---|---|
| `/static/uploads/:filename` | Seller-uploaded originals |
| `/static/results/:orderId/:filename` | Generated images |

Public and unauthenticated in development. Move behind signed URLs before production.

---

## Full flow with curl

```bash
BASE=http://localhost:4000/api/v1

PHOTOS=$(curl -s -X POST $BASE/uploads -F "photos=@produk.jpg" | jq -c .photos)

ORDER=$(curl -s -X POST $BASE/orders -H 'Content-Type: application/json' -d "{
  \"sellerName\":\"Ibu Sari\", \"whatsapp\":\"081234567890\",
  \"productName\":\"Rendang Frozen 500gr\", \"categoryId\":\"kuliner\",
  \"packId\":\"hemat\", \"styleIds\":[\"studio-putih\"],
  \"marketplaceIds\":[\"shopee\"], \"photos\":$PHOTOS }")
ID=$(echo $ORDER | jq -r .order.id)

curl -s -X POST $BASE/orders/$ID/pay > /dev/null
sleep 5                                     # generation runs async

curl -s $BASE/review/queue -H "Authorization: Bearer dev-reviewer-token" | jq '.count'
curl -s -X POST $BASE/review/$ID/approve \
  -H "Authorization: Bearer dev-reviewer-token" \
  -H 'Content-Type: application/json' -d '{"reviewer":"qa"}' | jq -r '.order.status'

curl -s $BASE/orders/$ID/results | jq '.total, .results[].url'
```
