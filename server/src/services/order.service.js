/**
 * Order lifecycle.
 *
 * Status machine (Bahasa Indonesia labels are what the seller sees):
 *
 *   draft
 *     -> menunggu_pembayaran   seller confirmed the brief, invoice issued
 *     -> diproses_ai           payment settled, generation queued/running
 *     -> menunggu_review       AI output ready, waiting for a human QA pass
 *     -> revisi                reviewer rejected, pipeline re-runs
 *     -> gagal                 generation produced nothing usable; staff retry it
 *     -> selesai               approved and delivered
 *     -> dibatalkan            cancelled (terminal)
 *
 * The `menunggu_review` state is the whole point of FOTOIN: we never ship an
 * AI result a person has not looked at.
 */
import { nanoid } from 'nanoid';
import { orders } from '../data/store.js';
import { getCategory, getMarketplace, getPack, getStyle } from '../data/catalog.js';
import { ApiError } from '../utils/api-error.js';
import { normalizeBrief } from './brief.service.js';

export const ORDER_STATUS = {
  DRAFT: 'draft',
  AWAITING_PAYMENT: 'menunggu_pembayaran',
  PROCESSING: 'diproses_ai',
  AWAITING_REVIEW: 'menunggu_review',
  REVISION: 'revisi',
  FAILED: 'gagal',
  DONE: 'selesai',
  CANCELLED: 'dibatalkan',
};

export const STATUS_LABELS = {
  [ORDER_STATUS.DRAFT]: 'Draf',
  [ORDER_STATUS.AWAITING_PAYMENT]: 'Menunggu Pembayaran',
  [ORDER_STATUS.PROCESSING]: 'Sedang Diproses AI',
  [ORDER_STATUS.AWAITING_REVIEW]: 'Menunggu Cek Reviewer',
  [ORDER_STATUS.REVISION]: 'Sedang Direvisi',
  [ORDER_STATUS.FAILED]: 'Kendala Teknis',
  [ORDER_STATUS.DONE]: 'Selesai',
  [ORDER_STATUS.CANCELLED]: 'Dibatalkan',
};

const ALLOWED_TRANSITIONS = {
  [ORDER_STATUS.DRAFT]: [ORDER_STATUS.AWAITING_PAYMENT, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.AWAITING_PAYMENT]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PROCESSING]: [
    ORDER_STATUS.AWAITING_REVIEW,
    ORDER_STATUS.DONE,
    ORDER_STATUS.FAILED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.FAILED]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.AWAITING_REVIEW]: [
    ORDER_STATUS.DONE,
    ORDER_STATUS.REVISION,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.REVISION]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.DONE]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

export const canTransition = (from, to) => (ALLOWED_TRANSITIONS[from] || []).includes(to);

export const transition = (order, to, extra = {}) => {
  if (!canTransition(order.status, to)) {
    throw new ApiError(409, `Status tidak bisa berubah dari "${order.status}" ke "${to}".`, {
      code: 'INVALID_TRANSITION',
    });
  }
  const timeline = [
    ...(order.timeline || []),
    { status: to, at: new Date().toISOString(), note: extra.note || null },
  ];
  return orders.update(order.id, { status: to, timeline, ...extra });
};

/** Human-friendly id the seller can quote over WhatsApp, e.g. FTN-8KQ2M1. */
const generateOrderCode = () => `FTN-${nanoid(6).toUpperCase().replace(/[-_]/g, 'X')}`;

/**
 * True for a bare filename with no path parts. Photo filenames end up in
 * path.join(uploadsDir, filename), so anything containing a separator or a
 * leading dot could read outside the uploads directory.
 */
export const isSafeFilename = (name) =>
  typeof name === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/.test(name) && !name.includes('..');

/**
 * Validates a brief against the chosen pack and builds the order record.
 * Throws ApiError(422) with a Bahasa Indonesia message on any violation.
 */
