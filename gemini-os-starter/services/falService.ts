/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import { falProxySubscribe } from './falProxyClient';

const PIXEL_ART_STYLE = '16-bit pixel art, top-down view, game sprite, Stardew Valley style, retro gaming aesthetic';
const NEGATIVE_PROMPT = 'blurry, 3D, realistic, photograph, low quality, modern, detailed shading';

export interface ImageGenerationParams {
  prompt: string;
  type: 'character' | 'enemy' | 'background' | 'item' | 'npc' | 'scene' | 'panorama';
  size?: 'small' | 'medium' | 'large';
  customDimensions?: { width: number; height: number };
  referenceImage?: string | Blob; // Data URL, Blob, or URL for image-to-image
  referenceImages?: Array<string | Blob>; // Multiple references for dual anchor system (Nano Banana only)
  imageStrength?: number; // How closely to follow the reference (0-1, default 0.5)
  useNanoBanana?: boolean; // Use Gemini 2.5 Flash Image (Nano Banana) instead of Flux
}

export interface GeneratedImage {
  url: string;
  prompt: string;
  type: string;
}

// Get image size based on type
function getImageSize(type: string, sizePreference?: string): { width: number; height: number } {
  if (type === 'background') {
    return { width: 1024, height: 576 }; // 16:9 aspect ratio for backgrounds
  }

  if (type === 'scene') {
    return { width: 1000, height: 800 }; // Scene dimensions matching viewport
  }

  if (type === 'panorama') {
    return { width: 2000, height: 800 }; // Panorama for dual scenes
  }

  if (sizePreference === 'small') {
    return { width: 256, height: 256 };
  }
  if (sizePreference === 'large') {
    return { width: 512, height: 512 };
  }

  // Default medium size for characters, enemies, NPCs
  return { width: 384, height: 384 };
}

/**
 * Generate a single pixel art image using fal.ai
 */
/**
 * Convert custom dimensions to closest supported Nano Banana aspect ratio
 * Supported: 21:9, 1:1, 4:3, 3:2, 2:3, 5:4, 4:5, 3:4, 16:9, 9:16
 */
function getAspectRatio(width: number, height: number): string {
  const ratio = width / height;

  // Map of supported aspect ratios with their decimal values
  const aspectRatios: { [key: string]: number } = {
    '21:9': 21 / 9,  // ~2.33
    '16:9': 16 / 9,  // ~1.78
    '5:4': 5 / 4,    // 1.25
    '4:3': 4 / 3,    // ~1.33
    '3:2': 3 / 2,    // 1.5
    '1:1': 1,        // 1.0
    '2:3': 2 / 3,    // ~0.67
    '3:4': 3 / 4,    // 0.75
    '4:5': 4 / 5,    // 0.8
    '9:16': 9 / 16,  // ~0.56
  };

  // Find the closest aspect ratio
  let closestRatio = '1:1';
  let smallestDiff = Infinity;

  for (const [name, value] of Object.entries(aspectRatios)) {
    const diff = Math.abs(ratio - value);
    if (diff < smallestDiff) {
      smallestDiff = diff;
      closestRatio = name;
    }
  }

  console.log(`[falService] Mapped ${width}x${height} (ratio ${ratio.toFixed(2)}) to aspect ratio ${closestRatio}`);
  return closestRatio;
}

