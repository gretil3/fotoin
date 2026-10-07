import './setup.js'; // must stay first: isolates storage before config loads

import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const { renderOutput } = await import('../src/services/image.service.js');
const { getStyle } = await import('../src/data/catalog.js');

// A small transparent cutout: a gray square in the middle, nothing around it.
const cutout = await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
  .composite([{ input: { create: { width: 30, height: 30, channels: 4, background: '#808080' } }, left: 35, top: 35 }])
  .png()
  .toBuffer();

const render = async (styleId) => {
  const targetPath = path.join(os.tmpdir(), `fotoin-studio-${process.pid}-${styleId}.jpg`);
  await renderOutput({ input: cutout, style: getStyle('kuliner', styleId), width: 400, height: 400, targetPath });
  const { data } = await sharp(targetPath).greyscale().raw().toBuffer({ resolveWithObject: true });
  return (x, y) => data[y * 400 + x];
};

test('a gradient style is lit like a studio: bright behind the product, dark in the corners', async () => {
  for (const id of ['lifestyle-kafe', 'promo-kontras']) {
    const lum = await render(id);
    // Wall above and floor below the product, each against both corners of the same row.
    for (const [y, cy] of [[12, 5], [388, 395]]) {
      for (const cx of [5, 395]) {
        assert.ok(lum(200, y) > lum(cx, cy) + 15, `${id}: center ${lum(200, y)} vs corner ${lum(cx, cy)}`);
      }
    }
  }
});

test('studio-putih stays pure white for the marketplace main image', async () => {
  const lum = await render('studio-putih');
  assert.ok(lum(5, 5) >= 254 && lum(395, 5) >= 254, `corners ${lum(5, 5)}, ${lum(395, 5)}`);
});
