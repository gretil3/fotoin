import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..', '..');

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4000),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, ''),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  paths: {
    root: serverRoot,
    storage: path.join(serverRoot, 'storage'),
    uploads: path.join(serverRoot, 'storage', 'uploads'),
    results: path.join(serverRoot, 'storage', 'results'),
    db: path.join(serverRoot, 'storage', 'db.json'),
  },

  uploads: {
    maxSizeBytes: int(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
    maxFiles: int(process.env.MAX_FILES_PER_ORDER, 5),
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  },

  generation: {
    provider: process.env.IMAGE_PROVIDER || 'mock',
    apiKey: process.env.IMAGE_PROVIDER_API_KEY || '',
    model: process.env.IMAGE_PROVIDER_MODEL || '',
    mockDelayMs: int(process.env.MOCK_GENERATION_DELAY_MS, 2500),
  },

  review: {
    required: bool(process.env.REQUIRE_HUMAN_REVIEW, true),
    token: process.env.REVIEWER_TOKEN || 'dev-reviewer-token',
  },

  whatsapp: {
    enabled: bool(process.env.WHATSAPP_ENABLED, false),
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || '',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'fotoin-verify',
    apiUrl: process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v21.0',
  },

  payment: {
    provider: process.env.PAYMENT_PROVIDER || 'mock',
    serverKey: process.env.PAYMENT_SERVER_KEY || '',
    isProduction: bool(process.env.PAYMENT_IS_PRODUCTION, false),
  },
};

export default config;
