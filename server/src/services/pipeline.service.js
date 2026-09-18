/**
 * The FOTOIN pipeline: Snap -> Send -> Generate -> Review -> Deliver.
 *
 * This module owns the "Generate" step and hands off to the human reviewer.
 * It is an in-process FIFO queue with a small concurrency limit - enough for a
 * pilot and for local demos. For production, replace `enqueue` with a BullMQ /
 * Redis producer; the job body below is already serialisable.
 */
import config from '../config/env.js';
import { orders } from '../data/store.js';
import { ORDER_STATUS, transition } from './order.service.js';
import { generateForOrder, clearResults } from './image.service.js';
import whatsapp from './whatsapp.service.js';

const MAX_CONCURRENT = 2;

const queue = [];
const running = new Set();

const pump = () => {
  while (running.size < MAX_CONCURRENT && queue.length > 0) {
    const job = queue.shift();
    const promise = runJob(job).finally(() => {
      running.delete(promise);
      pump();
    });
    running.add(promise);
  }
};

async function runJob({ orderId }) {
  let order = orders.findById(orderId);
  if (!order) return;

  try {
    // A revision re-run starts from `revisi`; a first run from `menunggu_pembayaran`.
    if (order.status !== ORDER_STATUS.PROCESSING) {
      order = transition(order, ORDER_STATUS.PROCESSING, { note: 'Generasi AI dimulai.' });
    }

    await clearResults(order.id);

    const results = await generateForOrder(order, ({ done, total }) => {
      orders.update(order.id, { progress: { done, total } });
    });

    order = orders.update(order.id, { results, progress: { done: results.length, total: results.length } });

    if (config.review.required) {
      order = transition(order, ORDER_STATUS.AWAITING_REVIEW, {
        note: `${results.length} foto menunggu pengecekan reviewer.`,
      });
      await whatsapp.sendMessage(order, whatsapp.templates.inReview(order), 'in_review');
    } else {
      order = transition(order, ORDER_STATUS.DONE, {
        note: 'Selesai otomatis (REQUIRE_HUMAN_REVIEW=false).',
        deliveredAt: new Date().toISOString(),
      });
      await whatsapp.sendMessage(order, whatsapp.templates.delivered(order), 'delivery');
    }
  } catch (error) {
    console.error(`[pipeline] order ${orderId} failed:`, error);
    const current = orders.findById(orderId);
    if (current) {
      orders.update(orderId, {
        lastError: error.message,
        timeline: [
          ...(current.timeline || []),
          { status: current.status, at: new Date().toISOString(), note: `Gagal: ${error.message}` },
        ],
      });
    }
  }
}

/** Queues an order for generation. Returns immediately. */
export const enqueue = (orderId) => {
  queue.push({ orderId, queuedAt: new Date().toISOString() });
  pump();
  return { queued: queue.length, running: running.size };
};

export const queueStats = () => ({
  waiting: queue.length,
  running: running.size,
  maxConcurrent: MAX_CONCURRENT,
});

/** Test/CI helper: resolves once the queue has fully drained. */
export const drain = async () => {
  while (queue.length > 0 || running.size > 0) {
    await Promise.race([...running, Promise.resolve()]);
    await new Promise((resolve) => setImmediate(resolve));
  }
};

export default { enqueue, queueStats, drain };
