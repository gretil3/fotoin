/**
 * Error carrying an HTTP status and a seller-facing Bahasa Indonesia message.
 * Anything thrown that is NOT an ApiError is treated as a 500 and its message
 * is hidden from the client.
 */
export class ApiError extends Error {
  constructor(status, message, { code, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'ERROR';
    this.details = details || null;
  }

  static badRequest(message, options) {
    return new ApiError(400, message, options);
  }

  static unauthorized(message = 'Akses ditolak.', options) {
    return new ApiError(401, message, options);
  }

  static notFound(message = 'Data tidak ditemukan.', options) {
    return new ApiError(404, message, options);
  }

  static unprocessable(message, options) {
    return new ApiError(422, message, options);
  }
}

export default ApiError;
