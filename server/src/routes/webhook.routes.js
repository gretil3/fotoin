/**
 * Inbound webhooks.
 *
 *  - WhatsApp Cloud API: verification handshake + inbound seller messages.
 *    The intake bot lives here: a seller sends a photo, we create a draft order
 *    and reply with the category picker.
 *  - Payment provider: settles a charge and starts the generation pipeline.
 */
import { Router } from 'express';
import config from '../config/env.js';
import { asyncHandler } from '../middleware/index.js';
import { ApiError } from '../utils/api-error.js';
import { orders as orderStore } from '../data/store.js';
import { ORDER_STATUS, normalizeWhatsapp, transition } from '../services/order.service.js';
import payments from '../services/payment.service.js';
import { enqueue } from '../services/pipeline.service.js';
import whatsapp from '../services/whatsapp.service.js';

const router = Router();

/** GET /api/v1/webhooks/whatsapp - Meta's subscription handshake. */
router.get('/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/**
 * POST /api/v1/webhooks/whatsapp
 * Minimal intake: logs the inbound message and, when it maps to a known
 * seller, records it against their most recent order. Extend this into the
 * full conversational flow (category -> style -> pack -> QRIS) as the bot grows.
 */
router.post(
  '/webhooks/whatsapp',
  asyncHandler(async (req, res) => {
    const entries = req.body?.entry || [];
    const inbound = [];

    for (const entry of entries) {
      for (const change of entry.changes || []) {
        for (const message of change.value?.messages || []) {
          inbound.push({
            from: normalizeWhatsapp(message.from),
            type: message.type,
            text: message.text?.body || null,
            mediaId: message.image?.id || null,
            receivedAt: new Date().toISOString(),
          });
        }
      }
    }

    for (const message of inbound) {
      const order = orderStore
        .find((row) => row.seller.whatsapp === message.from)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

      if (order) {
        await whatsapp.sendMessage(order, whatsapp.templates.statusUpdate(order), 'inbound_reply');
      }
      console.log('[whatsapp:inbound]', message);
    }

    // Meta retries unless we 200 quickly.
    res.sendStatus(200);
  }),
);

/**
 * POST /api/v1/webhooks/payment
 * Body (mock): { orderCode, status: 'paid' }
 */
router.post(
  '/webhooks/payment',
  asyncHandler(async (req, res) => {
    if (!payments.verifyWebhook(req.headers, JSON.stringify(req.body || {}))) {
      throw new ApiError(401, 'Signature webhook tidak valid.', { code: 'BAD_SIGNATURE' });
    }

    const { orderCode, status } = req.body || {};
    const order = orderStore.findOne((row) => row.code === orderCode || row.id === orderCode);
    if (!order) throw new ApiError(404, 'Pesanan tidak ditemukan.', { code: 'ORDER_NOT_FOUND' });

    if (status !== 'paid') {
      return res.json({ ok: true, ignored: true, status });
    }
    if (order.status !== ORDER_STATUS.AWAITING_PAYMENT) {
      return res.json({ ok: true, ignored: true, reason: 'already_processed' });
    }

    orderStore.update(order.id, { payment: payments.settleCharge(order.payment) });
    const updated = transition(orderStore.findById(order.id), ORDER_STATUS.PROCESSING, {
      note: 'Pembayaran dikonfirmasi provider.',
    });

    await whatsapp.sendMessage(updated, whatsapp.templates.paymentReceived(updated), 'payment');
    enqueue(updated.id);

    res.json({ ok: true, orderId: updated.id, status: updated.status });
  }),
);

export default router;
