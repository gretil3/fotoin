/**
 * Image providers, chosen by IMAGE_PROVIDER. Each one implements
 *
 *   generate({ sourcePath, style, order, note }) -> Promise<Buffer>
 *
 * and returns an image (a transparent PNG cutout, or an opaque picture) that
 * renderOutput() in image.service.js places on the style background at the
 * exact marketplace size. `note` is the reviewer's rejection note on a rerun.
 *
 *   mock    hands the seller photo back untouched: it ends up pasted as a
 *           rectangle. Exercises the flow; output is not sellable. Default.
 *   local   the Python pipeline in pipeline/ cuts the product out (local.js)
 */
import fs from 'node:fs/promises';
import local from './local.js';

const mock = { generate: ({ sourcePath }) => fs.readFile(sourcePath) };

export const PROVIDERS = { mock, local };

export default PROVIDERS;
