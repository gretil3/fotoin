import { Router } from 'express';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import config from '../config/env.js';
import { asyncHandler, requireReviewer, upload } from '../middleware/index.js';
import { ApiError } from '../utils/api-error.js';
import {
  ORDER_STATUS,
  STATUS_LABELS,
  createOrder,
  getOrder,
  listOrders,
  maskWhatsapp,
  plannedOutputCount,
  transition,
} from '../services/order.service.js';
import { orders as orderStore, uploads as uploadStore } from '../data/store.js';
import { inspectImage } from '../services/image.service.js';
import { describeBrief } from '../services/brief.service.js';
import { confirmPayment } from '../services/checkout.service.js';
import payments from '../services/payment.service.js';
import whatsapp from '../services/whatsapp.service.js';

const router = Router();

// Only the id is read from the client. Everything else about a photo (filename,
// size, url) comes from the record the server made at upload time, so a crafted
// request cannot point the generator at an arbitrary file on disk.
const photoSchema = z.object({ id: z.string().min(1) });

// Shape only; which option ids are allowed is checked by brief.service against
// catalog.js. A client-sent `usedText` is ignored: the server derives it.
const briefAnswerSchema = z.union([z.string().max(40), z.array(z.string().max(40)).max(10), z.null()]);
const briefSchema = z.object({ answers: z.record(briefAnswerSchema).optional() });

const createOrderSchema = z.object({
  sellerName: z.string().min(2, 'Nama minimal 2 karakter.').max(80),
  whatsapp: z.string().min(8, 'Nomor WhatsApp tidak valid.').max(20),
  storeName: z.string().max(80).optional().nullable(),
  productName: z.string().min(2, 'Nama produk minimal 2 karakter.').max(120),
  categoryId: z.string(),
  packId: z.string(),
  styleIds: z.array(z.string()).min(1),
  marketplaceIds: z.array(z.string()).min(1),
  notes: z.string().max(500, 'Cerita tambahan maksimal 500 karakter.').optional().nullable(),
  brief: briefSchema.optional().nullable(),
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

/** Turns the client's photo ids into the server's own upload records. */
const resolvePhotos = (refs) => {
  const seen = new Set();
  return refs
    .filter((ref) => !seen.has(ref.id) && seen.add(ref.id))
    .map((ref) => {
      const record = uploadStore.findById(ref.id);
      if (!record) {
        throw new ApiError(422, 'Foto tidak ditemukan. Unggah ulang fotonya.', {
          code: 'UNKNOWN_PHOTO',
        });
      }
      return record;
    });
};

/**
 * POST /api/v1/uploads
 * Multipart field: `photos` (1..MAX_FILES_PER_ORDER).
 * Returns photo descriptors to attach to an order.
 *
 * multer only checks the Content-Type the client claims, so each file is also
 * decoded here. A renamed text file, or a format we cannot read (HEIC), is
 * refused now instead of failing silently in the pipeline later.
 */
router.post(
  '/uploads',
  upload.array('photos', config.uploads.maxFiles),
  asyncHandler(async (req, res) => {
    const files = req.files || [];
    if (!files.length) {
      throw new ApiError(422, 'Tidak ada foto yang diunggah.', { code: 'NO_FILES' });
    }

    const photos = [];
    try {
      for (const file of files) {
        let meta;
        try {
          meta = await inspectImage(file.path);
        } catch {
          throw new ApiError(
            422,
            `Foto "${file.originalname}" tidak bisa dibaca. Simpan sebagai JPG atau PNG lalu unggah lagi.`,
            { code: 'UNREADABLE_IMAGE' },
          );
        }
        photos.push({
          id: nanoid(10),
          filename: file.filename,
          originalName: file.originalname,
          mimeType: file.mimetype,
          bytes: file.size,
          width: meta?.width ?? null,
          height: meta?.height ?? null,
          url: `${config.publicUrl}/static/uploads/${file.filename}`,
          uploadedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      // One bad file rejects the batch; do not leave the good ones orphaned on disk.
      await Promise.all(
        files.map((file) => fs.rm(path.join(config.paths.uploads, file.filename), { force: true })),
      );
      throw error;
    }

    for (const photo of photos) uploadStore.insert(photo);
    res.status(201).json({ photos });
  }),
);

/** POST /api/v1/orders - create the brief and issue an invoice. */
router.post(
  '/orders',
  asyncHandler(async (req, res) => {
    const input = parse(createOrderSchema, req.body);
    const photos = resolvePhotos(input.photos);
    let order = createOrder({ ...input, photos });

    order = transition(order, ORDER_STATUS.AWAITING_PAYMENT, { note: 'Menunggu pembayaran.' });
    const payment = await payments.createCharge(order, req.body.paymentMethodId || 'qris');
    order = orderStore.update(order.id, { payment });

    await whatsapp.sendMessage(order, whatsapp.templates.orderReceived(order), 'order_received');

    res.status(201).json({ order: decorate(order) });
  }),
);

/**
 * GET /api/v1/orders?status=&whatsapp=
 * A seller looks up their own orders by number, so `whatsapp` is required.
 * Listing everyone's orders is staff-only. Interim protection until sellers
 * have real accounts (WhatsApp OTP): see docs/ROADMAP.md.
 */
router.get(
  '/orders',
  (req, res, next) => (req.query.whatsapp ? next() : requireReviewer(req, res, next)),
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
 * Dev/demo shortcut that settles the mock charge. It exists only while the
 * payment provider is `mock`; with a real provider the webhook is the only way
 * an order becomes paid, and this route answers 404.
 */
router.post(
  '/orders/:id/pay',
  asyncHandler(async (req, res) => {
    if (config.payment.provider !== 'mock') {
      throw new ApiError(404, 'Rute POST /orders/:id/pay tidak tersedia.', { code: 'ROUTE_NOT_FOUND' });
    }
    const order = await confirmPayment(req.params.id, 'Pembayaran diterima.');
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

/** GET /api/v1/messages?orderId= - the WhatsApp outbox. Staff-only: it holds every seller's number. */
router.get('/messages', requireReviewer, (req, res) => {
  res.json({ messages: whatsapp.listMessages(req.query.orderId) });
});

/**
 * Adds derived, display-only fields the frontend would otherwise recompute, and
 * masks the seller's number: an order id or code is enough to read this, and it
 * is not enough to be handed a phone number. `lastError` is dropped because it
 * can contain server paths. Staff routes return the full order.
 */
function decorate(order) {
  const { lastError: _staffOnly, ...publicOrder } = order;
  return {
    ...publicOrder,
    seller: { ...order.seller, whatsapp: maskWhatsapp(order.seller.whatsapp) },
    statusLabel: STATUS_LABELS[order.status] || order.status,
    briefSummary: describeBrief(order),
    plannedOutputs: plannedOutputCount(order),
    priceFormatted: `Rp${order.priceIdr.toLocaleString('id-ID')}`,
  };
}

export default router;
