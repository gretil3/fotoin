/**
 * The real-provider image path: the Gemini adapter, the provider registry
 * (retry, failure messages) and generateForOrder with a fake provider.
 * Nothing here touches the network: providers and fetch are injected.
 */
import './setup.js'; // must stay first: isolates storage before config loads

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const { default: config } = await import('../src/config/env.js');
const { getStyle, PROMPT_TASK } = await import('../src/data/catalog.js');
const { generateForOrder } = await import('../src/services/image.service.js');
const { generateScene } = await import('../src/services/providers/index.js');
const { default: gemini, DEFAULT_MODEL, costUsd } = await import('../src/services/providers/gemini.js');

const KEY = 'secret-test-key';

/** A square "generated scene", as an image model would return it. */
const scenePng = () =>
  sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#e8e2d6' } }).png().toBuffer();

/** A provider that records what it is asked and answers with a fixed scene. */
const fakeProvider = ({ fail } = {}) => {
  const calls = [];
  return {
    calls,
    provider: {
      id: 'fake',
      defaultModel: 'fake-model',
      costUsd: () => 0.05,
      generate: async (request) => {
        calls.push(request);
        const error = fail?.(request);
        if (error) throw error;
        return { data: await scenePng(), mimeType: 'image/png' };
      },
    },
  };
};

const settingsFor = (overrides = {}) => ({
  provider: 'fake',
  apiKey: KEY,
  model: '',
  timeoutMs: 1000,
  maxCallsPerRun: 5,
  ...overrides,
});

const codedError = (code) => Object.assign(new Error(code), { code });

let photos;

before(async () => {
  await fs.mkdir(config.paths.uploads, { recursive: true });
  photos = [];
  for (const [index, color] of ['#c86b3a', '#3a6bc8'].entries()) {
    const filename = `test-photo-${index}.jpg`;
    const jpeg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: color } }).jpeg().toBuffer();
    await fs.writeFile(path.join(config.paths.uploads, filename), jpeg);
    photos.push({ id: `photo-${index}`, filename });
  }
});

/** Two styles x Shopee + TikTok Shop on the Standar pack: 8 outputs, 2 of them 3:4. */
const orderFor = (overrides = {}) => ({
  id: `order-${Math.random().toString(36).slice(2, 8)}`,
  packId: 'standar',
  product: { name: 'Rendang Frozen 500gr', categoryId: 'kuliner', notes: null },
  brief: { version: 1, answers: { productType: 'frozen-kemasan', goal: 'foto-utama', keep: ['label'], mood: [] }, usedText: false },
  styleIds: ['studio-putih', 'meja-kayu'],
  marketplaceIds: ['shopee', 'tiktok-shop'],
  photos,
  review: null,
  ...overrides,
});