export async function generatePixelArt(params: ImageGenerationParams): Promise<GeneratedImage> {
  const {
    prompt,
    type,
    size = 'medium',
    customDimensions,
    referenceImage,
    referenceImages,
    imageStrength = 0.75,
    useNanoBanana = false // Default to Flux for backward compatibility
  } = params;

  // Build full prompt with pixel art styling and mask interpretation instructions
  let fullPrompt = `${prompt}, ${PIXEL_ART_STYLE}`;

  const dimensions = customDimensions || getImageSize(type, size);

  try {
    let result: any;

    if (useNanoBanana) {
      // Use Gemini 2.5 Flash Image (Nano Banana)
      console.log(`[falService] Using Nano Banana (Gemini 2.5 Flash Image) for ${type}`);

      // Convert dimensions to valid aspect ratio
      const aspectRatio = getAspectRatio(dimensions.width, dimensions.height);

      // Handle multiple references (dual anchor system) or single reference
      const referencesToProcess = referenceImages || (referenceImage ? [referenceImage] : null);

      if (referencesToProcess) {
        // Image-to-Image with Nano Banana (supports multiple references)
        console.log(`[falService] Nano Banana img2img with ${referencesToProcess.length} reference image(s)`);
        console.log(`[falService] Image strength set to ${imageStrength} for layout preservation`);

        // Add inpainting mask interpretation instructions to prompt (industry-standard convention)
        fullPrompt = `${fullPrompt}

CRITICAL REFERENCE IMAGE INTERPRETATION:
The reference image is an INPAINTING MASK following industry standards where:
- WHITE areas = WALKABLE PATHS to generate with appropriate terrain (dirt paths, stone walkways, grass trails, wooden bridges, or other biome-appropriate walkable surfaces matching the scene's style and color palette)
- BLACK areas = NON-WALKABLE TERRAIN to fill with obstacles, vegetation, or environmental features appropriate to the biome
- The path layout (shape/position) shown in white must be preserved EXACTLY while styling it with realistic terrain
- Fill black areas completely with rich environmental details—no empty voids or black background showing
- Examples: Forest = dirt path with moss edges surrounded by dense trees; Desert = sandy trail with cacti and rocks; Dungeon = stone floor with wall obstacles; Cave = smooth rock path with stalagmites`;

        console.log(`[falService] Enhanced prompt with inpainting mask interpretation instructions`);

        // Convert Blobs to base64 data URLs for proxy
        const imageUrls: string[] = [];
        for (const ref of referencesToProcess) {
          if (ref instanceof Blob) {
            console.log(`[falService] Converting Blob to base64 (${ref.size} bytes)...`);
            const base64 = await blobToBase64(ref);
            imageUrls.push(base64);
          } else {
            imageUrls.push(ref); // Use URL/data URI directly
          }
        }

        console.log(`[falService] Using ${imageUrls.length} reference images for layout anchor system`);
        console.log(`[falService] Reference images are INPAINTING MASKS (WHITE paths on BLACK obstacles, feathered edges)`);

        // Call FAL API through secure proxy
        result = await falProxySubscribe('fal-ai/gemini-25-flash-image/edit', {
          input: {
            prompt: fullPrompt,
            image_urls: imageUrls, // Layout references (path masks)
            aspect_ratio: aspectRatio,
            num_images: 1,
          },
          logs: true,
        });
      } else {
        // Text-to-Image with Nano Banana - Call through secure proxy
        result = await falProxySubscribe('fal-ai/gemini-25-flash-image', {
          input: {
            prompt: fullPrompt,
            aspect_ratio: aspectRatio,
            num_images: 1,
          },
          logs: false,
        });
      }
    } else {
      // Use Flux Schnell (original implementation)
      const inputConfig: any = {
        prompt: fullPrompt,
        image_size: {
          width: dimensions.width,
          height: dimensions.height,
        },
        num_inference_steps: referenceImage ? 8 : 4,
        num_images: 1,
        enable_safety_checker: false,
      };

      if (referenceImage) {
        inputConfig.image_url = referenceImage;
        inputConfig.strength = imageStrength;
        console.log(`[falService] Using reference image with strength ${imageStrength}`);
      }

      // Call FAL API through secure proxy
      result = await falProxySubscribe('fal-ai/flux/schnell', {
        input: inputConfig,
        logs: false,
      });
    }

    console.log('[falService] Raw result from fal.ai:', result);

    // Defensive access to the image URL
    const imageUrl = result?.images?.[0]?.url;

    if (!imageUrl) {
      console.error('[falService] Image URL not found in fal.ai response. Full response:', result);
      throw new Error('Image URL not found in fal.ai response.');
    }

    return {
      url: imageUrl,
      prompt: fullPrompt,
      type,
    };
  } catch (error) {
    console.error(`Failed to generate ${type} image:`, error);
    throw new Error(`Image generation failed for ${type}: ${error}`);
  }
}

