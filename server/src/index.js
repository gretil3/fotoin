import config from './config/env.js';
import { createApp } from './app.js';
import { flush } from './data/store.js';
import { recoverInterruptedJobs } from './services/pipeline.service.js';

const app = createApp();

const server = app.listen(config.port, () => {
  console.log('');
  console.log('  FOTOIN API');
  console.log(`  ${'-'.repeat(46)}`);
  console.log(`  URL           http://localhost:${config.port}`);
  console.log(`  Health        http://localhost:${config.port}/api/v1/health`);
  console.log(`  Env           ${config.env}`);
  console.log(`  AI provider   ${config.generation.provider}`);
  console.log(`  Human review  ${config.review.required ? 'ON (required)' : 'OFF (auto-deliver)'}`);
  console.log(`  WhatsApp      ${config.whatsapp.enabled ? 'live' : 'dry-run (logged only)'}`);
  console.log(`  Payments      ${config.payment.provider}`);
  console.log('');

  // The queue is in memory; the orders are not. Pick up anything a restart interrupted.
  const recovered = recoverInterruptedJobs();
  if (recovered > 0) console.log(`  Recovered ${recovered} interrupted order(s) back into the queue.\n`);
});

const shutdown = (signal) => {
  console.log(`\n[${signal}] shutting down...`);
  flush();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

export default server;