export const createOrder = (input) => {
  const pack = getPack(input.packId);
  if (!pack) throw new ApiError(422, 'Paket tidak dikenal.', { code: 'UNKNOWN_PACK' });

  const category = getCategory(input.categoryId);
  if (!category) throw new ApiError(422, 'Kategori produk tidak dikenal.', { code: 'UNKNOWN_CATEGORY' });

  if (!input.photos?.length) {
    throw new ApiError(422, 'Minimal unggah 1 foto produk.', { code: 'NO_PHOTOS' });
  }
  if (!input.photos.every((photo) => isSafeFilename(photo.filename))) {
    throw new ApiError(422, 'Nama file foto tidak valid. Unggah ulang fotonya.', {
      code: 'BAD_PHOTO_FILENAME',
    });
  }

  const styleIds = [...new Set(input.styleIds || [])];
  if (styleIds.length === 0) {
    throw new ApiError(422, 'Pilih minimal 1 gaya foto.', { code: 'NO_STYLES' });
  }
  if (styleIds.length > pack.maxStyles) {
    throw new ApiError(
      422,
      `${pack.name} hanya mencakup ${pack.maxStyles} gaya. Kurangi pilihan atau naikkan paket.`,
      { code: 'TOO_MANY_STYLES' },
    );
  }
  const unknownStyle = styleIds.find((id) => !getStyle(category.id, id));
  if (unknownStyle) {
    throw new ApiError(422, `Gaya "${unknownStyle}" tidak tersedia untuk kategori ${category.name}.`, {
      code: 'UNKNOWN_STYLE',
    });
  }

  const marketplaceIds = [...new Set(input.marketplaceIds || [])];
  if (marketplaceIds.length === 0) {
    throw new ApiError(422, 'Pilih minimal 1 marketplace tujuan.', { code: 'NO_MARKETPLACE' });
  }
  if (marketplaceIds.length > pack.maxMarketplaces) {
    throw new ApiError(
      422,
      `${pack.name} hanya mencakup ${pack.maxMarketplaces} marketplace.`,
      { code: 'TOO_MANY_MARKETPLACES' },
    );
  }
  const unknownMarket = marketplaceIds.find((id) => !getMarketplace(id));
  if (unknownMarket) {
    throw new ApiError(422, `Marketplace "${unknownMarket}" tidak dikenal.`, {
      code: 'UNKNOWN_MARKETPLACE',
    });
  }

  const notes = input.notes?.trim() || null;
  const brief = normalizeBrief(category.id, input.brief, notes);

  const now = new Date().toISOString();
  const order = {
    id: nanoid(12),
    code: generateOrderCode(),
    status: ORDER_STATUS.DRAFT,
    createdAt: now,
    updatedAt: now,

    seller: {
      name: input.sellerName?.trim() || 'UMKM',
      whatsapp: normalizeWhatsapp(input.whatsapp),
      storeName: input.storeName?.trim() || null,
    },

    product: {
      name: input.productName?.trim() || 'Produk',
      categoryId: category.id,
      // The seller's own words about the product (optional). Part of the brief.
      notes,
    },

    // Tap answers standing in for a prompt: { version, answers, usedText }.
    brief,

    packId: pack.id,
    priceIdr: pack.priceIdr,
    styleIds,
    marketplaceIds,
    photos: input.photos,

    // Filled in by the pipeline / reviewer.
    payment: null,
    results: [],
    review: null,
    // revisionCount: revisions the *seller* asked for (counts against freeRevisions).
    // qaRerunCount: times a reviewer sent it back because *our* output was bad.
    revisionCount: 0,
    qaRerunCount: 0,
    deliveredAt: null,
    dueAt: new Date(Date.now() + pack.turnaroundHours * 3600_000).toISOString(),
    timeline: [{ status: ORDER_STATUS.DRAFT, at: now, note: 'Pesanan dibuat.' }],
  };

  return orders.insert(order);
};

/** Accepts 08xx / +62xx / 62xx and normalises to 62xxxxxxxxxx. */
export function normalizeWhatsapp(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return `62${digits.slice(1)}`;
  if (digits.startsWith('8')) return `62${digits}`;
  return digits;
}

/** 6281234567890 -> 62812****890. For responses that anyone holding an order id can read. */
export const maskWhatsapp = (number) => {
  if (!number) return number;
  const digits = String(number);
  if (digits.length <= 7) return '*'.repeat(digits.length);
  return `${digits.slice(0, 5)}${'*'.repeat(digits.length - 8)}${digits.slice(-3)}`;
};

export const getOrder = (id) => {
  const order = orders.findById(id) || orders.findOne((row) => row.code === id);
  if (!order) throw new ApiError(404, 'Pesanan tidak ditemukan.', { code: 'ORDER_NOT_FOUND' });
  return order;
};

export const listOrders = ({ status, whatsapp } = {}) => {
  let rows = orders.all();
  if (status) rows = rows.filter((order) => order.status === status);
  if (whatsapp) {
    const normalized = normalizeWhatsapp(whatsapp);
    rows = rows.filter((order) => order.seller.whatsapp === normalized);
  }
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/**
 * The exact list of images the pipeline may render for an order, capped at the
 * pack's photoCount. The generator and the "N photos planned" figure both read
 * this, so what a seller was promised and what we spend money producing cannot
 * drift apart.
 *
 * Ordering matters when the cap bites: every style x marketplace pair gets its
 * primary output first, and secondary sizes (promo cover, thumbnail, story...)
 * only fill whatever budget is left. That way a cut never removes a whole
 * marketplace or style the seller picked.
 *
 * @returns {Array<{styleId: string, marketplaceId: string, spec: object}>}
 */
export const planOutputs = (order) => {
  const pack = getPack(order.packId);
  if (!pack) return [];
  const marketplaces = order.marketplaceIds.map((id) => getMarketplace(id)).filter(Boolean);
  const tiers = Math.max(0, ...marketplaces.map((market) => market.outputs.length));

  const jobs = [];
  for (let tier = 0; tier < tiers; tier += 1) {
    for (const styleId of order.styleIds) {
      for (const marketplace of marketplaces) {
        const spec = marketplace.outputs[tier];
        if (spec) jobs.push({ styleId, marketplaceId: marketplace.id, spec });
      }
    }
  }
  return jobs.slice(0, pack.photoCount);
};

/** How many images the pipeline will produce, capped by the pack. */
export const plannedOutputCount = (order) => planOutputs(order).length;

export default {
  ORDER_STATUS,
  STATUS_LABELS,
  createOrder,
  getOrder,
  listOrders,
  transition,
  canTransition,
  planOutputs,
  plannedOutputCount,
  normalizeWhatsapp,
  maskWhatsapp,
  isSafeFilename,
};
