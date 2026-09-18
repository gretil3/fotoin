/**
 * Payments: QRIS and local e-wallets, pay-per-pack (never a subscription).
 *
 * The `mock` provider issues a fake QRIS payload so the whole flow is
 * demoable offline. To go live, implement `createCharge` / `verifyWebhook`
 * against Midtrans or Xendit and set PAYMENT_PROVIDER accordingly - nothing
 * outside this file needs to change.
 */
import crypto from 'node:crypto';
import { nanoid } from 'nanoid';
import config from '../config/env.js';
import { PAYMENT_METHODS } from '../data/catalog.js';
import { ApiError } from '../utils/api-error.js';

const QR_EXPIRY_MINUTES = 30;

/** Deterministic pseudo-QRIS string; shape mimics the EMVCo payload. */
const buildQrPayload = (order) => {
  const merchant = 'FOTOIN';
  const amount = order.priceIdr.toFixed(2);
  const raw = `00020101021226${merchant}5204581253033605802ID5906${merchant}54${amount}62${order.code}`;
  const checksum = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 4).toUpperCase();
  return `${raw}6304${checksum}`;
};

export const createCharge = async (order, methodId = 'qris') => {
  const method = PAYMENT_METHODS.find((entry) => entry.id === methodId);
  if (!method) {
    throw new ApiError(422, 'Metode pembayaran tidak dikenal.', { code: 'UNKNOWN_PAYMENT_METHOD' });
  }

  if (config.payment.provider !== 'mock') {
    throw new ApiError(
      501,
      `Provider pembayaran "${config.payment.provider}" belum diimplementasikan. Lihat src/services/payment.service.js.`,
      { code: 'PROVIDER_NOT_IMPLEMENTED' },
    );
  }

  return {
    id: nanoid(12),
    provider: 'mock',
    methodId: method.id,
    methodName: method.name,
    amountIdr: order.priceIdr,
    status: 'pending',
    qrPayload: buildQrPayload(order),
    expiresAt: new Date(Date.now() + QR_EXPIRY_MINUTES * 60_000).toISOString(),
    createdAt: new Date().toISOString(),
    paidAt: null,
  };
};

/**
 * Marks a charge settled. In production this is driven by the provider's
 * webhook, not by the client - see docs/API.md.
 */
export const settleCharge = (payment) => ({
  ...payment,
  status: 'paid',
  paidAt: new Date().toISOString(),
});

/** Verifies a provider webhook signature. Mock provider accepts anything. */
export const verifyWebhook = (headers, rawBody) => {
  if (config.payment.provider === 'mock') return true;
  const signature = headers['x-callback-signature'] || headers['x-signature'];
  if (!signature || !config.payment.serverKey) return false;
  const expected = crypto
    .createHmac('sha256', config.payment.serverKey)
    .update(rawBody)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
};

export default { createCharge, settleCharge, verifyWebhook };
