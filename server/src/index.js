import config from './config/env.js';
import { createApp } from './app.js';
import { flush } from './data/store.js';
import { recoverInterruptedJobs } from './services/pipeline.service.js';
import { PROVIDERS } from './services/providers/index.js';

const app = createApp();

/** "gemini (gemini-3.1-flash-image)", with a warning a misconfigured demo would otherwise hide until the first order. */
const describeImageProvider = () => {
  const { provider: name, model, apiKey } = config.generation;
  if (name === 'mock') return 'mock (local compositor, no AI)';
  const provider = PROVIDERS[name];
  if (!provider) return `${name}  !! unknown, every order will fail (use mock or gemini)`;
  const label = `${name} (${model || provider.defaultModel})`;
  return apiKey ? label : `${label}  !! IMAGE_PROVIDER_API_KEY is empty, every order will fail`;
};

const server = app.listen(config.port, () => {
  console.log('');
  console.log('  FOTOIN API');
  console.log(`  ${'-'.repeat(46)}`);
  console.log(`  URL           http://localhost:${config.port}`);
  console.log(`  Health        http://localhost:${config.port}/api/v1/health`);
  console.log(`  Env           ${config.env}`);
  console.log(`  AI provider   ${describeImageProvider()}`);
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
