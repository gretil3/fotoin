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

export default function CaraKerjaPage() {
  return (
    <div className="container">
      <div className="center" style={{ maxWidth: 640, margin: '0 auto 34px' }}>
        <h1>Cara kerja FOTOIN</h1>
        <p className="muted">Kamu cukup foto pakai HP. Sisanya kami yang kerjakan.</p>
      </div>

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
  );
}
