import './setup.js'; // must stay first: isolates storage before config loads

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const { generate } = await import('../src/services/providers/local.js');

const settings = { url: 'http://pipeline.test', timeoutMs: 1000 };
const sourcePath = path.join(os.tmpdir(), `fotoin-local-${process.pid}.jpg`);
await fs.writeFile(sourcePath, Buffer.from('fake jpeg'));

/** A fetch that answers from a list, one response (or thrown error) per call. */
const fakeFetch = (...answers) => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const answer = answers[calls.length - 1];
    if (answer instanceof Error) throw answer;
    return answer();
  };
  return { fetchImpl, calls };
};

const png = Buffer.from('png bytes');
const ok = () => new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
const problem = (status, detail) => () => Response.json({ detail }, { status });
const noSleep = async () => {};

test('local provider posts the photo to /cutout and returns the PNG', async () => {
  const { fetchImpl, calls } = fakeFetch(ok);
  const out = await generate({ sourcePath }, { settings, fetchImpl, sleep: noSleep });
  assert.deepEqual(out, png);
  assert.equal(calls[0].url, 'http://pipeline.test/cutout');
  assert.equal(await calls[0].options.body.get('file').text(), 'fake jpeg');
});

test('a photo with no product fails at once with the pipeline message', async () => {
  const message = 'Produk tidak terdeteksi. Coba foto ulang dengan latar polos.';
  const { fetchImpl, calls } = fakeFetch(problem(422, { code: 'PRODUK_TIDAK_TERDETEKSI', message }));
  await assert.rejects(generate({ sourcePath }, { settings, fetchImpl, sleep: noSleep }), {
    message,
    code: 'PRODUK_TIDAK_TERDETEKSI',
  });
  assert.equal(calls.length, 1);
});

test('an unreachable pipeline is retried once, then succeeds', async () => {
  const { fetchImpl, calls } = fakeFetch(new TypeError('fetch failed'), ok);
  assert.deepEqual(await generate({ sourcePath }, { settings, fetchImpl, sleep: noSleep }), png);
  assert.equal(calls.length, 2);
});

test('a pipeline that keeps failing gives up after one retry, without leaking its URL', async () => {
  const { fetchImpl, calls } = fakeFetch(new TypeError('fetch failed'), new TypeError('fetch failed'));
  await assert.rejects(generate({ sourcePath }, { settings, fetchImpl, sleep: noSleep }), (error) => {
    assert.equal(error.code, 'network');
    assert.ok(!error.message.includes('pipeline.test'));
    return true;
  });
  assert.equal(calls.length, 2);
});
