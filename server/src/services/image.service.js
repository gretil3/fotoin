/**
 * Image generation + marketplace resizing.
 *
 * Two layers:
 *   - A *provider* turns a seller photo + a style's prompt into a styled image.
 *     `gemini` (providers/) edits the photo with an image model, once per style:
 *     the marketplace only decides the pixel size, not the scene, so one paid
 *     call serves every size of that style. `mock` is built in and needs no API
 *     key. It does NOT remove the original background: it places the whole
 *     photo, as a rectangle, on the style backdrop with a soft shadow. It exists
 *     to exercise the pipeline offline, not to make sellable images. `local`
 *     (providers/local.js) gets the product cut out by the Python pipeline and
 *     composites it the same way: real background removal, free, no key.
 *   - A *renderer* takes that styled image and emits one file per marketplace
 *     output spec (exact pixel dimensions, never cropping the scene).
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
import { buildOrderPrompts } from './prompt.service.js';
import { generateScene } from './providers/index.js';
import localProvider from './providers/local.js';

const JPEG = { quality: 88, chromaSubsampling: '4:4:4', mozjpeg: true };
// What an image model is sent: big enough to read a label, small enough to stay
// well inside request limits whatever a phone camera produced.
const SOURCE_MAX_PX = 1536;

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

// Shadow look, matched by eye to the Python pipeline (pipeline/fotoin/composite.py).
const CONTACT_OPACITY = 0.55; // tight dark line where a standing product meets the floor
const AMBIENT_OPACITY = 0.3; // wide soft pool around the base
const FLATLAY_OPACITY = 0.28; // whole silhouette, for a product photographed from above
const FLATLAY_OFFSET = 0.012; // fraction of canvas height, downward
const FLATLAY_BLUR = 0.012; // gaussian sigma, fraction of the short side

/**
 * Where a standing product touches the floor: the horizontal extent of the
 * bottom 4% of its silhouette. A tapered cup's base is narrower than its
 * bounding box, and a shadow sized to the box makes it look like it floats.
 */
const baseOf = async (lib, png) => {
  const { data, info } = await lib(png).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const solid = (x, y) => data[y * width + x] > 127;
  const rowHas = (y) => {
    for (let x = 0; x < width; x += 1) if (solid(x, y)) return true;
    return false;
  };
  let bottom = height - 1;
  while (bottom > 0 && !rowHas(bottom)) bottom -= 1;
  let top = 0;
  while (top < bottom && !rowHas(top)) top += 1;
  let minX = width;
  let maxX = 0;
  for (let y = bottom - Math.max(1, Math.round(0.04 * (bottom - top))); y <= bottom; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (solid(x, y)) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
  }
  if (minX > maxX) return { center: width / 2, half: width / 2, bottom };
  return { center: (minX + maxX) / 2, half: Math.max(2, (maxX - minX + 1) / 2), bottom };
};

