import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { rupiah } from '../lib/format.js';
import { Alert, LoadingState } from '../components/ui.jsx';
import Icon from '../components/Icon.jsx';

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
    a: 'Tidak. Kamu cukup pilih kategori, gaya foto, dan jawab beberapa pertanyaan singkat dengan sekali ketuk. Kalau mau, ceritakan produkmu dengan kata-katamu sendiri. Prompt-nya kami yang susun.',
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
            <div className={`card price-card${pack.popular ? ' is-popular' : ''}`} key={pack.id}>
              <div className="row row-between" style={{ marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>{pack.name}</h3>
                {pack.popular && <span className="badge badge--brand">Paling laris</span>}
              </div>
              <div className="price-card__price">{rupiah(pack.priceIdr)}</div>
              <div className="small muted" style={{ marginBottom: 18 }}>
                per paket &middot; selesai sekitar {pack.turnaroundHours} jam
              </div>
              <ul className="checklist">
                {pack.highlights.map((item) => (
                  <li key={item}>
                    <Icon name="check" strokeWidth={2.4} />
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

      <section className="section" style={{ marginTop: 56, maxWidth: 760, marginInline: 'auto' }}>
        <h2 className="center">Pertanyaan yang sering muncul</h2>
        <div className="faq" style={{ marginTop: 20 }}>
          {faqs.map((faq) => (
            <details key={faq.q}>
              <summary>{faq.q}</summary>
              <p className="small muted">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
