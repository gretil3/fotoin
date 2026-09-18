/**
 * WhatsApp is FOTOIN's primary channel: sellers already live there, so order
 * updates and final deliveries go out as WhatsApp messages.
 *
 * When WHATSAPP_ENABLED=false (the default in dev) messages are logged and
 * stored in the local db instead of being sent, so you can inspect the exact
 * copy a seller would receive via GET /api/v1/messages.
 */
import config from '../config/env.js';
import { messages } from '../data/store.js';
import { nanoid } from 'nanoid';
import { STATUS_LABELS } from './order.service.js';

const rupiah = (value) => `Rp${value.toLocaleString('id-ID')}`;

export const templates = {
  orderReceived: (order) =>
    [
      `Halo ${order.seller.name}! Pesanan *${order.code}* sudah kami terima.`,
      ``,
      `Produk: ${order.product.name}`,
      `Paket: ${order.packId} (${rupiah(order.priceIdr)})`,
      `Foto masuk: ${order.photos.length}`,
      ``,
      `Silakan selesaikan pembayaran lewat QRIS agar kami mulai proses. Terima kasih!`,
    ].join('\n'),

  paymentReceived: (order) =>
    [
      `Pembayaran untuk *${order.code}* sudah kami terima. ${rupiah(order.priceIdr)} LUNAS.`,
      ``,
      `Tim AI FOTOIN mulai memproses foto kamu sekarang. Estimasi selesai: ${new Date(
        order.dueAt,
      ).toLocaleString('id-ID')}.`,
    ].join('\n'),

  inReview: (order) =>
    `Foto untuk *${order.code}* sudah jadi dan sedang dicek reviewer kami sebelum dikirim. Sebentar lagi ya!`,

  delivered: (order) =>
    [
      `Selesai! Foto *${order.code}* sudah siap unggah.`,
      ``,
      `${order.results.filter((result) => result.approved !== false).length} foto sudah dipotong sesuai ukuran ${order.marketplaceIds.join(', ')}.`,
      ``,
      `Unduh di sini: ${config.publicUrl.replace(':4000', ':5173')}/pesanan/${order.id}`,
      ``,
      `Kalau ada yang kurang pas, balas pesan ini. Revisi kami bantu.`,
    ].join('\n'),

  revision: (order, note) =>
    [
      `Reviewer kami menemukan hasil yang belum pas untuk *${order.code}*, jadi kami proses ulang dulu.`,
      note ? `\nCatatan: ${note}` : '',
      `\nKami kabari lagi setelah versi barunya siap.`,
    ].join(''),

  statusUpdate: (order) => `Update pesanan *${order.code}*: ${STATUS_LABELS[order.status]}.`,
};

/**
 * Sends (or records) a WhatsApp message.
 * @returns {Promise<{id: string, delivered: boolean}>}
 */
export const sendMessage = async (order, body, kind = 'notification') => {
  const record = {
    id: nanoid(10),
    orderId: order.id,
    orderCode: order.code,
    to: order.seller.whatsapp,
    kind,
    body,
    delivered: false,
    createdAt: new Date().toISOString(),
  };

  if (!config.whatsapp.enabled || !record.to) {
    console.log(`\n[whatsapp:dry-run] -> ${record.to || 'no-number'}\n${body}\n`);
    messages.insert(record);
    return { id: record.id, delivered: false };
  }

  try {
    const response = await fetch(
      `${config.whatsapp.apiUrl}/${config.whatsapp.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.whatsapp.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: record.to,
          type: 'text',
          text: { body, preview_url: true },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`${response.status} ${detail}`);
    }
    record.delivered = true;
  } catch (error) {
    console.error('[whatsapp] send failed:', error.message);
    record.error = error.message;
  }

  messages.insert(record);
  return { id: record.id, delivered: record.delivered };
};

export const listMessages = (orderId) =>
  orderId ? messages.find((message) => message.orderId === orderId) : messages.all();

export default { sendMessage, templates, listMessages };
