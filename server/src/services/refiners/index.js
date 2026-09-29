/**
 * Runs the seller-text refiner chosen by REFINER_PROVIDER.
 *
 *   rules    built in, offline, free (default)
 *   gemini   an AI model also reads the seller's own words (refiners/gemini.js)
 *
 * refineOrder() never throws and never blocks an order. No key, a timeout, an
 * outage or an answer that fails the checks in refine.service.js all fall back
 * to the rules, and the reason is recorded on the result for staff. The API key
 * is never written to the result or to a log line.
 */
import config from '../../config/env.js';
import { REFINER_INSTRUCTIONS, acceptAiRefinement, refineWithRules, refinerInput } from '../refine.service.js';
import gemini from './gemini.js';

export const PROVIDERS = { gemini };

// Worth one more try: the service was busy or briefly unreachable.
const RETRYABLE = new Set(['timeout', 'network', 'http-429', 'http-500', 'http-502', 'http-503', 'http-504']);
const RETRY_DELAY_MS = 800;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} order
 * @param {object} [deps] injectable for tests: `settings` (defaults to config.refiner), `providers`, `sleep`
 * @returns {Promise<object>} a refinement (see refine.service.js) with `createdAt`
 */
export const refineOrder = async (
  order,
  { settings = config.refiner, providers = PROVIDERS, sleep = wait } = {},
) => {
  const rules = refineWithRules(order);
  const done = (refinement, fallbackReason = null, detail = null) => {
    // "no-text" is not a problem: the seller simply wrote nothing to read.
    if (fallbackReason && fallbackReason !== 'no-text') {
      const extra = detail && detail !== fallbackReason ? ` (${detail})` : '';
      console.warn(`[refiner] ${settings.provider} not used for order ${order.id}: ${fallbackReason}${extra}`);
    }
    return { ...refinement, fallbackReason, createdAt: new Date().toISOString() };
  };

  if (settings.provider === 'rules') return done(rules);
  const provider = providers[settings.provider];
  if (!provider) return done(rules, 'unknown-provider');
  // Nothing left to read (no note, or all of it was screened out): no call, no cost.
  if (!rules.description) return done(rules, 'no-text');
  if (!settings.apiKey) return done(rules, 'no-key');

  const model = settings.model || provider.defaultModel;
  const request = {
    instructions: REFINER_INSTRUCTIONS,
    input: refinerInput(order, rules),
    apiKey: settings.apiKey,
    model,
    timeoutMs: settings.timeoutMs,
  };

  let raw;
  try {
    raw = await provider.refine(request);
  } catch (error) {
    if (!RETRYABLE.has(error?.code)) return done(rules, error?.code || 'error', error?.message);
    await sleep(RETRY_DELAY_MS);
    try {
      raw = await provider.refine(request);
    } catch (again) {
      return done(rules, again?.code || 'error', again?.message);
    }
  }

  const verdict = acceptAiRefinement(order, raw, { provider: settings.provider, model });
  if (verdict.rejected) return done(rules, verdict.rejected);
  return done(verdict.refinement);
};

export default { refineOrder, PROVIDERS };
