import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { dateTime } from '../lib/format.js';
import { Alert, EmptyState, LoadingState, StatusBadge } from '../components/ui.jsx';

export default function OrdersPage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState('');

  const load = async (whatsapp) => {
    setError(null);
    try {
      const data = await api.listOrders(whatsapp ? { whatsapp } : {});
      setOrders(data.orders);
    } catch (err) {
      setError(err.message);
      setOrders([]);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="container">
      <h1>Pesanan Saya</h1>
      <p className="muted">Pantau status pesanan dan unduh hasil foto yang sudah selesai.</p>

      <form
        className="row"
        style={{ margin: '18px 0 26px' }}
        onSubmit={(event) => {
          event.preventDefault();
          load(phone.trim());
        }}
      >
        <input
          className="input"
          style={{ maxWidth: 280 }}
          placeholder="Cari dengan nomor WhatsApp"
          value={phone}
          inputMode="tel"
          onChange={(event) => setPhone(event.target.value)}
        />
        <button className="btn btn--primary" type="submit">
          Cari
        </button>
        {phone && (
          <button
            className="btn btn--ghost"
            type="button"
            onClick={() => {
              setPhone('');
              load();
            }}
          >
            Reset
          </button>
        )}
      </form>

      {error && <Alert tone="error">{error}</Alert>}

      {orders === null ? (
        <LoadingState />
      ) : orders.length === 0 ? (
        <EmptyState
          title="Belum ada pesanan"
          action={
            <Link to="/buat" className="btn btn--primary">
              Buat pesanan pertama
            </Link>
          }
        >
          Setiap pesanan yang kamu buat akan muncul di sini.
        </EmptyState>
      ) : (
        <div className="grid grid-2">
          {orders.map((order) => (
            <Link
              key={order.id}
              to={`/pesanan/${order.id}`}
              className="card"
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              <div className="row row-between" style={{ marginBottom: 8 }}>
                <strong>{order.code}</strong>
                <StatusBadge status={order.status} label={order.statusLabel} />
              </div>
              <div className="card__title">{order.product.name}</div>
              <div className="small muted">
                {order.packId} - {order.priceFormatted} - {order.styleIds.length} gaya -{' '}
                {order.marketplaceIds.join(', ')}
              </div>
              <div className="small muted" style={{ marginTop: 10 }}>
                {order.results.length > 0
                  ? `${order.results.length} foto dihasilkan`
                  : `${order.plannedOutputs} foto direncanakan`}{' '}
                - dibuat {dateTime(order.createdAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
