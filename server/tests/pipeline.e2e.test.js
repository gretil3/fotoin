/**
 * End-to-end walk through the FOTOIN promise:
 * upload -> order -> pay -> AI generate -> human review -> delivery.
 *
 * Boots the real Express app on an ephemeral port and talks to it over HTTP,
 * so routing, validation, multipart upload, the queue and the reviewer guard
 * are all exercised together.
 */
process.env.NODE_ENV = 'test';
process.env.MOCK_GENERATION_DELAY_MS = '0';
process.env.REQUIRE_HUMAN_REVIEW = 'true';
process.env.REVIEWER_TOKEN = 'test-reviewer-token';

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const { createApp } = await import('../src/app.js');
const { default: config } = await import('../src/config/env.js');
const { __resetForTests } = await import('../src/data/store.js');

let server;
let baseUrl;
const createdOrderIds = [];

const json = async (path_, options = {}) => {
  const response = await fetch(`${baseUrl}${path_}`, {
    ...options,
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
    body:
      options.body instanceof FormData || typeof options.body === 'string'
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });
  return { status: response.status, body: await response.json() };
};

/** A stand-in for a blurry phone snap: a small solid-colour JPEG. */
const sampleJpeg = async () => {
  const { default: sharp } = await import('sharp');
  return sharp({
    create: { width: 900, height: 1200, channels: 3, background: '#c86b3a' },
  })
    .jpeg()
    .toBuffer();
};

const waitForStatus = async (orderId, status, timeoutMs = 20000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { body } = await json(`/api/v1/orders/${orderId}`);
    if (body.order.status === status) return body.order;
    if (body.order.status === 'dibatalkan') throw new Error('order was cancelled');
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`timed out waiting for status "${status}"`);
};

before(async () => {
  __resetForTests();
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  for (const id of createdOrderIds) {
    await fs.rm(path.join(config.paths.results, id), { recursive: true, force: true });
  }
});

test('health endpoint reports the hybrid configuration', async () => {
  const { status, body } = await json('/api/v1/health');
  assert.equal(status, 200);
  assert.equal(body.status, 'ok');
  assert.equal(body.humanReview, true, 'human review must stay on by default');
});

test('catalog serves everything the order wizard needs', async () => {
  const { body } = await json('/api/v1/catalog');
  assert.equal(body.categories.length, 4);
  assert.equal(body.packs.length, 3);
  assert.ok(body.marketplaces.some((market) => market.id === 'shopee'));
  assert.ok(body.limits.maxFiles >= 1);
});

