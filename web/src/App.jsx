import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import CreateOrderPage from './pages/CreateOrderPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import OrderDetailPage from './pages/OrderDetailPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import ReviewPage from './pages/ReviewPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/buat" element={<CreateOrderPage />} />
        <Route path="/pesanan" element={<OrdersPage />} />
        <Route path="/pesanan/:id" element={<OrderDetailPage />} />
        <Route path="/harga" element={<PricingPage />} />
        <Route path="/review" element={<ReviewPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Layout>
  );
}
