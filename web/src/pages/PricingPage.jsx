import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { rupiah } from '../lib/format.js';
import { Alert, LoadingState } from '../components/ui.jsx';

const faqs = [
  {
    q: 'Apakah ini langganan bulanan?',
    a: 'Bukan. Kamu bayar per paket saja. Kalau bulan ini tidak ada produk baru, kamu tidak bayar apa-apa.',
  },
  {
    q: 'Bagaimana kalau hasilnya tidak sesuai?',
    a: 'Sebelum dikirim, setiap foto dicek reviewer manusia. Kalau masih ada yang kurang pas, balas WhatsApp kami dan kami proses ulang sesuai jatah revisi paketmu.',
  },
  {
    q: 'Apakah saya perlu menulis prompt AI?',
    a: 'Tidak. Kamu cukup pilih kategori produk dan gaya foto. Prompt-nya sudah kami siapkan per kategori.',
  },
  {
    q: 'Bayarnya lewat apa?',
    a: 'QRIS, GoPay, OVO, atau DANA. Semua bisa dari HP tanpa perlu kartu kredit.',
  },
];

export default function PricingPage() {
  const [packs, setPacks] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .catalog()
      .then((data) => setPacks(data.packs))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div className="container">
      <div className="center" style={{ maxWidth: 640, margin: '0 auto 34px' }}>
        <h1>Harga sederhana, bayar per paket</h1>
        <p className="muted">
          Tanpa langganan, tanpa kontrak. Satu harga sudah termasuk pemrosesan AI, pengecekan
          reviewer, dan potongan ukuran untuk setiap marketplace.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {!packs ? (
        <LoadingState />
      ) : (
        <div className="grid grid-3">
          {packs.map((pack) => (
            <div
              className="card"
              key={pack.id}
              style={pack.popular ? { borderColor: 'var(--brand-500)', boxShadow: 'var(--shadow)' } : undefined}
            >
              {pack.popular && <span className="badge badge--brand">Paling laris</span>}
              <h3 style={{ marginTop: pack.popular ? 12 : 0 }}>{pack.name}</h3>
              <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
                {rupiah(pack.priceIdr)}
              </div>
              <div className="small muted" style={{ marginBottom: 16 }}>
                per paket - selesai sekitar {pack.turnaroundHours} jam
              </div>
              <ul style={{ paddingLeft: 18, margin: '0 0 20px' }}>
                {pack.highlights.map((item) => (
                  <li key={item} className="small" style={{ marginBottom: 6 }}>
                    {item}
                  </li>
                ))}
              </ul>
              <Link
                to="/buat"
                className={`btn btn--block ${pack.popular ? 'btn--primary' : 'btn--ghost'}`}
              >
                Pilih {pack.name}
              </Link>
            </div>
          ))}
        </div>
      )}

      <section className="section" style={{ marginTop: 48 }}>
        <h2>Pertanyaan yang sering muncul</h2>
        <div className="grid grid-2" style={{ marginTop: 16 }}>
          {faqs.map((faq) => (
            <div className="card card--flat" key={faq.q}>
              <div className="card__title">{faq.q}</div>
              <p className="small muted" style={{ margin: 0 }}>
                {faq.a}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
