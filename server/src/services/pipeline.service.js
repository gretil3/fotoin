/**
 * The FOTOIN pipeline: Snap -> Send -> Generate -> Review -> Deliver.
 *
 * This module owns the "Generate" step and hands off to the human reviewer.
 * It is an in-process FIFO queue with a small concurrency limit - enough for a
 * pilot and for local demos. For production, replace `enqueue` with a BullMQ /
 * Redis producer; the job body below is already serialisable.
 *
 * The queue lives in memory, so a restart forgets it. The database does not:
 * recoverInterruptedJobs() rebuilds the queue from orders still marked as
 * processing, and is called once at boot.
 */
import config from '../config/env.js';
import { orders } from '../data/store.js';
import { ORDER_STATUS, transition } from './order.service.js';
import { generateForOrder, clearResults } from './image.service.js';
import whatsapp from './whatsapp.service.js';

const MAX_CONCURRENT = 2;

/** Statuses a job may start from. Anything else (cancelled, done...) is skipped. */
const RUNNABLE = [ORDER_STATUS.PROCESSING, ORDER_STATUS.REVISION, ORDER_STATUS.FAILED];

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

/** Moves a still-processing order to `gagal` and tells the seller we are on it. */
async function failOrder(orderId, error) {
  console.error(`[pipeline] order ${orderId} failed:`, error);
  const current = orders.findById(orderId);
  if (!current) return;

  if (current.status !== ORDER_STATUS.PROCESSING) {
    // Cancelled or otherwise moved on while we were working: just record why.
    orders.update(orderId, { lastError: error.message });
    return;
  }

  try {
    // The timeline is shown to the seller, so it gets a generic note. The raw
    // error (which can contain server paths) lives in lastError, staff-only.
    const failed = transition(current, ORDER_STATUS.FAILED, {
      note: 'Foto belum berhasil dibuat. Tim FOTOIN akan mencoba ulang.',
      lastError: error.message,
    });
    await whatsapp.sendMessage(failed, whatsapp.templates.delayed(failed), 'delayed');
  } catch (secondary) {
    console.error(`[pipeline] could not mark order ${orderId} as failed:`, secondary);
  }
}

async function runJob({ orderId }) {
  let order = orders.findById(orderId);
  if (!order || !RUNNABLE.includes(order.status)) return;

  try {
    // A revision or retry re-run starts from `revisi` / `gagal`; a first run is already processing.
    if (order.status !== ORDER_STATUS.PROCESSING) {
      order = transition(order, ORDER_STATUS.PROCESSING, { note: 'Generasi AI dimulai.' });
    }
    orders.update(order.id, { lastError: null, progress: null });

    await clearResults(order.id);

    const { results, failed } = await generateForOrder(order, ({ done, total }) => {
      orders.update(order.id, { progress: { done, total } });
    });

    // Never let an empty batch reach a reviewer: there is nothing to review and
    // the seller would be told their photos are done.
    if (results.length === 0) {
      const reason = failed[0]?.error || 'tidak ada foto yang direncanakan';
      throw new Error(`Tidak ada foto yang berhasil dibuat (${reason}).`);
    }

    order = orders.update(order.id, {
      results,
      progress: { done: results.length + failed.length, total: results.length + failed.length },
    });

    const partial = failed.length > 0 ? ` ${failed.length} foto gagal dirender.` : '';

    if (config.review.required) {
      order = transition(order, ORDER_STATUS.AWAITING_REVIEW, {
        note: `${results.length} foto menunggu pengecekan reviewer.${partial}`,
      });
      await whatsapp.sendMessage(order, whatsapp.templates.inReview(order), 'in_review');
    } else {
      order = transition(order, ORDER_STATUS.DONE, {
        note: `Selesai otomatis (REQUIRE_HUMAN_REVIEW=false).${partial}`,
        deliveredAt: new Date().toISOString(),
      });
      await whatsapp.sendMessage(order, whatsapp.templates.delivered(order), 'delivery');
    }
  } catch (error) {
    await failOrder(orderId, error);
  }
}

/**
 * Queues an order for generation. Returns immediately.
 * An order already waiting in the queue is not queued twice (a boot-time
 * recovery must not double up with a job that was enqueued a moment earlier).
 */
export const enqueue = (orderId) => {
  if (!queue.some((job) => job.orderId === orderId)) {
    queue.push({ orderId, queuedAt: new Date().toISOString() });
  }
  pump();
  return { queued: queue.length, running: running.size };
};

/**
 * Re-queues orders that were mid-generation when the process stopped.
 * Call once at boot. Returns how many orders were picked up.
 */
export const recoverInterruptedJobs = () => {
  const interrupted = orders.find(
    (order) => order.status === ORDER_STATUS.PROCESSING || order.status === ORDER_STATUS.REVISION,
  );
  for (const order of interrupted) enqueue(order.id);
  return interrupted.length;
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

export default { enqueue, queueStats, drain, recoverInterruptedJobs };
