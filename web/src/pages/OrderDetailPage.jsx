import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client.js';
import { briefAnswerText, dateTime, relativeTime, rupiah } from '../lib/format.js';
import { Alert, LoadingState, Spinner, StatusBadge } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

// Statuses that can change without the seller doing anything. Includes awaiting
// payment (a real provider confirms via webhook, not via this page) and gagal
// (staff retry it behind the scenes).
const LIVE_STATUSES = ['menunggu_pembayaran', 'diproses_ai', 'menunggu_review', 'revisi', 'gagal'];

export default function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(false);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const { order: fresh } = await api.getOrder(id);
      setOrder(fresh);
      return fresh;
    } catch (err) {
      setError(err.message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while the order is moving through the pipeline.
  useEffect(() => {
    if (!order || !LIVE_STATUSES.includes(order.status)) return undefined;
    timer.current = setInterval(load, 3000);
    return () => clearInterval(timer.current);
  }, [order, load]);

  const pay = async () => {
    setPaying(true);
    setError(null);
    try {
      const { order: paid } = await api.payOrder(id, order.payment?.methodId || 'qris');
      setOrder(paid);
    } catch (err) {
      setError(err.message);
    } finally {
      setPaying(false);
    }
  };

  if (error && !order) {
    return (
      <div className="container">
        <Alert tone="error">{error}</Alert>
        <Link to="/pesanan" className="btn btn--ghost">
          Kembali ke daftar pesanan
        </Link>
      </div>
    );
  }
  if (!order) return <LoadingState label="Memuat pesanan..." />;

  const delivered = order.results.filter((result) => result.approved !== false);
  const progress = order.progress;

  return (
    <div className="container">
      <div className="row row-between" style={{ marginBottom: 18 }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{order.code}</h1>
          <div className="row">
            <StatusBadge status={order.status} label={order.statusLabel} />
            <span className="small muted">Dibuat {dateTime(order.createdAt)}</span>
          </div>
        </div>
        <Link to="/pesanan" className="btn btn--ghost btn--sm">
          Semua pesanan
        </Link>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <div className="split">
        <div>
          {order.status === 'menunggu_pembayaran' && (
            <div className="card section">
              <h3>Selesaikan pembayaran</h3>
              <p className="small muted">
                Bayar {rupiah(order.priceIdr)} via {order.payment?.methodName || 'QRIS'}. Kami mulai
                memproses foto begitu pembayaran masuk.
              </p>
              {order.payment?.qrPayload && (
                <div className="qr" style={{ marginBottom: 14 }}>
                  {order.payment.qrPayload}
                </div>
              )}
              <button type="button" className="btn btn--primary" disabled={paying} onClick={pay}>
                {paying ? <Spinner /> : null}
                {paying ? 'Memproses...' : `Saya sudah bayar ${rupiah(order.priceIdr)}`}
              </button>
              <div className="hint" style={{ marginTop: 10 }}>
                Mode demo: tombol ini menggantikan webhook dari penyedia pembayaran.
              </div>
            </div>
          )}

          {order.status === 'diproses_ai' && (
            <div className="card section">
              <h3>AI sedang bekerja</h3>
              <p className="small muted">
                {progress
                  ? `${progress.done} dari ${progress.total} foto selesai dirender.`
                  : `Menyiapkan ${order.plannedOutputs} foto...`}
              </p>
              <div className="progress">
                <div
                  className="progress__bar"
                  style={{
                    width: progress ? `${(progress.done / progress.total) * 100}%` : '12%',
                  }}
                />
              </div>
            </div>
          )}

          {order.status === 'menunggu_review' && (
            <Alert tone="info">
              Foto sudah jadi dan sedang dicek reviewer kami sebelum dikirim. Ini bagian yang
              membuat hasil FOTOIN aman dipakai jualan.
            </Alert>
          )}

          {order.status === 'revisi' && (
            <Alert tone="warning">
              Reviewer meminta perbaikan{order.review?.note ? `: ${order.review.note}` : ''}. Foto
              sedang diproses ulang.
            </Alert>
          )}

          {order.status === 'gagal' && (
            <Alert tone="warning">
              Ada kendala teknis saat membuat fotomu. Tim kami sudah tahu dan sedang mencoba
              ulang. Kamu tidak perlu membuat pesanan baru atau membayar lagi.
            </Alert>
          )}

          {order.status === 'selesai' && (
            <Alert tone="success">
              Selesai! {delivered.length} foto sudah lolos pengecekan dan siap diunggah.
            </Alert>
          )}

          <section className="section">
            <div className="row row-between" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0 }}>Hasil foto</h2>
              {delivered.length > 0 && (
                <span className="small muted">{delivered.length} file siap unggah</span>
              )}
            </div>

            {delivered.length === 0 ? (
              <div className="card center muted">Belum ada hasil. Foto muncul di sini setelah diproses.</div>
            ) : (
              <div className="results">
                {delivered.map((result) => (
                  <figure className="result" key={result.id} style={{ margin: 0 }}>
                    <div className="result__img">
                      <img src={result.url} alt={`${result.styleName} untuk ${result.marketplaceName}`} loading="lazy" />
                    </div>
                    <figcaption className="result__meta">
                      <strong>{result.marketplaceName}</strong>
                      <div className="muted">
                        {result.label} - {result.width}x{result.height}
                      </div>
                      <div className="muted">{result.styleName}</div>
                      <a
                        className="btn btn--sm btn--ghost btn--block"
                        style={{ marginTop: 10 }}
                        href={result.url}
                        download
                      >
                        <Icon name="download" size={16} />
                        Unduh
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>

          <section className="section">
            <h2>Foto asli yang kamu kirim</h2>
            <div className="thumbs">
              {order.photos.map((photo) => (
                <div className="thumb" key={photo.id}>
                  <img src={photo.url} alt={photo.originalName || photo.filename} loading="lazy" />
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside>
          <div className="card section">
            <h3>Ringkasan</h3>
            <table className="table">
              <tbody>
                <tr>
                  <th>Produk</th>
                  <td>{order.product.name}</td>
                </tr>
                <tr>
                  <th>Penjual</th>
                  <td>
                    {order.seller.name}
                    {order.seller.storeName ? ` - ${order.seller.storeName}` : ''}
                  </td>
                </tr>
                <tr>
                  <th>WhatsApp</th>
                  <td>{order.seller.whatsapp || '-'}</td>
                </tr>
                <tr>
                  <th>Paket</th>
                  <td>
                    {order.packId} - {order.priceFormatted}
                  </td>
                </tr>
                <tr>
                  <th>Gaya</th>
                  <td>{order.styleIds.join(', ')}</td>
                </tr>
                <tr>
                  <th>Kanal</th>
                  <td>{order.marketplaceIds.join(', ')}</td>
                </tr>
                <tr>
                  <th>Target</th>
                  <td>{relativeTime(order.dueAt)}</td>
                </tr>
              </tbody>
            </table>
            {order.briefSummary && (
              <>
                <h4 style={{ marginTop: 18, marginBottom: 6 }}>Cerita produk</h4>
                <table className="table">
                  <tbody>
                    {order.briefSummary.items.map((item) => (
                      <tr key={item.id}>
                        <th>{item.question}</th>
                        <td>{briefAnswerText(item)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {order.product.notes && (
              <p className="small muted" style={{ marginTop: 12 }}>
                Cerita tambahan: {order.product.notes}
              </p>
            )}
          </div>

          <div className="card">
            <h3>Riwayat</h3>
            <ul className="timeline">
              {[...order.timeline].reverse().map((entry, index) => (
                <li key={`${entry.status}-${index}`}>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{entry.status}</div>
                  <div className="small muted">{dateTime(entry.at)}</div>
                  {entry.note && <div className="small">{entry.note}</div>}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
