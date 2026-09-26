import './setup.js'; // must stay first: isolates storage before config loads
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { __resetForTests } from '../src/data/store.js';
import { PACKS, getMarketplace } from '../src/data/catalog.js';
import {
  ORDER_STATUS,
  canTransition,
  createOrder,
  isSafeFilename,
  maskWhatsapp,
  normalizeWhatsapp,
  planOutputs,
  plannedOutputCount,
  transition,
} from '../src/services/order.service.js';
import { describeBrief } from '../src/services/brief.service.js';

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

  test('rejects a photo filename that could escape the uploads directory', () => {
    for (const filename of ['../db.json', '..\\..\\secret.jpg', '/etc/passwd', 'a/b.jpg', '.env']) {
      assert.throws(
        () => createOrder(validBrief({ photos: [{ id: 'p1', filename }] })),
        /Nama file foto tidak valid/,
        filename,
      );
    }
  });

  test('deduplicates repeated style selections', () => {
    const order = createOrder(validBrief({ styleIds: ['studio-putih', 'studio-putih'] }));
    assert.deepEqual(order.styleIds, ['studio-putih']);
  });
});

describe('seller brief', () => {
  const withAnswers = (answers, extra = {}) => validBrief({ brief: { answers }, ...extra });

  test('an untouched brief gets the defaults, so skipping the step still works', () => {
    const order = createOrder(validBrief());
    assert.deepEqual(order.brief, {
      version: 1,
      answers: { productType: null, goal: 'auto', keep: ['warna', 'label', 'bentuk'], mood: [] },
      usedText: false,
    });
  });

  test('tapped answers are stored as option ids, duplicates removed', () => {
    const order = createOrder(
      withAnswers({
        productType: 'frozen-kemasan',
        goal: 'foto-utama',
        keep: ['label', 'label'],
        mood: ['hangat', 'bersih'],
      }),
    );
    assert.deepEqual(order.brief.answers, {
      productType: 'frozen-kemasan',
      goal: 'foto-utama',
      keep: ['label'],
      mood: ['hangat', 'bersih'],
    });
  });

  test('unticking every pre-ticked box is a real choice, not "use the default"', () => {
    assert.deepEqual(createOrder(withAnswers({ keep: [] })).brief.answers.keep, []);
  });

  test('usedText records whether the seller wrote their own words', () => {
    assert.equal(createOrder(validBrief({ notes: 'Label harus terbaca.' })).brief.usedText, true);
    assert.equal(createOrder(validBrief({ notes: '   ' })).brief.usedText, false);
    assert.equal(
      createOrder(validBrief({ brief: { usedText: true } })).brief.usedText,
      false,
      'a client cannot claim it wrote text',
    );
  });

  test('refuses options we do not offer, including another category\'s product type', () => {
    const refused = [
      [{ goal: 'viral' }, /tidak tersedia/],
      [{ productType: 'hijab' }, /tidak tersedia/], // hijab belongs to fashion, this is kuliner
      [{ keep: ['warna', 'harga'] }, /tidak tersedia/],
      [{ keep: 'warna' }, /tidak tersedia/],
      [{ budget: 'murah' }, /tidak dikenal/],
    ];
    for (const [answers, message] of refused) {
      assert.throws(() => createOrder(withAnswers(answers)), message, JSON.stringify(answers));
    }
  });

  test('caps the moods at two', () => {
    assert.throws(
      () => createOrder(withAnswers({ mood: ['hangat', 'bersih', 'mewah'] })),
      /maksimal 2/,
    );
  });

  test('describeBrief shows the labels the seller tapped, and tolerates old orders', () => {
    const order = createOrder(withAnswers({ goal: 'promo', mood: ['mewah'] }));
    const byId = Object.fromEntries(describeBrief(order).items.map((item) => [item.id, item.answers]));
    assert.deepEqual(byId.goal, ['Banner promo & iklan']);
    assert.deepEqual(byId.mood, ['Mewah & premium']);
    assert.deepEqual(byId.keep, ['Warna produk', 'Tulisan & label di kemasan', 'Bentuk produk']);
    assert.deepEqual(byId.productType, []);
    assert.equal(describeBrief({ ...order, brief: undefined }), null, 'orders from before the brief');
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

  test('a failed generation can be retried, but never skips review', () => {
    assert.ok(canTransition(ORDER_STATUS.PROCESSING, ORDER_STATUS.FAILED));
    assert.ok(canTransition(ORDER_STATUS.FAILED, ORDER_STATUS.PROCESSING));
    assert.ok(!canTransition(ORDER_STATUS.FAILED, ORDER_STATUS.AWAITING_REVIEW));
    assert.ok(!canTransition(ORDER_STATUS.FAILED, ORDER_STATUS.DONE));
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

describe('planOutputs', () => {
  const maxedOut = (packId) => {
    const pack = PACKS.find((item) => item.id === packId);
    const styleIds = [
      'studio-putih',
      'meja-kayu',
      'flatlay-bahan',
      'lifestyle-kafe',
      'promo-kontras',
    ].slice(0, pack.maxStyles);
    const marketplaceIds = ['shopee', 'tokopedia', 'tiktok-shop', 'instagram'].slice(
      0,
      pack.maxMarketplaces,
    );
    return createOrder(validBrief({ packId, styleIds, marketplaceIds }));
  };

  test('never plans more images than the pack promises, even fully selected', () => {
    for (const pack of PACKS) {
      const planned = planOutputs(maxedOut(pack.id));
      assert.ok(
        planned.length <= pack.photoCount,
        `${pack.id}: planned ${planned.length}, promised ${pack.photoCount}`,
      );
    }
  });

  test('when the cap bites, primary sizes are produced before secondary ones', () => {
    // Premium: 5 styles x 4 marketplaces = 20 primary outputs, budget 15.
    const planned = planOutputs(maxedOut('premium'));
    assert.equal(planned.length, 15);
    for (const job of planned) {
      assert.equal(
        job.spec,
        getMarketplace(job.marketplaceId).outputs[0],
        `${job.styleId}/${job.marketplaceId} planned a secondary size while primaries were dropped`,
      );
    }
    const pairs = new Set(planned.map((job) => `${job.styleId}/${job.marketplaceId}`));
    assert.equal(pairs.size, 15, 'each planned image is a distinct style x marketplace pair');
  });

  test('the count shown to the seller is the number actually planned', () => {
    const order = maxedOut('premium');
    assert.equal(plannedOutputCount(order), planOutputs(order).length);
  });
});

describe('isSafeFilename', () => {
  test('accepts the names multer generates and plain names', () => {
    assert.ok(isSafeFilename('1758196800000_xY9kL2mN.jpg'));
    assert.ok(isSafeFilename('a.jpg'));
  });

  test('refuses anything path-like', () => {
    for (const bad of ['../x.jpg', 'a/b.jpg', 'a\\b.jpg', '.hidden', '', 'a..b.jpg', null, undefined, 42]) {
      assert.equal(isSafeFilename(bad), false, String(bad));
    }
  });
});

describe('maskWhatsapp', () => {
  test('hides the middle of the number', () => {
    assert.equal(maskWhatsapp('6281234567890'), '62812*****890');
  });

  test('passes through empty values and fully hides very short ones', () => {
    assert.equal(maskWhatsapp(null), null);
    assert.equal(maskWhatsapp('12345'), '*****');
  });
});
