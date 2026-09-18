import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetForTests } from '../src/data/store.js';
import {
  ORDER_STATUS,
  canTransition,
  createOrder,
  normalizeWhatsapp,
  plannedOutputCount,
  transition,
} from '../src/services/order.service.js';

const validBrief = (overrides = {}) => ({
  sellerName: 'Ibu Sari',
  whatsapp: '081234567890',
  productName: 'Rendang Frozen 500gr',
  categoryId: 'kuliner',
  packId: 'standar',
  styleIds: ['studio-putih', 'meja-kayu'],
  marketplaceIds: ['shopee', 'tokopedia'],
  photos: [{ id: 'p1', filename: 'a.jpg' }],
  ...overrides,
});

beforeEach(() => __resetForTests());

describe('normalizeWhatsapp', () => {
  test('converts local formats to the 62 country code', () => {
    assert.equal(normalizeWhatsapp('081234567890'), '6281234567890');
    assert.equal(normalizeWhatsapp('+62 812-3456-7890'), '6281234567890');
    assert.equal(normalizeWhatsapp('81234567890'), '6281234567890');
    assert.equal(normalizeWhatsapp('6281234567890'), '6281234567890');
  });

  test('returns null for empty input', () => {
    assert.equal(normalizeWhatsapp(''), null);
    assert.equal(normalizeWhatsapp(undefined), null);
  });
});

describe('createOrder', () => {
  test('creates a draft order with a quotable code', () => {
    const order = createOrder(validBrief());
    assert.equal(order.status, ORDER_STATUS.DRAFT);
    assert.match(order.code, /^FTN-[A-Z0-9]{6}$/);
    assert.equal(order.priceIdr, 20000);
    assert.equal(order.seller.whatsapp, '6281234567890');
    assert.equal(order.timeline.length, 1);
  });

  test('rejects more styles than the pack allows', () => {
    assert.throws(
      () => createOrder(validBrief({ packId: 'hemat', styleIds: ['studio-putih', 'meja-kayu'] })),
      /hanya mencakup 1 gaya/,
    );
  });

  test('rejects more marketplaces than the pack allows', () => {
    assert.throws(
      () =>
        createOrder(
          validBrief({ packId: 'hemat', styleIds: ['studio-putih'], marketplaceIds: ['shopee', 'tokopedia'] }),
        ),
      /hanya mencakup 1 marketplace/,
    );
  });

  test('rejects a style that does not belong to the category', () => {
    assert.throws(
      () => createOrder(validBrief({ styleIds: ['podium-batu'] })),
      /tidak tersedia untuk kategori/,
    );
  });

  test('rejects an order with no photos', () => {
    assert.throws(() => createOrder(validBrief({ photos: [] })), /Minimal unggah 1 foto/);
  });

  test('deduplicates repeated style selections', () => {
    const order = createOrder(validBrief({ styleIds: ['studio-putih', 'studio-putih'] }));
    assert.deepEqual(order.styleIds, ['studio-putih']);
  });
});

describe('status machine', () => {
  test('allows the happy path only in order', () => {
    assert.ok(canTransition(ORDER_STATUS.DRAFT, ORDER_STATUS.AWAITING_PAYMENT));
    assert.ok(canTransition(ORDER_STATUS.AWAITING_PAYMENT, ORDER_STATUS.PROCESSING));
    assert.ok(canTransition(ORDER_STATUS.PROCESSING, ORDER_STATUS.AWAITING_REVIEW));
    assert.ok(canTransition(ORDER_STATUS.AWAITING_REVIEW, ORDER_STATUS.DONE));
    assert.ok(!canTransition(ORDER_STATUS.DRAFT, ORDER_STATUS.DONE));
    assert.ok(!canTransition(ORDER_STATUS.DONE, ORDER_STATUS.PROCESSING));
  });

  test('a rejected order can be re-queued through revisi', () => {
    assert.ok(canTransition(ORDER_STATUS.AWAITING_REVIEW, ORDER_STATUS.REVISION));
    assert.ok(canTransition(ORDER_STATUS.REVISION, ORDER_STATUS.PROCESSING));
  });

  test('transition appends to the timeline and blocks illegal jumps', () => {
    const order = createOrder(validBrief());
    const moved = transition(order, ORDER_STATUS.AWAITING_PAYMENT, { note: 'invoice' });
    assert.equal(moved.status, ORDER_STATUS.AWAITING_PAYMENT);
    assert.equal(moved.timeline.length, 2);
    assert.throws(() => transition(moved, ORDER_STATUS.DONE), /tidak bisa berubah/);
  });
});

describe('plannedOutputCount', () => {
  test('is capped by the pack photo count', () => {
    // 2 styles x (2 shopee + 2 tokopedia outputs) = 8, pack standar allows 10.
    const order = createOrder(validBrief());
    assert.equal(plannedOutputCount(order), 8);
  });

  test('never exceeds what the seller paid for', () => {
    const order = createOrder(
      validBrief({ packId: 'hemat', styleIds: ['studio-putih'], marketplaceIds: ['shopee'] }),
    );
    assert.equal(plannedOutputCount(order), 2);
  });
});
