/**
 * `local` image provider: the Python pipeline in pipeline/ (POST /cutout).
 *
 * It segments the product, color-corrects it and returns it as a transparent
 * PNG. Product pixels are cut out, never regenerated, so labels and colours stay
 * true. Runs on CPU with no paid API; start it with
 * `cd pipeline && .venv/bin/uvicorn fotoin.api:app --port 8000`.
 *
 * Errors are thrown with a Bahasa message for staff (they land in `lastError`
 * via the `failed` list); the pipeline URL is never put in them.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import config from '../../config/env.js';

const RETRY_DELAY_MS = 1000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failure = (message, extra) => Object.assign(new Error(message), extra);

const callOnce = async (form, { url, timeoutMs }, fetchImpl) => {
  let response;
  try {
    response = await fetchImpl(`${url}/cutout`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw failure(
      timedOut
        ? `Pipeline lokal tidak menjawab dalam ${timeoutMs} ms.`
        : 'Pipeline lokal tidak bisa dihubungi. Jalankan: cd pipeline && .venv/bin/uvicorn fotoin.api:app --port 8000',
      { code: timedOut ? 'timeout' : 'network', retryable: true },
    );
  }
  if (response.ok) return Buffer.from(await response.arrayBuffer());

  // The pipeline answers {"detail": {"code", "message"}} with a Bahasa message.
  const detail = (await response.json().catch(() => null))?.detail;
  throw failure(detail?.message || `Pipeline lokal gagal (HTTP ${response.status}).`, {
    code: detail?.code || `http-${response.status}`,
    retryable: response.status >= 500,
  });
};

/**
 * @param {{sourcePath: string}} request style, order and note are ignored: the cutout does not depend on them
 * @param {{settings?: object, fetchImpl?: typeof fetch, sleep?: Function}} [deps] injectable for tests
 * @returns {Promise<Buffer>} transparent PNG of the product, cropped to it
 */
export const generate = async (
  { sourcePath },
  { settings = config.generation, fetchImpl = fetch, sleep = wait } = {},
) => {
  const form = new FormData();
  form.append('file', new Blob([await fs.readFile(sourcePath)]), path.basename(sourcePath));

  try {
    return await callOnce(form, settings, fetchImpl);
  } catch (error) {
    // A bad photo (4xx) fails the same way twice; a busy or restarting pipeline may not.
    if (!error.retryable) throw error;
    await sleep(RETRY_DELAY_MS);
    return callOnce(form, settings, fetchImpl);
  }
};

export default { generate };
