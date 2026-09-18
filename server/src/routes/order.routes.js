import { Router } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import config from '../config/env.js';
import { asyncHandler, upload } from '../middleware/index.js';
import { ApiError } from '../utils/api-error.js';
import {
  ORDER_STATUS,
  STATUS_LABELS,
  createOrder,
  getOrder,
  listOrders,
  plannedOutputCount,
  transition,
} from '../services/order.service.js';
import { orders as orderStore } from '../data/store.js';
import payments from '../services/payment.service.js';
import { enqueue } from '../services/pipeline.service.js';
import whatsapp from '../services/whatsapp.service.js';

const router = Router();

const photoSchema = z.object({
  id: z.string(),
  filename: z.string(),
  originalName: z.string().optional(),
  url: z.string().optional(),
  bytes: z.number().optional(),
});

const createOrderSchema = z.object({
  sellerName: z.string().min(2, 'Nama minimal 2 karakter.').max(80),
  whatsapp: z.string().min(8, 'Nomor WhatsApp tidak valid.').max(20),
  storeName: z.string().max(80).optional().nullable(),
  productName: z.string().min(2, 'Nama produk minimal 2 karakter.').max(120),
  categoryId: z.string(),
  packId: z.string(),
  styleIds: z.array(z.string()).min(1),
  marketplaceIds: z.array(z.string()).min(1),
  notes: z.string().max(500).optional().nullable(),
  photos: z.array(photoSchema).min(1, 'Minimal 1 foto produk.'),
});

const parse = (schema, payload) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const first = result.error.issues[0];
    throw new ApiError(422, first.message, {
      code: 'VALIDATION_ERROR',
      details: result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }
  return result.data;
};

/**
 * POST /api/v1/uploads
 * Multipart field: `photos` (1..MAX_FILES_PER_ORDER).
 * Returns photo descriptors to attach to an order.
 */
router.post(
  '/uploads',
  upload.array('photos', config.uploads.maxFiles),
  asyncHandler(async (req, res) => {
    if (!req.files?.length) {
      throw new ApiError(422, 'Tidak ada foto yang diunggah.', { code: 'NO_FILES' });
    }
    const photos = req.files.map((file) => ({
      id: nanoid(10),
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      bytes: file.size,
      url: `${config.publicUrl}/static/uploads/${file.filename}`,
      uploadedAt: new Date().toISOString(),
    }));
    res.status(201).json({ photos });
  }),
);

/** POST /api/v1/orders - create the brief and issue an invoice. */
router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const input = parse(createOrderSchema, req.body);
    let order = createOrder(input);

    order = transition(order, ORDER_STATUS.AWAITING_PAYMENT, { note: 'Menunggu pembayaran.' });
    const payment = await payments.createCharge(order, req.body.paymentMethodId || 'qris');
    order = orderStore.update(order.id, { payment });

    await whatsapp.sendMessage(order, whatsapp.templates.orderReceived(order), 'order_received');

    res.status(201).json({ order: decorate(order) });
  }),
);

/** GET /api/v1/orders?status=&whatsapp= */
router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    const rows = listOrders({ status: req.query.status, whatsapp: req.query.whatsapp });
    res.json({ orders: rows.map(decorate), count: rows.length });
  }),
);

/** GET /api/v1/orders/:id - accepts the internal id or the FTN-XXXXXX code. */
router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    res.json({ order: decorate(getOrder(req.params.id)) });
  }),
);

/**
 * POST /api/v1/orders/:id/pay
 * Dev/demo shortcut that settles the mock charge. In production the provider
 * webhook drives this - see POST /api/v1/webhooks/payment.
 */
router.post(
  '/orders/:id/pay',
  asyncHandler(async (req, res) => {
    let order = getOrder(req.params.id);
    if (order.status !== ORDER_STATUS.AWAITING_PAYMENT) {
      throw new ApiError(409, 'Pesanan ini tidak sedang menunggu pembayaran.', {
        code: 'NOT_AWAITING_PAYMENT',
      });
    }

    order = orderStore.update(order.id, { payment: payments.settleCharge(order.payment) });
    order = transition(order, ORDER_STATUS.PROCESSING, { note: 'Pembayaran diterima.' });

    await whatsapp.sendMessage(order, whatsapp.templates.paymentReceived(order), 'payment');
    enqueue(order.id);

    res.json({ order: decorate(order) });
  }),
);

/** POST /api/v1/orders/:id/cancel */
router.post(
  '/orders/:id/cancel',
  asyncHandler(async (req, res) => {
    const order = getOrder(req.params.id);
    const updated = transition(order, ORDER_STATUS.CANCELLED, {
      note: req.body?.reason || 'Dibatalkan oleh penjual.',
    });
    res.json({ order: decorate(updated) });
  }),
);

/** GET /api/v1/orders/:id/results - approved images only, grouped per marketplace. */
router.get(
  '/orders/:id/results',
  asyncHandler(async (req, res) => {
    const order = getOrder(req.params.id);
    const delivered = order.results.filter((result) => result.approved !== false);
    const byMarketplace = delivered.reduce((acc, result) => {
      (acc[result.marketplaceId] ||= []).push(result);
      return acc;
    }, {});
    res.json({
      orderId: order.id,
      code: order.code,
      status: order.status,
      statusLabel: STATUS_LABELS[order.status],
      total: delivered.length,
      byMarketplace,
      results: delivered,
    });
  }),
);

/** GET /api/v1/messages?orderId= - the WhatsApp outbox (dry-run visible). */
router.get('/messages', (req, res) => {
  res.json({ messages: whatsapp.listMessages(req.query.orderId) });
});

/** Adds derived, display-only fields the frontend would otherwise recompute. */
function decorate(order) {
  return {
    ...order,
    statusLabel: STATUS_LABELS[order.status] || order.status,
    plannedOutputs: plannedOutputCount(order),
    priceFormatted: `Rp${order.priceIdr.toLocaleString('id-ID')}`,
  };
}

export default router;
