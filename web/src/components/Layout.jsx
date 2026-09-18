import { NavLink, Link } from 'react-router-dom';

const links = [
  { to: '/', label: 'Beranda', end: true },
  { to: '/buat', label: 'Buat Pesanan' },
  { to: '/pesanan', label: 'Pesanan Saya' },
  { to: '/harga', label: 'Harga' },
  { to: '/review', label: 'Panel Reviewer' },
];

export default function Layout({ children }) {
  return (
    <div className="shell">
      <header className="navbar">
        <div className="container navbar__inner">
          <Link to="/" className="brand">
            <img src="/logo.svg" alt="" />
            <span>
              FOTO<em>IN</em>
            </span>
          </Link>
          <nav className="navlinks">
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
          </nav>
        </div>
      </header>

      <main className="page">{children}</main>

      <footer className="footer">
        <div className="container row row-between">
          <div>
            <strong>FOTOIN</strong> - Foto produk siap jualan, dari HP kamu.
            <div className="small">Dibantu AI, dicek manusia. Untuk UMKM Indonesia.</div>
          </div>
          <div className="small">
            Shopee - Tokopedia - TikTok Shop - Instagram
            <div>Rp15.000 - Rp25.000 per paket, tanpa langganan.</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