/** Contact line + ambient pool under a product standing on a floor, as a full-canvas layer. */
const standingShadow = async (lib, product, { width, height, left, top }) => {
  const base = await baseOf(lib, product.data);
  const cx = left + base.center;
  const cy = top + base.bottom;
  // Vertical extent follows the base, capped so the pool fades out before the canvas edge.
  const s = Math.min(base.half, (height - cy) / 0.45);
  const ellipse = (id, rx, ry) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${Math.max(2, ry)}" fill="url(#${id})"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <radialGradient id="a"><stop offset="0%" stop-color="#000" stop-opacity="${AMBIENT_OPACITY}"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>
      <radialGradient id="c"><stop offset="0%" stop-color="#000" stop-opacity="${CONTACT_OPACITY}"/><stop offset="60%" stop-color="#000" stop-opacity="${CONTACT_OPACITY / 2}"/><stop offset="100%" stop-color="#000" stop-opacity="0"/></radialGradient>
    </defs>
    ${ellipse('a', base.half * 1.7, s * 0.22)}
    ${ellipse('c', base.half * 1.1, s * 0.08)}
  </svg>`;
  return { input: Buffer.from(svg), left: 0, top: 0 };
};

/** Soft shadow all around a product lying flat (photographed from above): its own silhouette, nudged down. */
const flatlayShadow = async (lib, product, { width, height, left, top }) => {
  const blur = Math.max(1, FLATLAY_BLUR * Math.min(width, height));
  const pad = Math.ceil(blur * 3);
  const silhouette = await lib(product.data)
    .linear([0, 0, 0, FLATLAY_OPACITY], [0, 0, 0, 0]) // black, faded; alpha keeps the shape
    .png()
    .toBuffer();
  const input = await lib(silhouette)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .blur(blur)
    .png()
    .toBuffer();
  return { input, left: left - pad, top: top - pad + Math.round(FLATLAY_OFFSET * height) };
};

/**
 * Compositing renderer (mock and local): style background + product, at exact size.
 * `input` is the seller photo (mock) or a transparent product cutout (local).
 * `angle` is the brief's answer: "atas" (flat lay) or "depan" (standing, default).
 * Returns { width, height, bytes, degraded }.
 */
const renderOutput = async ({ input, style, width, height, targetPath, angle = 'depan' }) => {
  const lib = await loadSharp();
  if (!lib) {
    await fs.writeFile(targetPath, input);
    const stat = await fs.stat(targetPath);
    return { width, height, bytes: stat.size, degraded: true };
  }

  // Product occupies ~74% of the frame: enough margin for marketplace UI chrome.
  const productBox = Math.round(Math.min(width, height) * 0.74);
  const product = await lib(input)
    .rotate() // honour EXIF orientation from phone cameras
    .resize(productBox, productBox, { fit: 'inside', withoutEnlargement: false })
    .ensureAlpha() // a mock photo is opaque: its "silhouette" is the whole rectangle
    .png()
    .toBuffer({ resolveWithObject: true });

  const place = {
    width,
    height,
    left: Math.round((width - product.info.width) / 2),
    top: Math.round((height - product.info.height) / 2),
  };
  const shadow = angle === 'atas' ? await flatlayShadow(lib, product, place) : await standingShadow(lib, product, place);

  await lib(Buffer.from(backgroundSvg(style, width, height)))
    .composite([shadow, { input: product.data, left: place.left, top: place.top }])
    .jpeg(JPEG)
    .toFile(targetPath);

  const stat = await fs.stat(targetPath);
  return { width, height, bytes: stat.size, degraded: false };
};

const MIME_BY_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** The seller photo as an image model should see it: upright, bounded, JPEG. */
const prepareSource = async (sourcePath) => {
  const lib = await loadSharp();
  if (!lib) {
    const mimeType = MIME_BY_EXT[path.extname(sourcePath).toLowerCase()] || 'image/jpeg';
    return { data: await fs.readFile(sourcePath), mimeType };
  }
  const data = await lib(sourcePath)
    .rotate() // models do not read EXIF: a phone photo would arrive sideways
    .resize(SOURCE_MAX_PX, SOURCE_MAX_PX, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();
  return { data, mimeType: 'image/jpeg' };
};

/**
 * Renders one marketplace output from a generated scene, at exact size.
 * Same shape as the scene (the 1:1 specs): scaled to fill. Other shapes (3:4,
 * 9:16): the whole scene, centered, its edge pixels stretched outward and blurred
 * to fill the frame, so the product is never cropped, there are no flat bars,
 * and the fill meets the scene in matching colors. On a white studio scene the
 * fill is white too.
 */
const renderScene = async ({ scene, width, height, targetPath }) => {
  const lib = await loadSharp();
  if (!lib) {
    await fs.writeFile(targetPath, scene);
    return { width, height, bytes: scene.length, degraded: true };
  }

  const meta = await lib(scene).metadata();
  const sameShape = Math.abs(meta.width / meta.height - width / height) < 0.02;

  let image;
  if (sameShape) {
    image = lib(scene).resize(width, height, { fit: 'cover' });
  } else {
    const fitted = await lib(scene).resize(width, height, { fit: 'inside' }).toBuffer({ resolveWithObject: true });
    const left = Math.floor((width - fitted.info.width) / 2);
    const top = Math.floor((height - fitted.info.height) / 2);
    const backdrop = await lib(fitted.data)
      .extend({
        top,
        bottom: height - fitted.info.height - top,
        left,
        right: width - fitted.info.width - left,
        extendWith: 'copy',
      })
      .blur(30)
      .toBuffer();
    image = lib(backdrop).composite([{ input: fitted.data, left, top }]);
  }

  await image.jpeg(JPEG).toFile(targetPath);
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
 * With a real provider, each style is generated once (one paid call) and every
 * marketplace size of that style is rendered from that scene. `generations`
 * records each call (provider, model, cost estimate, the exact prompt) so unit
 * economics and rejected images can be traced; it is staff-only data.
 *
 * @param {object} order
 * @param {(progress: {done: number, total: number}) => void} [onProgress]
 * @param {object} [deps] injectable for tests: `settings` (defaults to config.generation), `providers`, `sleep`
 * @returns {Promise<{results: Array, failed: Array<{filename: string, error: string}>, generations: Array}>}
 */
export const generateForOrder = async (order, onProgress, deps = {}) => {
  const settings = deps.settings || config.generation;
  if (COMPOSITED.has(settings.provider)) return generateComposited(order, onProgress, settings);

  const outDir = path.join(config.paths.results, order.id);
  await fs.mkdir(outDir, { recursive: true });

  const jobs = planJobs(order);
  const styleIds = [...new Set(jobs.map((job) => job.styleId))];
  // Checked before any call: a run either fits the ceiling or costs nothing.
  if (styleIds.length > settings.maxCallsPerRun) {
    throw new Error(
      `Pesanan butuh ${styleIds.length} panggilan AI, melebihi batas IMAGE_MAX_CALLS_PER_ORDER=${settings.maxCallsPerRun}.`,
    );
  }

  const prompts = new Map(buildOrderPrompts(order).map((prompt) => [prompt.styleId, prompt]));
  const generations = [];
  const scenes = new Map();

  // A failed style is cached as a rejection too, so its other sizes fail without a second paid call.
  const sceneFor = (styleId) => {
    if (!scenes.has(styleId)) {
      // Each style takes a different upload, so a seller's extra angles get used.
      const source = order.photos[order.styleIds.indexOf(styleId) % order.photos.length];
      const prompt = prompts.get(styleId);
      const pending = (async () => {
        const image = await prepareSource(path.join(config.paths.uploads, source.filename));
        const output = await generateScene({ prompt: prompt.text, image }, deps);
        const generation = {
          id: nanoid(10),
          styleId,
          sourcePhotoId: source.id,
          provider: output.provider,
          model: output.model,
          costUsd: output.costUsd,
          attempts: output.attempts,
          ms: output.ms,
          promptVersion: prompt.version,
          prompt: prompt.text,
          createdAt: new Date().toISOString(),
        };
        generations.push(generation);
        return { data: output.data, generation, source };
      })();
      scenes.set(styleId, pending);
    }
    return scenes.get(styleId);
  };

  const results = [];
  const failed = [];

  for (const [index, job] of jobs.entries()) {
    const filename = `${job.styleId}_${job.marketplaceId}_${job.spec.width}x${job.spec.height}_${nanoid(6)}.jpg`;
    try {
      const { data, generation, source } = await sceneFor(job.styleId);
      const meta = await renderScene({
        scene: data,
        width: job.spec.width,
        height: job.spec.height,
        targetPath: path.join(outDir, filename),
      });
      results.push(
        resultRecord(order, job, { filename, meta, source, provider: generation.provider, generationId: generation.id }),
      );
    } catch (error) {
      console.error(`[image] failed to render ${filename}:`, error.message);
      failed.push({ filename, error: error.message });
    }
    onProgress?.({ done: index + 1, total: jobs.length });
  }

  return { results, failed, generations };
};

/** The pack's planned outputs, with their catalog entries resolved. */
const planJobs = (order) =>
  planOutputs(order).map(({ styleId, marketplaceId, spec }) => ({
    style: getStyle(order.product.categoryId, styleId),
    styleId,
    marketplace: getMarketplace(marketplaceId),
    marketplaceId,
    spec,
  }));

const resultRecord = (order, job, { filename, meta, source, provider, generationId = null }) => ({
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
  provider,
  generationId,
  approved: null,
  reviewerNote: null,
  createdAt: new Date().toISOString(),
});

/** Providers whose output is composited here on the style backdrop, never sent to a paid model. */
const COMPOSITED = new Set(['mock', 'local']);

/**
 * The free path: every output composited locally, at its own size. `mock`
 * pastes the photo itself; `local` first has the Python pipeline cut the
 * product out, once per photo (the cutout does not depend on style or size).
 */
const generateComposited = async (order, onProgress, settings) => {
  const outDir = path.join(config.paths.results, order.id);
  await fs.mkdir(outDir, { recursive: true });

  const jobs = planJobs(order);

  // Cycle through the seller's uploads so every source photo gets used.
  const sources = order.photos;
  const results = [];
  const failed = [];

  const cutouts = new Map();
  const productImage = (sourcePath) => {
    if (settings.provider === 'mock') return fs.readFile(sourcePath);
    if (!cutouts.has(sourcePath)) {
      const pending = localProvider.generate({ sourcePath }, { settings });
      pending.catch(() => {}); // awaited per job below; avoid an unhandled rejection meanwhile
      cutouts.set(sourcePath, pending);
    }
    return cutouts.get(sourcePath);
  };

  if (settings.provider === 'mock' && config.generation.mockDelayMs > 0) {
    await sleep(config.generation.mockDelayMs);
  }

  for (const [index, job] of jobs.entries()) {
    const source = sources[index % sources.length];
    const filename = `${job.styleId}_${job.marketplaceId}_${job.spec.width}x${job.spec.height}_${nanoid(6)}.jpg`;

    try {
      const meta = await renderOutput({
        input: await productImage(path.join(config.paths.uploads, source.filename)),
        style: job.style,
        width: job.spec.width,
        height: job.spec.height,
        targetPath: path.join(outDir, filename),
        angle: order.brief?.answers?.angle,
      });
      results.push(resultRecord(order, job, { filename, meta, source, provider: settings.provider }));
    } catch (error) {
      console.error(`[image] failed to render ${filename}:`, error.message);
      failed.push({ filename, error: error.message });
    }

    onProgress?.({ done: index + 1, total: jobs.length });
  }

  return { results, failed, generations: [] };
};

/** Deletes every generated file for an order (used before a revision re-run). */
export const clearResults = async (orderId) => {
  await fs.rm(path.join(config.paths.results, orderId), { recursive: true, force: true });
};

export default { generateForOrder, clearResults };
