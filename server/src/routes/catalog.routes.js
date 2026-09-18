import { Router } from 'express';
import { CATEGORIES, MARKETPLACES, PACKS, PAYMENT_METHODS } from '../data/catalog.js';
import { queueStats } from '../services/pipeline.service.js';
import config from '../config/env.js';

const router = Router();

/** GET /api/v1/catalog - everything the wizard needs in one round trip. */
router.get('/catalog', (_req, res) => {
  res.json({
    categories: CATEGORIES,
    marketplaces: MARKETPLACES,
    packs: PACKS,
    paymentMethods: PAYMENT_METHODS,
    limits: {
      maxFiles: config.uploads.maxFiles,
      maxSizeMb: config.uploads.maxSizeBytes / 1024 / 1024,
      allowedMimeTypes: config.uploads.allowedMimeTypes,
    },
  });
});

router.get('/categories', (_req, res) => res.json({ categories: CATEGORIES }));
router.get('/marketplaces', (_req, res) => res.json({ marketplaces: MARKETPLACES }));
router.get('/packs', (_req, res) => res.json({ packs: PACKS }));

/** GET /api/v1/health - liveness + a peek at the generation queue. */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'fotoin-api',
    env: config.env,
    provider: config.generation.provider,
    humanReview: config.review.required,
    queue: queueStats(),
    time: new Date().toISOString(),
  });
});

export default router;
