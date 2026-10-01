import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';

// One message, one button. The longer explanation lives on /cara-kerja, so a
// seller who just wants to order is never asked to read first.

const steps = [
  { icon: 'camera', title: 'Foto pakai HP', body: 'Apa adanya. Di meja dapur juga boleh.' },
  { icon: 'check', title: 'Pilih jenis produk', body: 'Tinggal ketuk, tidak perlu mengetik.' },
  { icon: 'chat', title: 'Terima di WhatsApp', body: 'Foto rapi, sudah dicek tim kami.' },
];

const channels = [
  { name: 'Shopee', color: '#ee4d2d' },
  { name: 'Tokopedia', color: '#42b549' },
  { name: 'TikTok Shop', color: '#111111' },
  { name: 'Instagram', color: '#c13584' },
];

// The same jar in both frames: the point of the picture is that the product
// itself does not change, only what is around it.
function ProductJar() {
  return (
    <svg className="jar" viewBox="0 0 120 160" aria-hidden="true">
      <rect x="22" y="8" width="76" height="26" rx="6" fill="#8f1d14" />
      <rect x="22" y="26" width="76" height="6" fill="#6f150e" />
      <path d="M16 44a10 10 0 0110-10h68a10 10 0 0110 10v96a14 14 0 01-14 14H30a14 14 0 01-14-14V44z" fill="#c8321f" />
      <path d="M24 44h8v100h-2a6 6 0 01-6-6V44z" fill="#ffffff" opacity="0.18" />
      <rect x="16" y="70" width="88" height="54" fill="#fff4e0" />
      <text x="60" y="95" textAnchor="middle" fontFamily="Sora, sans-serif" fontWeight="700" fontSize="15" fill="#8f1d14">
        SAMBAL
      </text>
      <text x="60" y="113" textAnchor="middle" fontFamily="Manrope, sans-serif" fontWeight="600" fontSize="10" fill="#6b4a2b">
        Bu Sari · Pedas
      </text>
    </svg>
  );
}

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="container hero__grid">
          <div>
            <span className="hero__badge">
              <Icon name="sparkle" size={14} /> Dibantu AI &middot; Dicek manusia
            </span>
            <h1>
              Foto produk <em>siap jualan</em>, dari HP kamu.
            </h1>
            <p className="hero__lead">Kirim foto seadanya. Kami ubah jadi foto bagus untuk jualan.</p>
            <Link to="/buat" className="btn btn--light btn--xl">
              Mulai Sekarang
              <Icon name="arrowRight" size={20} />
            </Link>
            <ul className="hero__trust">
              <li>
                <Icon name="check" size={16} /> Mulai Rp15.000
              </li>
              <li>
                <Icon name="check" size={16} /> Tanpa langganan
              </li>
              <li>
                <Icon name="check" size={16} /> Hasil di WhatsApp
              </li>
            </ul>
          </div>

          <div className="showcase" aria-hidden="true">
            <figure className="showcase__card showcase__before">
              <div className="showcase__scene">
                <span className="clutter clutter--cup" />
                <span className="clutter clutter--cloth" />
                <ProductJar />
              </div>
              <figcaption>Sebelum</figcaption>
            </figure>
            <span className="showcase__magic">
              <Icon name="sparkle" size={22} />
            </span>
            <figure className="showcase__card showcase__after">
              <div className="showcase__scene">
                <span className="showcase__shadow" />
                <ProductJar />
                <span className="showcase__tag">1:1 &middot; Shopee</span>
              </div>
              <figcaption>Sesudah</figcaption>
              <span className="showcase__ok">
                <Icon name="check" size={14} strokeWidth={2.4} /> Dicek manusia
              </span>
            </figure>
          </div>
        </div>
      </section>

      <div className="container">
        <section className="section home-steps">
          <h2 className="center">Semudah 1, 2, 3</h2>
          <ol className="steps3">
            {steps.map((step, index) => (
              <li key={step.title}>
                <span className="steps3__icon">
                  <Icon name={step.icon} size={30} strokeWidth={1.6} />
                  <span className="steps3__num">{index + 1}</span>
                </span>
                <strong>{step.title}</strong>
                <span className="muted">{step.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="section channels">
          <span className="muted">Ukurannya langsung pas untuk</span>
          <div className="channels__list">
            {channels.map((channel) => (
              <span key={channel.name} className="channels__item">
                <span className="channels__dot" style={{ background: channel.color }} />
                {channel.name}
              </span>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <h2>Coba satu produk dulu.</h2>
          <p>Bayar sekali, mulai Rp15.000. Tidak cocok? Tidak perlu lanjut.</p>
          <Link to="/buat" className="btn btn--light btn--xl">
            Mulai Sekarang
            <Icon name="arrowRight" size={20} />
          </Link>
          <p className="small" style={{ marginTop: 18, marginBottom: 0 }}>
            <Link to="/cara-kerja" className="cta-band__link">
              Mau tahu lebih lanjut? Lihat cara kerjanya
            </Link>
          </p>
        </section>
      </div>
    </>
  );
}
