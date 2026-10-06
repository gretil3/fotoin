import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..', '..');
// STORAGE_DIR lets tests (and containers with a mounted volume) keep uploads,
// results and the db somewhere other than the repo checkout.
const storageRoot = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : path.join(serverRoot, 'storage');

const bool = (value, fallback = false) => {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const imageProvider = (process.env.IMAGE_PROVIDER || 'mock').trim().toLowerCase();
const refinerProvider = (process.env.REFINER_PROVIDER || 'rules').trim().toLowerCase();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 4000),
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:4000').replace(/\/$/, ''),
  webUrl: (process.env.WEB_URL || 'http://localhost:5173').replace(/\/$/, ''),
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),

  paths: {
    root: serverRoot,
    storage: storageRoot,
    uploads: path.join(storageRoot, 'uploads'),
    results: path.join(storageRoot, 'results'),
    db: path.join(storageRoot, 'db.json'),
  },

  uploads: {
    maxSizeBytes: int(process.env.MAX_UPLOAD_MB, 10) * 1024 * 1024,
    maxFiles: int(process.env.MAX_FILES_PER_ORDER, 5),
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  },

  generation: {
    provider: imageProvider,
    apiKey: process.env.IMAGE_PROVIDER_API_KEY || '',
    model: process.env.IMAGE_PROVIDER_MODEL || '',
    // `local` provider: the Python pipeline's HTTP API (pipeline/fotoin/api.py).
    url: (process.env.LOCAL_PIPELINE_URL || 'http://localhost:8000').replace(/\/$/, ''),
    // Per image, per attempt. CPU segmentation of a 2048px photo takes a few seconds.
    timeoutMs: int(process.env.IMAGE_PROVIDER_TIMEOUT_MS, 60000),
    mockDelayMs: int(process.env.MOCK_GENERATION_DELAY_MS, 2500),
  },

  // Reads the seller's own words (product notes) before generation.
  refiner: {
    // rules = built in and offline (default). gemini = an AI model also reads the
    // notes. Any failure falls back to the rules, so an order is never blocked.
    provider: refinerProvider,
    // When the refiner and the image step use the same vendor, the image key is
    // reused so there is only one secret to manage.
    apiKey:
      process.env.REFINER_API_KEY ||
      (refinerProvider === imageProvider ? process.env.IMAGE_PROVIDER_API_KEY || '' : ''),
    // Empty = the provider's default (refiners/gemini.js: DEFAULT_MODEL).
    model: process.env.REFINER_MODEL || '',
    timeoutMs: int(process.env.REFINER_TIMEOUT_MS, 8000),
  },

  review: {
    required: bool(process.env.REQUIRE_HUMAN_REVIEW, true),
    token: process.env.REVIEWER_TOKEN || 'dev-reviewer-token',
    // How many times a reviewer may send one order back to the generator. This is
    // a loop guard on *our* quality failures, not the seller's free revisions.
    maxReruns: int(process.env.REVIEW_MAX_RERUNS, 2),
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
