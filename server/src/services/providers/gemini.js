/**
 * Gemini adapter for the image step.
 *
 * Calls the documented REST endpoint with Node's built-in fetch, so the server
 * gains no SDK dependency. Request and response shapes follow
 * https://ai.google.dev/api/generate-content and
 * https://ai.google.dev/gemini-api/docs/image-generation (checked 2026-10-04).
 *
 * The adapter only moves bytes: the prompt is built in prompt.service.js, and
 * sizing to marketplace specs happens in image.service.js. Every failure is
 * thrown as an Error with a short `code` (e.g. "timeout", "http-429",
 * "no-image"); providers/index.js decides whether it is worth a retry.
 */

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Google's recommended image model (2026-10). The Lite variant is half the price
// but weaker at keeping label text intact, which matters more than cost here.
export const DEFAULT_MODEL = 'gemini-3.1-flash-image';

// USD per output image at the default 1K size, from ai.google.dev/gemini-api/docs/pricing
// (checked 2026-10-04). Input tokens for one photo plus a prompt cost well under
// $0.001 and are left out. An unknown model gets no estimate rather than a wrong one.
export const PRICE_PER_IMAGE_USD = {
  'gemini-3.1-flash-image': 0.067,
  'gemini-3.1-flash-lite-image': 0.0336,
  'gemini-3-pro-image': 0.134,
};

export const costUsd = (model) => PRICE_PER_IMAGE_USD[model] ?? null;

const failure = (code, message = code) => Object.assign(new Error(message), { code });

const isTimeout = (error) => error?.name === 'TimeoutError' || error?.name === 'AbortError';

// REST answers in camelCase; snake_case is accepted defensively since both are documented.
const imageOf = (part) => part?.inlineData || part?.inline_data || null;

/**
 * @param {{
 *   prompt: string,
 *   image: {data: Buffer, mimeType: string},
 *   apiKey: string,
 *   model: string,
 *   timeoutMs: number,
 *   aspectRatio?: string,
 * }} request
 * @param {{fetchImpl?: typeof fetch}} [deps] injectable for tests, which never touch the network
 * @returns {Promise<{data: Buffer, mimeType: string}>} the generated image
 */
export const generate = async (
  { prompt, image, apiKey, model, timeoutMs, aspectRatio = '1:1' },
  { fetchImpl = fetch } = {},
) => {
  const name = String(model || DEFAULT_MODEL).replace(/^models\//, '');
  const signal = AbortSignal.timeout(timeoutMs);

  let response;
  try {
    response = await fetchImpl(`${API_ROOT}/${encodeURIComponent(name)}:generateContent`, {
      method: 'POST',
      // The key travels in a header, never in the URL, so it cannot land in a log line.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            // The photo first, then the prompt that refers to it as "the attached photo".
            parts: [{ inlineData: { mimeType: image.mimeType, data: image.data.toString('base64') } }, { text: prompt }],
          },
        ],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: { aspectRatio },
        },
      }),
      signal,
    });
  } catch (error) {
    throw failure(isTimeout(error) ? 'timeout' : 'network');
  }

  if (!response.ok) {
    // Google's error status (e.g. INVALID_ARGUMENT) helps staff debug and never contains the key.
    const detail = await response.json().catch(() => null);
    const status = typeof detail?.error?.status === 'string' ? ` ${detail.error.status}` : '';
    throw failure(`http-${response.status}`, `Gemini HTTP ${response.status}${status}`);
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw failure(isTimeout(error) ? 'timeout' : 'invalid-json');
  }

  if (data?.promptFeedback?.blockReason) throw failure('blocked', `Gemini blocked: ${data.promptFeedback.blockReason}`);

  // Thinking models may return draft images marked `thought`; the answer is the last real one.
  const candidate = data?.candidates?.[0];
  const images = (candidate?.content?.parts || []).filter((part) => !part?.thought && imageOf(part)?.data);
  const last = imageOf(images.at(-1));
  if (!last) {
    // IMAGE_SAFETY, IMAGE_PROHIBITED_CONTENT, NO_IMAGE... tell staff which one.
    throw failure('no-image', `Gemini returned no image (${candidate?.finishReason || 'no candidate'})`);
  }

  return {
    data: Buffer.from(last.data, 'base64'),
    mimeType: last.mimeType || last.mime_type || 'image/png',
  };
};

export default { id: 'gemini', defaultModel: DEFAULT_MODEL, costUsd, generate };
