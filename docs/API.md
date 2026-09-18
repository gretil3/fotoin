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
| `422` | Validation failed (shape, or the brief exceeds the paid pack) |
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

Everything the order wizard needs in one round trip: `categories`, `marketplaces`, `packs`,
`paymentMethods`, `limits`.

Also available individually: `GET /categories`, `GET /marketplaces`, `GET /packs`.

---

## Orders

### `POST /uploads`

`multipart/form-data`, field name `photos`, 1–`MAX_FILES_PER_ORDER` files.
Accepts JPEG, PNG, WEBP, HEIC up to `MAX_UPLOAD_MB` each.

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
  "paymentMethodId": "qris",
  "photos": [ /* from POST /uploads */ ]
}
```

Validation enforced beyond the schema:

- `styleIds.length` ≤ the pack's `maxStyles`, and every style must belong to `categoryId`
- `marketplaceIds.length` ≤ the pack's `maxMarketplaces`
- at least one photo

**201** — the order, with `status: "menunggu_pembayaran"`, a `payment.qrPayload`, a
`code` (`FTN-XXXXXX`) and a normalised `seller.whatsapp` (`6281234567890`).

### `GET /orders?status=&whatsapp=`

Newest first. Both filters optional; `whatsapp` accepts any local format.

### `GET /orders/:id`

Accepts the internal id **or** the `FTN-XXXXXX` code. Adds `statusLabel`, `plannedOutputs`
and `priceFormatted`.

### `POST /orders/:id/pay`

Settles the mock charge, moves the order to `diproses_ai` and enqueues generation.

> **Development only.** In production, delete this route and drive settlement from
> `POST /webhooks/payment` so the client cannot mark its own order paid.

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

### `GET /messages?orderId=`

The WhatsApp outbox. With `WHATSAPP_ENABLED=false`, messages are recorded here instead of
being sent — useful for reviewing the exact copy a seller receives.

---

## Review (staff only)

All `/review/*` routes require the reviewer token:

```
Authorization: Bearer <REVIEWER_TOKEN>
```
or `X-Reviewer-Token: <REVIEWER_TOKEN>`. Without it: **401**.

### `GET /review/queue`

Orders in `menunggu_review`, priority packs first then oldest first. Each row adds
`waitingMinutes` and `overdue`. Response also carries `pipeline` queue stats.

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

`note` is **required** (**422** without it). Increments `revisionCount`, moves the order to
`revisi`, notifies the seller and re-enqueues generation. Past the pack's revision
allowance: **409 `REVISION_LIMIT`**.

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

Settles the charge, moves the order to `diproses_ai` and enqueues generation. Idempotent:
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
