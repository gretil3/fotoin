import { useCallback, useEffect, useState } from 'react';
import api from '../api/client.js';
import { dateTime } from '../lib/format.js';
import { Alert, EmptyState, LoadingState, Spinner, StatusBadge } from '../components/ui.jsx';

/**
 * Reviewer console - the human half of the hybrid model.
 * A reviewer compares AI output against the seller's original, drops any frame
 * that is wrong, and either delivers the batch or sends it back for a re-run.
 */
export default function ReviewPage() {
  const [queue, setQueue] = useState(null);
  const [pipeline, setPipeline] = useState(null);
  const [active, setActive] = useState(null);
  const [rejected, setRejected] = useState(new Set());
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  const loadQueue = useCallback(async () => {
    setError(null);
    try {
      const data = await api.review.queue();
      setQueue(data.queue);
      setPipeline(data.pipeline);
      setActive((current) =>
        current ? data.queue.find((order) => order.id === current.id) || null : data.queue[0] || null,
      );
    } catch (err) {
      setError(err.message);
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    loadQueue();
    const timer = setInterval(loadQueue, 8000);
    return () => clearInterval(timer);
  }, [loadQueue]);

  const select = (order) => {
    setActive(order);
    setRejected(new Set());
    setNote('');
    setFlash(null);
  };

  const toggleResult = (resultId) => {
    setRejected((current) => {
      const next = new Set(current);
      if (next.has(resultId)) next.delete(resultId);
      else next.add(resultId);
      return next;
    });
  };

  const approve = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.review.approve(active.id, {
        reviewer: 'qa-web',
        note: note || null,
        rejectedResultIds: [...rejected],
      });
      setFlash(`${active.code} disetujui dan dikirim ke penjual.`);
      setActive(null);
      setRejected(new Set());
      setNote('');
      await loadQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!note.trim()) {
      setError('Tulis catatan revisi dulu agar proses ulang lebih terarah.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.review.reject(active.id, { reviewer: 'qa-web', note: note.trim() });
      setFlash(`${active.code} dikirim ulang ke pipeline dengan catatan revisi.`);
      setActive(null);
      setNote('');
      await loadQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container">
      <div className="row row-between">
        <div>
          <h1 style={{ marginBottom: 4 }}>Panel Reviewer</h1>
          <p className="muted">
            Tidak ada foto yang dikirim ke penjual sebelum lolos pengecekan di halaman ini.
          </p>
        </div>
        {pipeline && (
          <span className="badge">
            Pipeline: {pipeline.running} jalan / {pipeline.waiting} antre
          </span>
        )}
      </div>

      {flash && <Alert tone="success">{flash}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {queue === null ? (
        <LoadingState label="Memuat antrean..." />
      ) : queue.length === 0 ? (
        <EmptyState title="Antrean kosong">
          Semua pesanan sudah dicek. Halaman ini menyegar otomatis setiap 8 detik.
        </EmptyState>
      ) : (
        <div
          className="grid"
          style={{ gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', marginTop: 20 }}
        >
          <div>
            <h3>Antrean ({queue.length})</h3>
            <div className="grid" style={{ gap: 10 }}>
              {queue.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  className={`option${active?.id === order.id ? ' is-selected' : ''}`}
                  onClick={() => select(order)}
                >
                  <div className="row row-between">
                    <span className="option__name">{order.code}</span>
                    {order.overdue && <span className="badge badge--danger">Lewat target</span>}
                  </div>
                  <div className="option__desc">
                    {order.product.name} - {order.packId}
                  </div>
                  <div className="small muted" style={{ marginTop: 4 }}>
                    {order.results.length} foto - menunggu {order.waitingMinutes} menit
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            {!active ? (
              <div className="card center muted">Pilih satu pesanan dari antrean.</div>
            ) : (
              <div className="card">
                <div className="row row-between" style={{ marginBottom: 6 }}>
                  <h3 style={{ margin: 0 }}>{active.code}</h3>
                  <StatusBadge status={active.status} label={active.statusLabel} />
                </div>
                <div className="small muted">
                  {active.seller.name} - {active.product.name} - masuk {dateTime(active.createdAt)}
                </div>
                {active.product.notes && (
                  <Alert tone="info">Catatan penjual: {active.product.notes}</Alert>
                )}

                <h4 style={{ marginTop: 18 }}>Foto asli</h4>
                <div className="thumbs">
                  {active.photos.map((photo) => (
                    <div className="thumb" key={photo.id}>
                      <img src={photo.url} alt={photo.originalName || photo.filename} />
                    </div>
                  ))}
                </div>

                <h4 style={{ marginTop: 22 }}>
                  Hasil AI - klik foto yang tidak lolos ({rejected.size} ditandai)
                </h4>
                <div className="results">
                  {active.results.map((result) => {
                    const isRejected = rejected.has(result.id);
                    return (
                      <button
                        key={result.id}
                        type="button"
                        className={`result${isRejected ? ' is-rejected' : ''}`}
                        style={{ cursor: 'pointer', textAlign: 'left', padding: 0, font: 'inherit' }}
                        onClick={() => toggleResult(result.id)}
                        aria-pressed={isRejected}
                      >
                        <div className="result__img">
                          <img src={result.url} alt={result.label} loading="lazy" />
                        </div>
                        <div className="result__meta">
                          <strong>{result.marketplaceName}</strong>
                          <div className="muted">
                            {result.width}x{result.height} - {result.styleName}
                          </div>
                          <div className={isRejected ? 'badge badge--danger' : 'badge badge--success'}>
                            {isRejected ? 'Ditolak' : 'Lolos'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="field" style={{ marginTop: 20 }}>
                  <label htmlFor="note">Catatan reviewer</label>
                  <textarea
                    id="note"
                    className="textarea"
                    placeholder="Wajib diisi kalau menolak. Contoh: label produk terpotong di versi 3:4."
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>

                <div className="row">
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={approve}
                  >
                    {busy ? <Spinner /> : null}
                    Setujui &amp; kirim ({active.results.length - rejected.size} foto)
                  </button>
                  <button type="button" className="btn btn--danger" disabled={busy} onClick={reject}>
                    Tolak &amp; proses ulang
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
