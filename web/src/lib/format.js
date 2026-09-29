export const rupiah = (value) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value || 0);

export const dateTime = (iso) =>
  iso
    ? new Intl.DateTimeFormat('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(iso))
    : '-';

export const relativeTime = (iso) => {
  if (!iso) return '-';
  const diffMs = new Date(iso).getTime() - Date.now();
  const units = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];
  const formatter = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return formatter.format(Math.round(diffMs / ms), unit);
  }
  return 'baru saja';
};

export const fileSize = (bytes) => {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
};

/** One brief answer as text: the tapped labels, or "leave it to us" when none. */
export const briefAnswerText = (item) =>
  item.answers.length > 0 ? item.answers.join(', ') : 'Serahkan ke kami';

/**
 * How the seller's own words were read, for the reviewer console. `refinement`
 * is staff-only and missing on orders that have not been through generation.
 */
export const refinementText = (refinement) => {
  if (!refinement) return 'Belum diproses.';
  if (refinement.source === 'ai') return `Dibaca AI (${refinement.provider}, ${refinement.model}).`;
  return 'Dibaca dengan aturan bawaan.';
};

/** Why the AI reader was configured but not used (refinement.fallbackReason), in Bahasa. */
export const FALLBACK_LABELS = {
  'no-key': 'kunci API belum diisi',
  'unknown-provider': 'penyedia AI tidak dikenal',
  timeout: 'AI terlalu lama menjawab',
  network: 'tidak bisa terhubung ke AI',
  blocked: 'AI menolak isi cerita',
  empty: 'AI tidak memberi jawaban',
  'invalid-json': 'jawaban AI tidak terbaca',
  'invalid-output': 'jawaban AI tidak sesuai format',
  'flagged-output': 'jawaban AI berisi perintah, jadi dibuang',
  'empty-output': 'jawaban AI kosong',
};

export const fallbackLabel = (code) =>
  FALLBACK_LABELS[code] || (String(code).startsWith('http-') ? `AI menjawab error ${String(code).slice(5)}` : code);

/** Maps an order status to the CSS modifier used by <StatusBadge />. */
export const statusTone = (status) =>
  ({
    draft: 'neutral',
    menunggu_pembayaran: 'warning',
    diproses_ai: 'info',
    menunggu_review: 'info',
    revisi: 'warning',
    gagal: 'danger',
    selesai: 'success',
    dibatalkan: 'danger',
  })[status] || 'neutral';
