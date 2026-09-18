/**
 * Human quality assurance - FOTOIN's core differentiator.
 *
 * Every order stops here. A reviewer sees the AI output next to the seller's
 * original photo and either approves the batch (optionally dropping individual
 * bad frames) or sends it back for a re-run with a note.
 */
import { orders } from '../data/store.js';
import { ApiError } from '../utils/api-error.js';
import { ORDER_STATUS, getOrder, transition } from './order.service.js';
import { getPack } from '../data/catalog.js';
import { enqueue } from './pipeline.service.js';
import whatsapp from './whatsapp.service.js';

/** Orders waiting for a human, priority packs first, then oldest first. */
export const reviewQueue = () =>
  orders
    .find((order) => order.status === ORDER_STATUS.AWAITING_REVIEW)
    .map((order) => ({ order, pack: getPack(order.packId) }))
    .sort((a, b) => {
      if (a.pack.priorityReview !== b.pack.priorityReview) return a.pack.priorityReview ? -1 : 1;
      return a.order.createdAt.localeCompare(b.order.createdAt);
    })
    .map(({ order }) => order);

/**
 * Approve an order and deliver it.
 * @param {string} orderId
 * @param {{reviewer?: string, note?: string, rejectedResultIds?: string[]}} input
 */
export const approve = async (orderId, input = {}) => {
  let order = getOrder(orderId);
  if (order.status !== ORDER_STATUS.AWAITING_REVIEW) {
    throw new ApiError(409, 'Pesanan ini tidak sedang menunggu review.', {
      code: 'NOT_IN_REVIEW',
    });
  }

  const rejected = new Set(input.rejectedResultIds || []);
  const results = order.results.map((result) => ({
    ...result,
    approved: !rejected.has(result.id),
    reviewerNote: rejected.has(result.id) ? input.note || 'Tidak lolos QA.' : null,
  }));

  const approvedCount = results.filter((result) => result.approved).length;
  if (approvedCount === 0) {
    throw new ApiError(422, 'Tidak ada foto yang lolos. Gunakan "tolak" untuk memproses ulang.', {
      code: 'NOTHING_APPROVED',
    });
  }

  const now = new Date().toISOString();
  orders.update(order.id, {
    results,
    review: {
      reviewer: input.reviewer || 'reviewer',
      decision: 'approved',
      note: input.note || null,
      approvedCount,
      rejectedCount: results.length - approvedCount,
      reviewedAt: now,
    },
  });

  order = transition(orders.findById(order.id), ORDER_STATUS.DONE, {
    note: `Disetujui reviewer (${approvedCount} foto dikirim).`,
    deliveredAt: now,
  });

  await whatsapp.sendMessage(order, whatsapp.templates.delivered(order), 'delivery');
  return order;
};

/**
 * Reject an order: it goes back through the generation pipeline.
 * @param {string} orderId
 * @param {{reviewer?: string, note: string}} input
 */
export const reject = async (orderId, input = {}) => {
  let order = getOrder(orderId);
  if (order.status !== ORDER_STATUS.AWAITING_REVIEW) {
    throw new ApiError(409, 'Pesanan ini tidak sedang menunggu review.', { code: 'NOT_IN_REVIEW' });
  }
  if (!input.note?.trim()) {
    throw new ApiError(422, 'Catatan revisi wajib diisi agar proses ulang lebih terarah.', {
      code: 'NOTE_REQUIRED',
    });
  }

  const pack = getPack(order.packId);
  if (order.revisionCount >= pack.freeRevisions + 1) {
    throw new ApiError(409, 'Batas revisi untuk paket ini sudah tercapai. Eskalasi ke manual.', {
      code: 'REVISION_LIMIT',
    });
  }

  orders.update(order.id, {
    revisionCount: order.revisionCount + 1,
    review: {
      reviewer: input.reviewer || 'reviewer',
      decision: 'rejected',
      note: input.note.trim(),
      reviewedAt: new Date().toISOString(),
    },
  });

  order = transition(orders.findById(order.id), ORDER_STATUS.REVISION, {
    note: `Ditolak reviewer: ${input.note.trim()}`,
  });

  await whatsapp.sendMessage(order, whatsapp.templates.revision(order, input.note), 'revision');
  enqueue(order.id);
  return orders.findById(order.id);
};

export default { reviewQueue, approve, reject };