describe('generateForOrder with a real provider (fake, no network)', () => {
  test('one paid call per style; every marketplace size is rendered from it, exactly', async () => {
    const { provider, calls } = fakeProvider();
    const order = orderFor();
    const { results, failed, generations } = await generateForOrder(order, null, {
      settings: settingsFor(),
      providers: { fake: provider },
    });

    assert.equal(failed.length, 0);
    assert.equal(calls.length, 2, 'two styles, two calls, whatever the number of sizes');
    assert.equal(results.length, 8);
    assert.equal(generations.length, 2);

    for (const result of results) {
      const meta = await sharp(path.join(config.paths.results, order.id, result.filename)).metadata();
      assert.deepEqual([meta.width, meta.height], [result.width, result.height], result.filename);
      assert.equal(meta.format, 'jpeg');
      const generation = generations.find((item) => item.id === result.generationId);
      assert.equal(generation?.styleId, result.styleId, 'each result points at its own style generation');
    }
    assert.ok(results.some((result) => result.width === 1080 && result.height === 1440), 'the 3:4 TikTok frame is included');

    // Each style takes a different upload, so the seller's second angle is used.
    assert.deepEqual(generations.map((item) => item.sourcePhotoId), ['photo-0', 'photo-1']);
    for (const generation of generations) {
      assert.equal(generation.provider, 'fake');
      assert.equal(generation.model, 'fake-model');
      assert.equal(generation.costUsd, 0.05);
      assert.ok(generation.prompt.includes(getStyle('kuliner', generation.styleId).prompt));
    }
  });

  test('the model gets the full layered prompt and an upright, bounded JPEG', async () => {
    const { provider, calls } = fakeProvider();
    await generateForOrder(orderFor({ styleIds: ['studio-putih'] }), null, {
      settings: settingsFor(),
      providers: { fake: provider },
    });

    const [request] = calls;
    assert.ok(request.prompt.startsWith('TASK'));
    assert.ok(request.prompt.includes(PROMPT_TASK));
    assert.ok(request.prompt.includes('Rendang Frozen 500gr'), 'the product name from the brief');
    assert.equal(request.apiKey, KEY);
    assert.equal(request.model, 'fake-model');
    assert.equal(request.image.mimeType, 'image/jpeg');
    const meta = await sharp(request.image.data).metadata();
    assert.deepEqual([meta.width, meta.height], [900, 1200]);
  });

  test("a rerun sends the reviewer's note, so it is not the rejected prompt again", async () => {
    const { provider, calls } = fakeProvider();
    const review = { decision: 'rejected', note: 'Latar terlalu gelap, label tidak terbaca' };
    await generateForOrder(orderFor({ styleIds: ['studio-putih'], review }), null, {
      settings: settingsFor(),
      providers: { fake: provider },
    });
    assert.match(calls[0].prompt, /RERUN FEEDBACK[\s\S]*Latar terlalu gelap, label tidak terbaca/);
  });

  test('over the spend ceiling, nothing is called and the run fails loudly', async () => {
    const { provider, calls } = fakeProvider();
    await assert.rejects(
      generateForOrder(orderFor(), null, { settings: settingsFor({ maxCallsPerRun: 1 }), providers: { fake: provider } }),
      /IMAGE_MAX_CALLS_PER_ORDER=1/,
    );
    assert.equal(calls.length, 0);
  });

  test('a failed style fails all its sizes with one call; the other style still renders', async () => {
    const wooden = getStyle('kuliner', 'meja-kayu').prompt;
    const { provider, calls } = fakeProvider({
      fail: (request) => (request.prompt.includes(wooden) ? codedError('no-image') : null),
    });
    const { results, failed, generations } = await generateForOrder(orderFor(), null, {
      settings: settingsFor(),
      providers: { fake: provider },
    });

    assert.equal(calls.length, 2, 'the failed style is not called again for its other sizes');
    assert.equal(results.length, 4);
    assert.ok(results.every((result) => result.styleId === 'studio-putih'));
    assert.equal(failed.length, 4);
    assert.ok(failed.every((item) => item.filename.startsWith('meja-kayu_') && /\[no-image\]/.test(item.error)));
    assert.equal(generations.length, 1, 'only successful calls are recorded as generations');
  });

  test('without a key, every image fails with a clear reason and nothing is called', async () => {
    const { provider, calls } = fakeProvider();
    const { results, failed } = await generateForOrder(orderFor({ styleIds: ['studio-putih'] }), null, {
      settings: settingsFor({ apiKey: '' }),
      providers: { fake: provider },
    });
    assert.equal(calls.length, 0);
    assert.equal(results.length, 0);
    assert.ok(failed.length > 0 && failed.every((item) => /IMAGE_PROVIDER_API_KEY/.test(item.error)));
  });
});

describe('generateScene: retry and failure messages', () => {
  const input = { prompt: 'PROMPT', image: { data: Buffer.from('x'), mimeType: 'image/jpeg' } };

  test('a busy service is retried once, after a pause', async () => {
    let attempt = 0;
    const sleeps = [];
    const { provider } = fakeProvider({ fail: () => (attempt++ === 0 ? codedError('http-503') : null) });
    const output = await generateScene(input, {
      settings: settingsFor(),
      providers: { fake: provider },
      sleep: async (ms) => sleeps.push(ms),
    });
    assert.equal(output.attempts, 2);
    assert.equal(sleeps.length, 1);
    assert.equal(output.provider, 'fake');
    assert.equal(output.costUsd, 0.05);
  });

  test('a request error is not retried; messages carry the code, never the key', async () => {
    for (const code of ['http-400', 'http-403', 'no-image', 'blocked']) {
      const { provider, calls } = fakeProvider({ fail: () => codedError(code) });
      await assert.rejects(
        generateScene(input, { settings: settingsFor(), providers: { fake: provider }, sleep: async () => {} }),
        (error) => {
          assert.equal(error.code, code);
          assert.ok(error.message.includes(`[${code}]`));
          assert.ok(!error.message.includes(KEY));
          return true;
        },
      );
      assert.equal(calls.length, 1, `${code} is not retried`);
    }
  });

  test('two timeouts in a row give up with the timeout code', async () => {
    const { provider, calls } = fakeProvider({ fail: () => codedError('timeout') });
    await assert.rejects(
      generateScene(input, { settings: settingsFor(), providers: { fake: provider }, sleep: async () => {} }),
      { code: 'timeout' },
    );
    assert.equal(calls.length, 2);
  });

  test('an unknown IMAGE_PROVIDER is refused by name', async () => {
    await assert.rejects(generateScene(input, { settings: settingsFor({ provider: 'openai' }) }), {
      code: 'unknown-provider',
      message: /openai/,
    });
  });
});

