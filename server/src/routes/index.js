import { Router } from 'express';
import catalogRoutes from './catalog.routes.js';
import orderRoutes from './order.routes.js';
import reviewRoutes from './review.routes.js';
import webhookRoutes from './webhook.routes.js';

const router = Router();

router.use(catalogRoutes);
router.use(orderRoutes);
router.use(reviewRoutes);
router.use(webhookRoutes);

export default router;
