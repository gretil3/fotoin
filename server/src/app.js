import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import fs from 'node:fs';
import config from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/index.js';

export const createApp = () => {
  const app = express();

  app.set('trust proxy', 1);
  app.use(
    cors({
      origin: config.corsOrigin.includes('*') ? true : config.corsOrigin,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (config.env !== 'test') app.use(morgan('dev'));

  // Seller uploads and generated results are served straight off disk. Swap the
  // two lines below for an S3/GCS signed-URL handler before going to production.
  fs.mkdirSync(config.paths.uploads, { recursive: true });
  fs.mkdirSync(config.paths.results, { recursive: true });
  app.use('/static/uploads', express.static(config.paths.uploads, { maxAge: '1h' }));
  app.use('/static/results', express.static(config.paths.results, { maxAge: '1h' }));

  app.get('/', (_req, res) => {
    res.json({
      name: 'FOTOIN API',
      tagline: 'Foto produk siap jualan, dari HP kamu.',
      version: '0.1.0',
      docs: '/api/v1/health',
    });
  });

  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp;
