import { useEffect, useState } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import Icon from './Icon.jsx';

// The reviewer console is an internal tool, so it lives in the footer, not the seller nav.
const links = [
  { to: '/', label: 'Beranda', end: true },
  { to: '/pesanan', label: 'Pesanan Saya' },
  { to: '/harga', label: 'Harga' },
];

export default function Layout({ children }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="shell">
      <header className="navbar">
        <div className="container navbar__inner">
          <Link to="/" className="brand">
            <img src="/logo.svg" alt="" />
            <span>FOTOIN</span>
          </Link>

          <nav id="main-nav" className={`navlinks${open ? ' is-open' : ''}`} aria-label="Menu utama">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `navlink${isActive ? ' active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
            <Link to="/buat" className="btn btn--primary btn--block">
              Buat Pesanan
            </Link>
          </nav>

          <div className="navbar__actions">
            <Link to="/buat" className="btn btn--primary btn--sm navbar__cta">
              Buat Pesanan
            </Link>
            <button
              type="button"
              className="menu-toggle"
              aria-label={open ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={open}
              aria-controls="main-nav"
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name={open ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
      </header>

      <main className="page">{children}</main>

      <footer className="footer">
        <div className="container row row-between" style={{ alignItems: 'flex-start' }}>
          <div>
            <strong>FOTOIN</strong> &middot; Foto produk siap jualan, dari HP kamu.
            <div className="small">Dibantu AI, dicek manusia. Untuk UMKM Indonesia.</div>
          </div>
          <div className="small">
            Shopee &middot; Tokopedia &middot; TikTok Shop &middot; Instagram
            <div>Rp15.000 &ndash; Rp25.000 per paket, tanpa langganan.</div>
            <div style={{ marginTop: 6 }}>
              <Link to="/review">Panel Reviewer (tim FOTOIN)</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
