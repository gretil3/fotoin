/**
 * Settling a payment.
 *
 * One code path for both triggers: the dev-only POST /orders/:id/pay shortcut
 * and the payment provider's webhook. Keeping them together means the day the
 * shortcut is deleted, nothing about settlement changes.
 */
import { orders } from '../data/store.js';
import { getPack } from '../data/catalog.js';
import { ApiError } from '../utils/api-error.js';
import { ORDER_STATUS, getOrder, transition } from './order.service.js';
import payments from './payment.service.js';
import { enqueue } from './pipeline.service.js';
import whatsapp from './whatsapp.service.js';

/**
 * Marks an order paid, starts the turnaround clock, and queues generation.
 * @param {string} orderId internal id or FTN- code
 * @param {string} note timeline note describing what confirmed the payment
 */
export const confirmPayment = async (orderId, note) => {
  const order = getOrder(orderId);
  if (order.status !== ORDER_STATUS.AWAITING_PAYMENT) {
    throw new ApiError(409, 'Pesanan ini tidak sedang menunggu pembayaran.', {
      code: 'NOT_AWAITING_PAYMENT',
    });
  }

  // The seller's turnaround promise starts when they pay, not when they filled in the form.
  const pack = getPack(order.packId);
  orders.update(order.id, {
    payment: payments.settleCharge(order.payment),
    dueAt: new Date(Date.now() + pack.turnaroundHours * 3600_000).toISOString(),
  });

  const paid = transition(orders.findById(order.id), ORDER_STATUS.PROCESSING, { note });

  await whatsapp.sendMessage(paid, whatsapp.templates.paymentReceived(paid), 'payment');
  enqueue(paid.id);
  return paid;
};

export default { confirmPayment };
