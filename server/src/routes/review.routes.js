import { Router } from 'express';
import { asyncHandler, requireReviewer } from '../middleware/index.js';
import { STATUS_LABELS, getOrder } from '../services/order.service.js';
import review from '../services/review.service.js';
import { queueStats } from '../services/pipeline.service.js';
import { describeBrief } from '../services/brief.service.js';
import { buildOrderPrompts } from '../services/prompt.service.js';
import { resolveRefinement } from '../services/refine.service.js';

const router = Router();

/** The full order (staff see everything), plus labels the console displays. */
const staffView = (order) => ({
  ...order,
  statusLabel: STATUS_LABELS[order.status],
  briefSummary: describeBrief(order),
});

// Everything under /review is staff-only.
router.use('/review', requireReviewer);

/** GET /api/v1/review/queue - priority packs first, then oldest first. */
router.get(
  '/review/queue',
  asyncHandler(async (_req, res) => {
    const rows = review.reviewQueue();
    res.json({
      queue: rows.map((order) => ({
        ...staffView(order),
        waitingMinutes: Math.round((Date.now() - new Date(order.updatedAt).getTime()) / 60_000),
        overdue: new Date(order.dueAt).getTime() < Date.now(),
      })),
      count: rows.length,
      // Orders whose generation failed; staff retry them with POST /review/:id/retry.
      failed: review.failedOrders().map((order) => ({
        id: order.id,
        code: order.code,
        productName: order.product.name,
        packId: order.packId,
        lastError: order.lastError || null,
        failedAt: order.updatedAt,
      })),
      pipeline: queueStats(),
    });
  }),
);

/** POST /api/v1/review/:orderId/retry - puts a failed order back through generation. */
router.post(
  '/review/:orderId/retry',
  asyncHandler(async (req, res) => {
    const order = review.retry(req.params.orderId);
    res.json({ order: staffView(order) });
  }),
);

/** GET /api/v1/review/:orderId - one order with its originals and AI output. */
router.get(
  '/review/:orderId',
  asyncHandler(async (req, res) => {
    res.json({ order: staffView(getOrder(req.params.orderId)) });
  }),
);

/**
 * GET /api/v1/review/:orderId/prompts
 * The exact prompt each chosen style sends to the image model, and the
 * refinement of the seller's words it was built from. Staff-only: prompt text
 * is part of how FOTOIN gets its results and never reaches sellers.
 */
router.get(
  '/review/:orderId/prompts',
  asyncHandler(async (req, res) => {
    const order = getOrder(req.params.orderId);
    const refinement = resolveRefinement(order);
    res.json({
      orderId: order.id,
      code: order.code,
      refinement,
      prompts: buildOrderPrompts(order, { refinement }),
    });
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
    res.json({ order: staffView(order) });
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
    res.json({ order: staffView(order) });
  }),
);

export default router;
