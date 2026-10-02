import config from '../../config/env.js';

let activeProvider = null;

export const getProvider = async () => {
  if (activeProvider) return activeProvider;

  const providerName = config.generation.provider;
  
  if (providerName === 'replicate') {
    activeProvider = await import('./replicate.js');
  } else if (providerName === 'mock') {
    // Return null, the caller will fallback to the built-in mock SVG renderer
    activeProvider = { generateImage: null };
  } else {
    // For other providers like openai or gemini, you can add them here
    throw new Error(`Unsupported IMAGE_PROVIDER: ${providerName}. Please check your .env file.`);
  }

  return activeProvider;
};
