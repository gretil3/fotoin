import fs from 'node:fs/promises';
import Replicate from 'replicate';
import config from '../../config/env.js';
import { ApiError } from '../../utils/api-error.js';

let replicateClient = null;

const getClient = () => {
  if (!replicateClient) {
    if (!config.generation.apiKey) {
      throw new ApiError(500, 'Replicate API key is missing. Please set IMAGE_PROVIDER_API_KEY in .env');
    }
    replicateClient = new Replicate({
      auth: config.generation.apiKey,
    });
  }
  return replicateClient;
};

/**
 * Generates an image using Replicate.
 * Uses a product photography model to remove the background and place it in a new scene.
 *
 * @param {Object} params
 * @param {string} params.sourcePath - Path to the original seller photo.
 * @param {Object} params.style - Style preset from the catalog.
 * @param {string} params.targetPath - Where to save the output.
 * @param {number} params.width - Target width.
 * @param {number} params.height - Target height.
 * @returns {Promise<{width: number, height: number, bytes: number, degraded: boolean}>}
 */
export const generateImage = async ({ sourcePath, style, targetPath, width, height }) => {
  const replicate = getClient();
  const fileData = await fs.readFile(sourcePath);
  
  // Example using a common Replicate model for product photography / background replacement.
  // Note: For production, you might want to use a specific model tailored to your needs
  // like 'cjwbw/rembg' for background removal followed by a stable diffusion inpainting model.
  // Here we use a generic placeholder model structure that accepts an image and a prompt.
  
  const base64Image = `data:image/jpeg;base64,${fileData.toString('base64')}`;
  
  // The model string can be configured in env, falling back to a known product AI model
  const modelId = config.generation.model || "catio-apps/photo-background-generation:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003";

  try {
    const output = await replicate.run(modelId, {
      input: {
        image: base64Image,
        prompt: style.prompt || `Professional product photography of this item, ${style.name} background, studio lighting, high resolution`,
        negative_prompt: "low quality, distorted, bad shadows, messy, busy background",
        num_inference_steps: 20,
        guidance_scale: 7.5
      }
    });

    // Replicate returns a URL to the generated image
    let imageUrl = '';
    if (Array.isArray(output) && output.length > 0) {
      imageUrl = output[0];
    } else if (typeof output === 'string') {
      imageUrl = output;
    } else {
      throw new Error("Unexpected output format from Replicate");
    }

    // Download the result
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download generated image: ${response.statusText}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(targetPath, Buffer.from(arrayBuffer));

    // Get the file size for the return object
    const stat = await fs.stat(targetPath);
    return { width, height, bytes: stat.size, degraded: false };
  } catch (error) {
    console.error('[replicate provider] Generation failed:', error);
    throw new ApiError(500, `Failed to generate image via Replicate: ${error.message}`);
  }
};

export default { generateImage };
