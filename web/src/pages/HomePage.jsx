import { Link } from 'react-router-dom';

const steps = [
  {
    n: '1',
    title: 'Jepret',
    body: 'Foto produk pakai HP apa adanya. Tidak perlu lightbox, tripod, atau studio.',
  },
  {
    n: '2',
    title: 'Kirim',
    body: 'Upload lewat WhatsApp atau web FOTOIN, lalu pilih kategori produk kamu.',
  },
  {
    n: '3',
    title: 'AI Proses',
    body: 'AI membuat variasi latar studio, lifestyle, dan flat-lay - tanpa kamu menulis prompt.',
  },
  {
    n: '4',
    title: 'Dicek & Dikirim',
    body: 'Reviewer manusia memeriksa hasilnya, lalu mengirim ukuran siap unggah ke WhatsApp kamu.',
  },
];

const differentiators = [
  {
    title: 'Jasa, bukan sekadar tools',
    body: 'Kamu tidak perlu belajar prompt atau edit. AI yang bekerja, tim kami yang memastikan hasilnya benar sebelum dikirim.',
  },
  {
    title: 'Dibuat untuk pasar Indonesia',
    body: 'Antarmuka Bahasa Indonesia dengan template khusus kuliner, fashion muslim, kerajinan, dan kosmetik lokal.',
  },
  {
    title: 'Langsung siap unggah',
    body: 'Otomatis dipotong ke ukuran resmi Shopee, Tokopedia, dan TikTok Shop. Tinggal upload, tidak perlu resize manual.',
  },
  {
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

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div>
            <span className="badge badge--brand">Untuk UMKM Indonesia</span>
            <h1 style={{ marginTop: 14 }}>
              Foto produk siap jualan, <br />
              dari HP kamu.
            </h1>
            <p className="hero__lead">
              FOTOIN mengubah foto seadanya jadi visual produk bersih dan siap unggah ke marketplace
              dalam hitungan menit. Dibantu AI, dicek manusia - jadi hasilnya tidak pernah aneh.
            </p>
            <div className="row" style={{ marginTop: 22 }}>
              <Link to="/buat" className="btn btn--primary btn--lg">
                Mulai Pesan
              </Link>
              <Link to="/harga" className="btn btn--ghost btn--lg">
                Lihat Harga
              </Link>
            </div>
            <div className="hero__proof">
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
                <span className="small muted">Shopee, Tokopedia, TikTok, IG</span>
              </div>
            </div>
          </div>

          <div className="compare" aria-hidden="true">
            <figure>
              <div className="compare__frame compare__before">HP</div>
              <figcaption>Sebelum: foto meja dapur</figcaption>
            </figure>
            <figure>
              <div className="compare__frame compare__after">PRO</div>
              <figcaption>Sesudah: siap unggah 1:1</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <div className="container page">
        <section className="section">
          <h2>Cara kerjanya</h2>
          <p className="muted">Empat langkah, tanpa perlu keahlian desain.</p>
          <div className="grid grid-4" style={{ marginTop: 18 }}>
            {steps.map((step) => (
              <div className="card" key={step.n}>
                <span className="badge badge--brand">Langkah {step.n}</span>
                <h3 style={{ marginTop: 12 }}>{step.title}</h3>
                <p className="small muted" style={{ margin: 0 }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Kenapa bukan tools AI biasa?</h2>
          <div className="grid grid-2" style={{ marginTop: 18 }}>
            {differentiators.map((item) => (
              <div className="card" key={item.title}>
                <div className="card__title">{item.title}</div>
                <p className="small muted" style={{ margin: 0 }}>
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2>Dibuat untuk empat jenis usaha</h2>
          <div className="grid grid-4" style={{ marginTop: 18 }}>
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

        <section className="card" style={{ textAlign: 'center', padding: 40 }}>
          <h2>Siap coba dengan satu produk dulu?</h2>
          <p className="muted" style={{ maxWidth: '52ch', margin: '0 auto 22px' }}>
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
