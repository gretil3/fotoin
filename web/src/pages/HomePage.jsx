import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

const steps = [
  {
    title: 'Jepret',
    body: 'Foto produk pakai HP apa adanya. Tidak perlu lightbox, tripod, atau studio.',
  },
  {
    title: 'Kirim',
    body: 'Upload lewat WhatsApp atau web FOTOIN, lalu pilih kategori produk kamu.',
  },
  {
    title: 'AI Proses',
    body: 'AI membuat variasi latar studio, lifestyle, dan flat-lay - tanpa kamu menulis prompt.',
  },
  {
    title: 'Dicek & Dikirim',
    body: 'Reviewer manusia memeriksa hasilnya, lalu mengirim ukuran siap unggah ke WhatsApp kamu.',
  },
];

const differentiators = [
  {
    icon: 'shield',
    title: 'Jasa, bukan sekadar tools',
    body: 'Kamu tidak perlu belajar prompt atau edit. AI yang bekerja, tim kami yang memastikan hasilnya benar sebelum dikirim.',
  },
  {
    icon: 'store',
    title: 'Dibuat untuk pasar Indonesia',
    body: 'Antarmuka Bahasa Indonesia dengan template khusus kuliner, fashion muslim, kerajinan, dan kosmetik lokal.',
  },
  {
    icon: 'image',
    title: 'Langsung siap unggah',
    body: 'Otomatis dipotong ke ukuran resmi Shopee, Tokopedia, dan TikTok Shop. Tinggal upload, tidak perlu resize manual.',
  },
  {
    icon: 'chat',
    title: 'Lewat WhatsApp, bayar QRIS',
    body: 'Pesan dari aplikasi yang sudah kamu pakai tiap hari. Bayar per paket Rp15.000-Rp25.000, tanpa langganan.',
  },
];

const verticals = [
  { name: 'Kuliner', body: 'Frozen food, katering rumahan, snack kemasan, minuman.' },
  { name: 'Fashion & Hijab', body: 'Hijab, gamis, koko, mukena, brand modest kecil.' },
  { name: 'Kerajinan & Dekor', body: 'Anyaman, keramik, lilin, dekorasi rumah handmade.' },
  { name: 'Skincare & Kosmetik', body: 'Skincare lokal, body care, parfum, kosmetik brand sendiri.' },
];

const channels = ['Shopee', 'Tokopedia', 'TikTok Shop', 'Instagram'];

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div>
            <span className="badge badge--brand">Dibantu AI &middot; Dicek manusia</span>
            <h1>Foto produk siap jualan, dari HP kamu.</h1>
            <p className="hero__lead">
              Kirim foto seadanya, kami olah jadi foto katalog yang rapi dan siap unggah ke
              marketplace. Hasilnya dicek manusia dulu, jadi tidak pernah aneh.
            </p>
            <div className="row" style={{ marginTop: 26 }}>
              <Link to="/buat" className="btn btn--primary btn--lg">
                Buat Pesanan Sekarang
                <Icon name="arrowRight" size={18} />
              </Link>
              <Link to="/harga" className="btn btn--ghost btn--lg">
                Lihat Harga
              </Link>
            </div>
            <div className="stats">
              <div>
                <strong>Rp15rb</strong>
                <span className="small muted">mulai per paket</span>
              </div>
              <div>
                <strong>1-6 jam</strong>
                <span className="small muted">waktu pengerjaan</span>
              </div>
              <div>
                <strong>4 kanal</strong>
                <span className="small muted">siap unggah</span>
              </div>
            </div>
          </div>

          <div>
            <div className="compare" aria-hidden="true">
              <figure>
                <div className="compare__frame compare__before">
                  <Icon name="camera" size={40} strokeWidth={1.4} />
                </div>
                <figcaption>Sebelum: foto meja dapur</figcaption>
              </figure>
              <figure>
                <div className="compare__frame compare__after">
                  <Icon name="sparkle" size={40} strokeWidth={1.4} />
                </div>
                <figcaption>Sesudah: siap unggah 1:1</figcaption>
              </figure>
            </div>
            <div className="chips">
              {channels.map((channel) => (
                <span className="chip" key={channel}>
                  {channel}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="container page">
        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Cara kerja</span>
            <h2>Empat langkah, tanpa keahlian desain</h2>
          </div>
          <div className="grid grid-4">
            {steps.map((step, index) => (
              <div className="card" key={step.title}>
                <div className="step-num">{index + 1}</div>
                <h3>{step.title}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Kenapa FOTOIN</span>
            <h2>Bukan tools AI biasa</h2>
          </div>
          <div className="grid grid-2">
            {differentiators.map((item) => (
              <div className="card" key={item.title}>
                <div className="feature__icon">
                  <Icon name={item.icon} />
                </div>
                <div className="card__title">{item.title}</div>
                <p className="small muted" style={{ margin: 0 }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <div className="section-head">
            <span className="eyebrow">Kategori</span>
            <h2>Dibuat untuk empat jenis usaha</h2>
          </div>
          <div className="grid grid-4">
            {verticals.map((vertical) => (
              <div className="card card--flat" key={vertical.name}>
                <div className="card__title">{vertical.name}</div>
                <p className="small muted" style={{ margin: 0 }}>
                  {vertical.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <h2>Siap coba dengan satu produk dulu?</h2>
          <p>
            Tidak ada langganan dan tidak ada kontrak. Bayar satu paket, lihat hasilnya, baru
            lanjutkan kalau cocok.
          </p>
          <Link to="/buat" className="btn btn--primary btn--lg">
            Buat Pesanan Pertama
          </Link>
        </section>
      </div>
    </>
  );
}
