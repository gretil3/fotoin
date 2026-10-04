/**
 * Runs the image provider chosen by IMAGE_PROVIDER.
 *
 *   mock     built in, offline, free (default): image.service.js composites the
 *            photo locally and never calls this module
 *   gemini   a Gemini image model edits the photo into the style's scene
 *
 * generateScene() turns one seller photo + one prompt into one styled image.
 * Unlike the refiner it does throw: an image that could not be made must show
 * up in `failed` (and, if nothing rendered, as a `gagal` order), never be
 * replaced by something the seller did not pay for. Error messages are short,
 * in Indonesian, staff-only (they end up in `lastError`), and never carry the
 * API key or a provider URL.
 */
import config from '../../config/env.js';
import gemini from './gemini.js';

export const PROVIDERS = { gemini };

// Worth one more try: the service was busy or briefly unreachable.
const RETRYABLE = new Set(['timeout', 'network', 'http-429', 'http-500', 'http-502', 'http-503', 'http-504']);
const RETRY_DELAY_MS = 2000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failure = (code, message) => Object.assign(new Error(message), { code });

const REASONS = {
  timeout: 'tidak menjawab tepat waktu',
  network: 'tidak bisa dihubungi',
  'http-400': 'permintaan ditolak',
  'http-401': 'API key ditolak',
  'http-403': 'API key ditolak atau billing belum aktif',
  'http-404': 'model tidak ditemukan, cek IMAGE_PROVIDER_MODEL',
  'http-429': 'kuota atau batas permintaan habis',
  blocked: 'prompt diblokir filter keamanan',
  'no-image': 'tidak menghasilkan gambar',
};

/** "Gemini tidak menjawab tepat waktu [timeout]: <adapter detail>" */
const describe = (providerId, error) => {
  const code = error?.code || 'error';
  const reason = REASONS[code] || (code.startsWith('http-5') ? 'sedang bermasalah' : 'gagal');
  const detail = error?.message && error.message !== code ? `: ${error.message}` : '';
  const name = providerId.charAt(0).toUpperCase() + providerId.slice(1);
  return failure(code, `${name} ${reason} [${code}]${detail}`);
};

/** True when IMAGE_PROVIDER is the local compositor and no network provider is involved. */
export const isMock = (settings = config.generation) => settings.provider === 'mock';

/**
 * @param {{prompt: string, image: {data: Buffer, mimeType: string}}} input
 * @param {object} [deps] injectable for tests: `settings` (defaults to config.generation), `providers`, `sleep`
 * @returns {Promise<{data: Buffer, mimeType: string, provider: string, model: string, costUsd: number|null, attempts: number, ms: number}>}
 */
export const generateScene = async (
  { prompt, image },
  { settings = config.generation, providers = PROVIDERS, sleep = wait } = {},
) => {
  const provider = providers[settings.provider];
  if (!provider) {
    throw failure('unknown-provider', `IMAGE_PROVIDER "${settings.provider}" tidak dikenal. Pilih mock atau gemini.`);
  }
  if (!settings.apiKey) {
    throw failure('no-key', `IMAGE_PROVIDER=${settings.provider} tetapi IMAGE_PROVIDER_API_KEY masih kosong.`);
  }

  const model = settings.model || provider.defaultModel;
  const request = { prompt, image, apiKey: settings.apiKey, model, timeoutMs: settings.timeoutMs };
  const started = Date.now();

  let attempts = 1;
  let output;
  try {
    output = await provider.generate(request);
  } catch (error) {
    if (!RETRYABLE.has(error?.code)) throw describe(provider.id, error);
    console.warn(`[image] ${provider.id} ${error.code}, retrying once in ${RETRY_DELAY_MS}ms`);
    await sleep(RETRY_DELAY_MS);
    attempts = 2;
    try {
      output = await provider.generate(request);
    } catch (again) {
      throw describe(provider.id, again);
    }
  }

  return {
    ...output,
    provider: provider.id,
    model,
    // Billed per attempt that returned an image; a failed attempt is not charged.
    costUsd: provider.costUsd?.(model) ?? null,
    attempts,
    ms: Date.now() - started,
  };
};

export default { PROVIDERS, generateScene, isMock };
