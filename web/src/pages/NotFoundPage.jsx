import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="container center" style={{ padding: '80px 20px' }}>
      <h1>Halaman tidak ditemukan</h1>
      <p className="muted">Sepertinya tautan yang kamu buka sudah tidak ada.</p>
      <Link to="/" className="btn btn--primary">
        Kembali ke beranda
      </Link>
    </div>
  );
}
