import { Router } from 'express';
import { asyncHandler, requireReviewer } from '../middleware/index.js';
import { STATUS_LABELS, getOrder } from '../services/order.service.js';
import review from '../services/review.service.js';
import { queueStats } from '../services/pipeline.service.js';

const router = Router();

// Everything under /review is staff-only.
router.use('/review', requireReviewer);

/** GET /api/v1/review/queue - priority packs first, then oldest first. */
router.get(
  '/review/queue',
  asyncHandler(async (_req, res) => {
    const rows = review.reviewQueue();
    res.json({
      queue: rows.map((order) => ({
        ...order,
        statusLabel: STATUS_LABELS[order.status],
        waitingMinutes: Math.round((Date.now() - new Date(order.updatedAt).getTime()) / 60_000),
        overdue: new Date(order.dueAt).getTime() < Date.now(),
      })),
      count: rows.length,
      pipeline: queueStats(),
    });
  }),
);

/** GET /api/v1/review/:orderId - one order with its originals and AI output. */
router.get(
  '/review/:orderId',
  asyncHandler(async (req, res) => {
    const order = getOrder(req.params.orderId);
    res.json({ order: { ...order, statusLabel: STATUS_LABELS[order.status] } });
  }),
);

/**
 * POST /api/v1/review/:orderId/approve
 * Body: { reviewer?, note?, rejectedResultIds?: string[] }
 */
router.post(
  '/review/:orderId/approve',
  asyncHandler(async (req, res) => {
    const order = await review.approve(req.params.orderId, req.body || {});
    res.json({ order: { ...order, statusLabel: STATUS_LABELS[order.status] } });
  }),
);

/**
 * POST /api/v1/review/:orderId/reject
 * Body: { reviewer?, note: string }  -> re-queues the order for generation.
 */
router.post(
  '/review/:orderId/reject',
  asyncHandler(async (req, res) => {
    const order = await review.reject(req.params.orderId, req.body || {});
    res.json({ order: { ...order, statusLabel: STATUS_LABELS[order.status] } });
  }),
);

export default router;
