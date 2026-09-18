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

export const ORDER_STATUS = {
  DRAFT: 'draft',
  AWAITING_PAYMENT: 'menunggu_pembayaran',
  PROCESSING: 'diproses_ai',
  AWAITING_REVIEW: 'menunggu_review',
  REVISION: 'revisi',
  DONE: 'selesai',
  CANCELLED: 'dibatalkan',
};

export const STATUS_LABELS = {
  [ORDER_STATUS.DRAFT]: 'Draf',
  [ORDER_STATUS.AWAITING_PAYMENT]: 'Menunggu Pembayaran',
  [ORDER_STATUS.PROCESSING]: 'Sedang Diproses AI',
  [ORDER_STATUS.AWAITING_REVIEW]: 'Menunggu Cek Reviewer',
  [ORDER_STATUS.REVISION]: 'Sedang Direvisi',
  [ORDER_STATUS.DONE]: 'Selesai',
  [ORDER_STATUS.CANCELLED]: 'Dibatalkan',
};

const ALLOWED_TRANSITIONS = {
  [ORDER_STATUS.DRAFT]: [ORDER_STATUS.AWAITING_PAYMENT, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.AWAITING_PAYMENT]: [ORDER_STATUS.PROCESSING, ORDER_STATUS.CANCELLED],
  [ORDER_STATUS.PROCESSING]: [
    ORDER_STATUS.AWAITING_REVIEW,
    ORDER_STATUS.DONE,
    ORDER_STATUS.CANCELLED,
  ],
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
      notes: input.notes?.trim() || null,
    },

    packId: pack.id,
    priceIdr: pack.priceIdr,
    styleIds,
    marketplaceIds,
    photos: input.photos,

    // Filled in by the pipeline / reviewer.
    payment: null,
    results: [],
    review: null,
    revisionCount: 0,
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

/** How many images the pipeline should produce, capped by the pack. */
export const plannedOutputCount = (order) => {
  const pack = getPack(order.packId);
  const perStyle = order.marketplaceIds
    .map((id) => getMarketplace(id)?.outputs.length || 0)
    .reduce((sum, count) => sum + count, 0);
  return Math.min(pack.photoCount, order.styleIds.length * perStyle);
};

export default {
  ORDER_STATUS,
  STATUS_LABELS,
  createOrder,
  getOrder,
  listOrders,
  transition,
  canTransition,
  plannedOutputCount,
  normalizeWhatsapp,
};