/**
 * Generate multiple images in parallel
 */
export async function generateMultipleImages(
  params: ImageGenerationParams[]
): Promise<GeneratedImage[]> {
  const promises = params.map(param => generatePixelArt(param));
  return Promise.all(promises);
}

/**
 * Generate a complete battle scene (background + characters)
 */
export async function generateBattleScene(scene: {
  backgroundPrompt: string;
  characterPrompt?: string;
  enemyPrompt: string;
}): Promise<{
  background: GeneratedImage;
  character?: GeneratedImage;
  enemy: GeneratedImage;
}> {
  const imagesToGenerate: ImageGenerationParams[] = [
    { prompt: scene.backgroundPrompt, type: 'background', size: 'large' },
    { prompt: scene.enemyPrompt, type: 'enemy', size: 'medium' },
  ];

  if (scene.characterPrompt) {
    imagesToGenerate.push({
      prompt: scene.characterPrompt,
      type: 'character',
      size: 'medium',
    });
  }

  const results = await generateMultipleImages(imagesToGenerate);

  return {
    background: results[0],
    enemy: results[1],
    character: results[2],
  };
}

/**
 * Generate exploration sprites (for GameCanvas)
 */
export async function generateExplorationSprites(spriteDescriptions: {
  player?: string;
  npcs?: string[];
  enemies?: string[];
  items?: string[];
  terrain?: string;
}): Promise<{
  player?: GeneratedImage;
  npcs: GeneratedImage[];
  enemies: GeneratedImage[];
  items: GeneratedImage[];
  terrain?: GeneratedImage;
}> {
  const imagesToGenerate: ImageGenerationParams[] = [];

  if (spriteDescriptions.player) {
    imagesToGenerate.push({
      prompt: spriteDescriptions.player,
      type: 'character',
      size: 'small',
    });
  }

  if (spriteDescriptions.terrain) {
    imagesToGenerate.push({
      prompt: spriteDescriptions.terrain,
      type: 'background',
      size: 'large',
    });
  }

  spriteDescriptions.npcs?.forEach(npc => {
    imagesToGenerate.push({ prompt: npc, type: 'npc', size: 'small' });
  });

  spriteDescriptions.enemies?.forEach(enemy => {
    imagesToGenerate.push({ prompt: enemy, type: 'enemy', size: 'small' });
  });

  spriteDescriptions.items?.forEach(item => {
    imagesToGenerate.push({ prompt: item, type: 'item', size: 'small' });
  });

  const results = await generateMultipleImages(imagesToGenerate);

  // Parse results back into categories
  let resultIndex = 0;
  const parsed: any = {
    npcs: [],
    enemies: [],
    items: [],
  };

  if (spriteDescriptions.player) {
    parsed.player = results[resultIndex++];
  }

  if (spriteDescriptions.terrain) {
    parsed.terrain = results[resultIndex++];
  }

  for (let i = 0; i < (spriteDescriptions.npcs?.length || 0); i++) {
    parsed.npcs.push(results[resultIndex++]);
  }

  for (let i = 0; i < (spriteDescriptions.enemies?.length || 0); i++) {
    parsed.enemies.push(results[resultIndex++]);
  }

  for (let i = 0; i < (spriteDescriptions.items?.length || 0); i++) {
    parsed.items.push(results[resultIndex++]);
  }

  return parsed;
}

/**
 * Convert Blob to base64 data URL
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
