import { Router } from 'express';
import { MARKETPLACES, PACKS, PAYMENT_METHODS } from '../data/catalog.js';
import { queueStats } from '../services/pipeline.service.js';
import { publicBriefQuestions, publicCategories } from '../services/brief.service.js';
import config from '../config/env.js';

const router = Router();

/**
 * GET /api/v1/catalog - everything the wizard needs in one round trip.
 * Categories and brief questions go out without their hidden prompt fragments.
 */
router.get('/catalog', (_req, res) => {
  res.json({
    categories: publicCategories(),
    briefQuestions: publicBriefQuestions(),
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

router.get('/categories', (_req, res) => res.json({ categories: publicCategories() }));
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
