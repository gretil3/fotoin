import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client.js';
import { dateTime } from '../lib/format.js';
import { Alert, EmptyState, StatusBadge } from '../components/ui.jsx';

// Same key CreateOrderPage writes after an order is placed.
const REMEMBERED_PHONE_KEY = 'fotoin:whatsapp';

const rememberedPhone = () => {
  try {
    return localStorage.getItem(REMEMBERED_PHONE_KEY) || '';
  } catch {
    return '';
  }
};

export default function OrdersPage() {
  // null = nothing looked up yet. The API no longer lists everyone's orders, so
  // a seller finds theirs by WhatsApp number (remembered from their last order).
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [phone, setPhone] = useState(rememberedPhone);

  const load = async (whatsapp) => {
    setError(null);
    if (!whatsapp) {
      setOrders(null);
      return;
    }
    try {
      const data = await api.listOrders({ whatsapp });
      setOrders(data.orders);
      try {
        localStorage.setItem(REMEMBERED_PHONE_KEY, whatsapp);
      } catch {
        /* private mode: not remembering the number is fine */
      }
    } catch (err) {
      setError(err.message);
      setOrders([]);
    }
  };

  useEffect(() => {
    load(rememberedPhone());
  }, []);

  return (
    <div className="container">
      <h1>Pesanan Saya</h1>
      <p className="muted">
        Masukkan nomor WhatsApp yang kamu pakai saat memesan untuk melihat status dan mengunduh
        hasil foto.
      </p>

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
              setOrders(null);
              try {
                localStorage.removeItem(REMEMBERED_PHONE_KEY);
              } catch {
                /* ignore */
              }
            }}
          >
            Reset
          </button>
        )}
      </form>

      {error && <Alert tone="error">{error}</Alert>}

      {orders === null ? (
        <EmptyState title="Cari pesananmu">
          Ketik nomor WhatsApp di atas, lalu tekan Cari.
        </EmptyState>
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