describe('gemini image adapter (fake fetch, no network)', () => {
  const request = {
    prompt: 'THE PROMPT',
    image: { data: Buffer.from('jpeg-bytes'), mimeType: 'image/jpeg' },
    apiKey: KEY,
    model: '',
    timeoutMs: 1000,
  };
  const replyWith = (status, body) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      if (body instanceof Error) throw body;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
          if (body === 'not json') throw new SyntaxError('Unexpected token');
          return body;
        },
      };
    };
    return { fetchImpl, calls };
  };
  const imagePart = (text, extra = {}) => ({ inlineData: { mimeType: 'image/png', data: Buffer.from(text).toString('base64') }, ...extra });
  const answer = (parts, finishReason = 'STOP') => ({ candidates: [{ content: { role: 'model', parts }, finishReason }] });

  test('sends the documented generateContent request, with the key in a header', async () => {
    const { fetchImpl, calls } = replyWith(200, answer([imagePart('png-bytes')]));
    const output = await gemini.generate(request, { fetchImpl });
    assert.equal(output.data.toString(), 'png-bytes');
    assert.equal(output.mimeType, 'image/png');

    const [{ url, init, body }] = calls;
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['x-goog-api-key'], KEY);
    assert.ok(!url.includes(KEY), 'the key never goes in the URL');
    const [photo, text] = body.contents[0].parts;
    assert.deepEqual(photo, { inlineData: { mimeType: 'image/jpeg', data: Buffer.from('jpeg-bytes').toString('base64') } });
    assert.deepEqual(text, { text: 'THE PROMPT' });
    assert.ok(body.generationConfig.responseModalities.includes('IMAGE'));
    assert.equal(body.generationConfig.imageConfig.aspectRatio, '1:1');
  });

  test('draft "thought" images and text parts are skipped; the last real image wins', async () => {
    const parts = [imagePart('draft', { thought: true }), { text: 'Here is your image' }, imagePart('first'), imagePart('final')];
    const { fetchImpl } = replyWith(200, answer(parts));
    assert.equal((await gemini.generate(request, { fetchImpl })).data.toString(), 'final');
  });

  test('every failure has a short code and never carries the key', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const cases = [
      [replyWith(400, { error: { status: 'INVALID_ARGUMENT' } }), 'http-400', /INVALID_ARGUMENT/],
      [replyWith(429, 'not json'), 'http-429', /429/],
      [replyWith(200, { promptFeedback: { blockReason: 'SAFETY' } }), 'blocked', /SAFETY/],
      [replyWith(200, answer([{ text: 'I cannot edit this image.' }], 'IMAGE_SAFETY')), 'no-image', /IMAGE_SAFETY/],
      [replyWith(200, { candidates: [] }), 'no-image', /no candidate/],
      [replyWith(200, 'not json'), 'invalid-json', /invalid-json/],
      [replyWith(0, timeout), 'timeout', /timeout/],
      [replyWith(0, new TypeError('fetch failed')), 'network', /network/],
    ];
    for (const [{ fetchImpl }, code, message] of cases) {
      await assert.rejects(gemini.generate(request, { fetchImpl }), (error) => {
        assert.equal(error.code, code);
        assert.match(error.message, message);
        assert.ok(!error.message.includes(KEY));
        return true;
      });
    }
  });

  test('cost estimates exist for the documented models only', () => {
    assert.equal(costUsd(DEFAULT_MODEL), 0.067);
    assert.equal(costUsd('some-future-model'), null);
  });
});