test('full order journey: upload, pay, generate, review, deliver', async (t) => {
  // 1. Snap + Send: upload the seller's phone photo.
  const form = new FormData();
  form.append('photos', new Blob([await sampleJpeg()], { type: 'image/jpeg' }), 'produk.jpg');

  const uploaded = await json('/api/v1/uploads', { method: 'POST', body: form });
  assert.equal(uploaded.status, 201);
  assert.equal(uploaded.body.photos.length, 1);

  // 2. Create the brief. The order starts life awaiting payment.
  const created = await json('/api/v1/orders', {
    method: 'POST',
    body: {
      sellerName: 'Ibu Sari',
      whatsapp: '081234567890',
      storeName: 'Dapur Sari',
      productName: 'Rendang Frozen 500gr',
      categoryId: 'kuliner',
      packId: 'hemat',
      styleIds: ['studio-putih'],
      marketplaceIds: ['shopee'],
      photos: uploaded.body.photos,
    },
  });
  assert.equal(created.status, 201);
  const order = created.body.order;
  createdOrderIds.push(order.id);
  assert.equal(order.status, 'menunggu_pembayaran');
  assert.ok(order.payment.qrPayload, 'a QRIS payload should be issued');
  assert.equal(order.seller.whatsapp, '6281234567890');

  // 3. Pay -> the pipeline picks the order up.
  const paid = await json(`/api/v1/orders/${order.id}/pay`, { method: 'POST' });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.order.payment.status, 'paid');

  // 4. Generate -> AI output waits for a human, it is NOT delivered yet.
  const inReview = await waitForStatus(order.id, 'menunggu_review');
  assert.equal(inReview.results.length, 2, 'Shopee declares two output sizes');
  assert.equal(inReview.deliveredAt, null);

  await t.test('generated files match the marketplace specs exactly', async () => {
    const { default: sharp } = await import('sharp');
    for (const result of inReview.results) {
      const file = path.join(config.paths.results, order.id, result.filename);
      const meta = await sharp(file).metadata();
      assert.equal(meta.width, result.width);
      assert.equal(meta.height, result.height);
    }
    const sizes = inReview.results.map((r) => `${r.width}x${r.height}`).sort();
    assert.deepEqual(sizes, ['1000x1000', '1200x1200']);
  });

  await t.test('the review queue is staff-only', async () => {
    const anonymous = await json('/api/v1/review/queue');
    assert.equal(anonymous.status, 401);
  });

  const auth = { Authorization: `Bearer ${process.env.REVIEWER_TOKEN}` };

  await t.test('the order shows up in the reviewer queue', async () => {
    const { body } = await json('/api/v1/review/queue', { headers: auth });
    assert.ok(body.queue.some((row) => row.id === order.id));
  });

  // 5. Review -> approve, dropping one frame that did not pass QA.
  const approved = await json(`/api/v1/review/${order.id}/approve`, {
    method: 'POST',
    headers: auth,
    body: { reviewer: 'qa-test', rejectedResultIds: [inReview.results[0].id] },
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.order.status, 'selesai');
  assert.equal(approved.body.order.review.approvedCount, 1);
  assert.ok(approved.body.order.deliveredAt);

  // 6. Deliver -> only approved frames reach the seller.
  const results = await json(`/api/v1/orders/${order.id}/results`);
  assert.equal(results.body.total, 1);
  assert.ok(results.body.byMarketplace.shopee);

  // ...and a WhatsApp delivery message was queued for them.
  const outbox = await json(`/api/v1/messages?orderId=${order.id}`);
  assert.ok(outbox.body.messages.some((message) => message.kind === 'delivery'));
});

test('a rejected order goes back through the pipeline', async () => {
  const form = new FormData();
  form.append('photos', new Blob([await sampleJpeg()], { type: 'image/jpeg' }), 'produk.jpg');
  const uploaded = await json('/api/v1/uploads', { method: 'POST', body: form });

  const created = await json('/api/v1/orders', {
    method: 'POST',
    body: {
      sellerName: 'Pak Budi',
      whatsapp: '082199887766',
      productName: 'Hijab Voal Premium',
      categoryId: 'fashion-muslim',
      packId: 'hemat',
      styleIds: ['studio-putih'],
      marketplaceIds: ['tokopedia'],
      photos: uploaded.body.photos,
    },
  });
  const order = created.body.order;
  createdOrderIds.push(order.id);

  await json(`/api/v1/orders/${order.id}/pay`, { method: 'POST' });
  await waitForStatus(order.id, 'menunggu_review');

  const auth = { Authorization: `Bearer ${process.env.REVIEWER_TOKEN}` };

  const noNote = await json(`/api/v1/review/${order.id}/reject`, {
    method: 'POST',
    headers: auth,
    body: { reviewer: 'qa-test' },
  });
  assert.equal(noNote.status, 422, 'a revision note is mandatory');

  const rejected = await json(`/api/v1/review/${order.id}/reject`, {
    method: 'POST',
    headers: auth,
    body: { reviewer: 'qa-test', note: 'Warna kain terlalu pucat.' },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body.order.revisionCount, 1);

  // It re-enters generation and lands back in the review queue.
  const reprocessed = await waitForStatus(order.id, 'menunggu_review');
  assert.ok(reprocessed.results.length > 0);
});

test('validation rejects a brief that exceeds the paid pack', async () => {
  const { status, body } = await json('/api/v1/orders', {
    method: 'POST',
    body: {
      sellerName: 'Uji Coba',
      whatsapp: '081200000000',
      productName: 'Lilin Aromaterapi',
      categoryId: 'kerajinan',
      packId: 'hemat',
      styleIds: ['studio-putih', 'natural-linen'],
      marketplaceIds: ['shopee'],
      photos: [{ id: 'x', filename: 'x.jpg' }],
    },
  });
  assert.equal(status, 422);
  assert.match(body.error.message, /hanya mencakup 1 gaya/);
});
