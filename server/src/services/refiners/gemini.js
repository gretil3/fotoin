/**
 * Gemini adapter for the seller-text refiner.
 *
 * Calls the documented REST endpoint with Node's built-in fetch, so the server
 * gains no SDK dependency. Request and response shapes follow
 * https://ai.google.dev/api/generate-content (checked 2026-09-29).
 *
 * The adapter only moves bytes: what the model is asked lives in
 * refine.service.js (REFINER_INSTRUCTIONS), and the answer is checked there too.
 * Every failure is thrown as an Error with a short `code` (e.g. "timeout",
 * "http-429"); refiners/index.js falls back to the rules on any of them.
 */

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

// Google's recommended model for new projects (2026-09): stable, and on the free
// tier. Free-tier inputs may be used by Google to improve its products and read
// by human reviewers, so real sellers' notes belong on a paid key.
export const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

const string = (description) => ({ type: 'STRING', description });
const strings = (description) => ({ type: 'ARRAY', items: { type: 'STRING' }, description });

// Gemini's structured-output schema (OpenAPI style, uppercase types). It makes a
// well-formed answer very likely; refine.service.js still validates it.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    description: string('One or two English sentences about the product itself, or an empty string.'),
    keep: strings('What the seller wants unchanged on the product.'),
    avoid: strings('What the seller does not want in the picture.'),
    hints: strings('Wishes about the scene, mood, lighting or viewpoint.'),
    labelText: strings('Exact words the seller says are printed on the product.'),
    dropped: {
      type: 'ARRAY',
      description: 'Requests FOTOIN never carries out.',
      items: {
        type: 'OBJECT',
        properties: {
          text: string("The seller's words."),
          reason: { type: 'STRING', enum: ['adds-text', 'adds-people', 'changes-product', 'instruction'] },
        },
        required: ['text', 'reason'],
      },
    },
  },
  required: ['description', 'keep', 'avoid', 'hints', 'labelText', 'dropped'],
};

const failure = (code, message = code) => Object.assign(new Error(message), { code });

const isTimeout = (error) => error?.name === 'TimeoutError' || error?.name === 'AbortError';

/**
 * @param {{instructions: string, input: string, apiKey: string, model: string, timeoutMs: number}} request
 * @param {{fetchImpl?: typeof fetch}} [deps] injectable for tests, which never touch the network
 * @returns {Promise<unknown>} the model's JSON answer, parsed but not yet validated
 */
export const refine = async ({ instructions, input, apiKey, model, timeoutMs }, { fetchImpl = fetch } = {}) => {
  const name = String(model || DEFAULT_MODEL).replace(/^models\//, '');
  const signal = AbortSignal.timeout(timeoutMs);

  let response;
  try {
    response = await fetchImpl(`${API_ROOT}/${encodeURIComponent(name)}:generateContent`, {
      method: 'POST',
      // The key travels in a header, never in the URL, so it cannot land in a log line.
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: instructions }] },
        contents: [{ role: 'user', parts: [{ text: input }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0,
          maxOutputTokens: 2048,
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

  const parts = data?.candidates?.[0]?.content?.parts || [];
  const answer = parts
    .filter((part) => typeof part?.text === 'string' && !part.thought)
    .map((part) => part.text)
    .join('')
    .trim();
  if (!answer) throw failure('empty', `Gemini returned no text (${data?.candidates?.[0]?.finishReason || 'no candidate'})`);

  try {
    return JSON.parse(answer);
  } catch {
    throw failure('invalid-json');
  }
};

export default { id: 'gemini', defaultModel: DEFAULT_MODEL, refine };
