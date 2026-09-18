import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import config from '../config/env.js';
import { ApiError } from '../utils/api-error.js';

/** Wraps an async route handler so rejections reach the error middleware. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next);

/** Multer storage for seller photo uploads. */
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(config.paths.uploads, { recursive: true });
    cb(null, config.paths.uploads);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${Date.now()}_${nanoid(8)}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: config.uploads.maxSizeBytes, files: config.uploads.maxFiles },
  fileFilter(_req, file, cb) {
    if (config.uploads.allowedMimeTypes.includes(file.mimetype)) return cb(null, true);
    cb(new ApiError(415, 'Format file harus JPG, PNG, WEBP, atau HEIC.', { code: 'BAD_MIME' }));
  },
});

/** Guards the reviewer console endpoints. */
export const requireReviewer = (req, _res, next) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.get('x-reviewer-token');
  if (token && token === config.review.token) return next();
  next(new ApiError(401, 'Token reviewer tidak valid.', { code: 'BAD_REVIEWER_TOKEN' }));
};

export const notFound = (req, _res, next) => {
  next(new ApiError(404, `Rute ${req.method} ${req.originalUrl} tidak ditemukan.`, {
    code: 'ROUTE_NOT_FOUND',
  }));
};

/* eslint-disable-next-line no-unused-vars -- Express identifies this by arity. */
export const errorHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: `Ukuran file maksimal ${config.uploads.maxSizeBytes / 1024 / 1024} MB.`,
      LIMIT_FILE_COUNT: `Maksimal ${config.uploads.maxFiles} foto per pesanan.`,
      LIMIT_UNEXPECTED_FILE: 'Gunakan field "photos" untuk mengunggah foto.',
    };
    return res.status(413).json({
      error: { code: error.code, message: messages[error.code] || 'Upload gagal.' },
    });
  }

  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }

  console.error('[error]', error);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Terjadi kesalahan di server. Coba lagi sebentar.',
      ...(config.env === 'development' ? { debug: error.message } : {}),
    },
  });
};

export default { asyncHandler, upload, requireReviewer, notFound, errorHandler };
