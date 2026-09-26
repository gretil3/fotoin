/**
 * Image generation + marketplace resizing.
 *
 * Two layers:
 *   - A *provider* turns a seller photo + a style preset into a styled image.
 *     `mock` is built in and needs no API key. It does NOT remove the original
 *     background: it places the whole photo, as a rectangle, on the style
 *     backdrop with a soft shadow. It exists to exercise the pipeline, sizing and
 *     review flow, not to make sellable images. A real background-removal or
 *     image-edit model must implement the `generate({ sourcePath, style, order })`
 *     contract before any seller sees output.
 *   - A *renderer* takes that styled image and emits one file per marketplace
 *     output spec (exact pixel dimensions, padded not cropped).
 *
 * sharp is optional at runtime: if the native binary is unavailable the
 * pipeline degrades to copying the source file so the app still runs end to
 * end (useful in class demos on locked-down machines).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import config from '../config/env.js';
import { getMarketplace, getStyle } from '../data/catalog.js';
import { planOutputs } from './order.service.js';

let sharp = null;
let sharpChecked = false;

const loadSharp = async () => {
  if (sharpChecked) return sharp;
  sharpChecked = true;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch (error) {
    console.warn('[image] sharp unavailable, falling back to passthrough:', error.message);
    sharp = null;
  }
  return sharp;
};

/** Builds an SVG backdrop for a style preset (solid or vertical gradient). */
const backgroundSvg = (style, width, height) => {
  const colors = style?.background?.colors || ['#ffffff'];
  if (style?.background?.type === 'gradient' && colors.length > 1) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stop-color="${colors[0]}"/>
          <stop offset="100%" stop-color="${colors[1]}"/>
        </linearGradient>
        <radialGradient id="glow" cx="50%" cy="38%" r="62%">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <rect width="${width}" height="${height}" fill="url(#glow)"/>
    </svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${colors[0]}"/>
  </svg>`;
};

/** Elliptical contact shadow under the product, so it does not look pasted. */
const shadowSvg = (width, height) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <radialGradient id="s" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.30"/>
      <stop offset="70%" stop-color="#000000" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}" fill="url(#s)"/>
</svg>`;

/**
 * Renders one marketplace output: style background + product, at exact size.
 * Returns { width, height, bytes, filePath }.
 */
const renderOutput = async ({ sourcePath, style, width, height, targetPath }) => {
  const lib = await loadSharp();
  if (!lib) {
    await fs.copyFile(sourcePath, targetPath);
    const stat = await fs.stat(targetPath);
    return { width, height, bytes: stat.size, degraded: true };
  }

  // Product occupies ~74% of the frame: enough margin for marketplace UI chrome.
  const productBox = Math.round(Math.min(width, height) * 0.74);
  const product = await lib(sourcePath)
    .rotate() // honour EXIF orientation from phone cameras
    .resize(productBox, productBox, { fit: 'inside', withoutEnlargement: false })
    .toBuffer({ resolveWithObject: true });

  const productWidth = product.info.width;
  const productHeight = product.info.height;
  const left = Math.round((width - productWidth) / 2);
  const top = Math.round((height - productHeight) / 2);

  const shadowWidth = Math.round(productWidth * 1.05);
  const shadowHeight = Math.round(productHeight * 0.16);

  await lib(Buffer.from(backgroundSvg(style, width, height)))
    .composite([
      {
        input: Buffer.from(shadowSvg(shadowWidth, shadowHeight)),
        left: Math.round((width - shadowWidth) / 2),
        top: Math.min(height - shadowHeight, top + productHeight - Math.round(shadowHeight * 0.45)),
      },
      { input: product.data, left, top },
    ])
    .jpeg({ quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true })
    .toFile(targetPath);

  const stat = await fs.stat(targetPath);
  return { width, height, bytes: stat.size, degraded: false };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Confirms a stored upload is a decodable image and returns its dimensions.
 * Returns null when sharp is unavailable (degraded mode), so callers skip the
 * check rather than reject every upload. Throws when the file is not an image
 * or is a format sharp cannot read (notably HEIC): a spoofed Content-Type
 * passes multer's filter, this is the check that catches it.
 */
export const inspectImage = async (filePath) => {
  const lib = await loadSharp();
  if (!lib) return null;
  const meta = await lib(filePath).metadata();
  return { width: meta.width, height: meta.height, format: meta.format };
};

/**
 * Generates every result image for an order.
 *
 * Which images are produced is decided by planOutputs(), so the pack's
 * photoCount is honoured. A render that fails does not abort the batch; it is
 * reported in `failed` so the pipeline can decide whether what remains is
 * shippable.
 *
 * @param {object} order
 * @param {(progress: {done: number, total: number}) => void} [onProgress]
 * @returns {Promise<{results: Array, failed: Array<{filename: string, error: string}>}>}
 */
export const generateForOrder = async (order, onProgress) => {
  const outDir = path.join(config.paths.results, order.id);
  await fs.mkdir(outDir, { recursive: true });

  const jobs = planOutputs(order).map(({ styleId, marketplaceId, spec }) => ({
    style: getStyle(order.product.categoryId, styleId),
    styleId,
    marketplace: getMarketplace(marketplaceId),
    marketplaceId,
    spec,
  }));

  // Cycle through the seller's uploads so every source photo gets used.
  const sources = order.photos;
  const results = [];
  const failed = [];

  if (config.generation.provider === 'mock' && config.generation.mockDelayMs > 0) {
    await sleep(config.generation.mockDelayMs);
  }

  for (const [index, job] of jobs.entries()) {
    const source = sources[index % sources.length];
    const sourcePath = path.join(config.paths.uploads, source.filename);
    const filename = `${job.styleId}_${job.marketplaceId}_${job.spec.width}x${job.spec.height}_${nanoid(6)}.jpg`;
    const targetPath = path.join(outDir, filename);

    try {
      const meta = await renderOutput({
        sourcePath,
        style: job.style,
        width: job.spec.width,
        height: job.spec.height,
        targetPath,
      });

      results.push({
        id: nanoid(10),
        filename,
        url: `${config.publicUrl}/static/results/${order.id}/${filename}`,
        sourcePhotoId: source.id,
        styleId: job.styleId,
        styleName: job.style?.name || job.styleId,
        marketplaceId: job.marketplaceId,
        marketplaceName: job.marketplace.name,
        label: job.spec.label,
        width: meta.width,
        height: meta.height,
        bytes: meta.bytes,
        degraded: meta.degraded,
        approved: null,
        reviewerNote: null,
        createdAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`[image] failed to render ${filename}:`, error.message);
      failed.push({ filename, error: error.message });
    }

    onProgress?.({ done: index + 1, total: jobs.length });
  }

  return { results, failed };
};

/** Deletes every generated file for an order (used before a revision re-run). */
export const clearResults = async (orderId) => {
  await fs.rm(path.join(config.paths.results, orderId), { recursive: true, force: true });
};

export default { generateForOrder, clearResults };
