/**
 * Thin fetch wrapper around the FOTOIN API.
 *
 * In dev, VITE_API_BASE_URL is empty and Vite proxies /api to localhost:4000,
 * so the browser stays on one origin. In production, point it at the API host.
 */
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const API = `${BASE_URL}/api/v1`;

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, headers = {}, signal } = {}) {
  const isFormData = body instanceof FormData;
  const response = await fetch(`${API}${path}`, {
    method,
    signal,
    headers: {
      ...(isFormData ? {} : body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  const text = await response.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text };
    }
  }

  if (!response.ok) {
    const error = payload?.error || {};
    throw new ApiError(error.message || `Permintaan gagal (${response.status}).`, {
      status: response.status,
      code: error.code,
      details: error.details,
    });
  }

  return payload;
}

const reviewerHeaders = () => ({
  Authorization: `Bearer ${import.meta.env.VITE_REVIEWER_TOKEN || 'dev-reviewer-token'}`,
});

export const api = {
  health: () => request('/health'),
  catalog: () => request('/catalog'),

  uploadPhotos(files, { signal } = {}) {
    const form = new FormData();
    for (const file of files) form.append('photos', file);
    return request('/uploads', { method: 'POST', body: form, signal });
  },

  createOrder: (brief) => request('/orders', { method: 'POST', body: brief }),
  listOrders: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, value]) => value != null && value !== ''),
    ).toString();
    return request(`/orders${query ? `?${query}` : ''}`);
  },
  getOrder: (id) => request(`/orders/${id}`),
  payOrder: (id, paymentMethodId = 'qris') =>
    request(`/orders/${id}/pay`, { method: 'POST', body: { paymentMethodId } }),
  cancelOrder: (id, reason) => request(`/orders/${id}/cancel`, { method: 'POST', body: { reason } }),
  getResults: (id) => request(`/orders/${id}/results`),
  messages: (orderId) => request(`/messages${orderId ? `?orderId=${orderId}` : ''}`),

  review: {
    queue: () => request('/review/queue', { headers: reviewerHeaders() }),
    get: (orderId) => request(`/review/${orderId}`, { headers: reviewerHeaders() }),
    approve: (orderId, payload) =>
      request(`/review/${orderId}/approve`, {
        method: 'POST',
        body: payload,
        headers: reviewerHeaders(),
      }),
    reject: (orderId, payload) =>
      request(`/review/${orderId}/reject`, {
        method: 'POST',
        body: payload,
        headers: reviewerHeaders(),
      }),
  },
};

export default api;
