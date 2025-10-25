/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import { falProxySubscribe } from './falProxyClient';
import { spriteCache } from './spriteCache';

// Use environment variable for credentials

export interface SpriteGenerationParams {
  description: string;
  type: 'character' | 'enemy' | 'npc' | 'item';
  biome?: string;
  storyContext?: string;
  fallbackEmoji: string;
}

export interface GeneratedSprite {
  url: string;
  fallbackEmoji: string;
  cached: boolean;
}

const SPRITE_STYLE = 'pixel art sprite, 32x32 pixels, 16-bit SNES style, retro game aesthetic, consistent pixel art style, NO BACKGROUND, transparent background, isolated sprite, game asset, clean crisp edges, simple iconic design, top-down view, cohesive art direction';

function buildSpritePrompt(params: SpriteGenerationParams): string {
  const { description, type, biome, storyContext } = params;

  let prompt = `pixel art, 32x32, 16-bit style`;

  if (type === 'character') {
    prompt += `, ${description}, hero character sprite, protagonist`;
  } else if (type === 'enemy') {
    prompt += `, ${description}, antagonist sprite, opponent`;
  } else if (type === 'npc') {
    prompt += `, ${description}, character sprite`;
  } else if (type === 'item') {
    prompt += `, ${description}, item sprite, game object`;
  }

  if (biome) {
    prompt += `, ${biome} theme`;
  }

  if (storyContext) {
    const contextSnippet = storyContext.slice(0, 80);
    prompt += `, themed around: ${contextSnippet}`;
  }

  prompt += `, ${SPRITE_STYLE}`;

  return prompt;
}

async function removeBackground(imageUrl: string): Promise<string> {
  try {
    console.log('[SpriteGen] Removing background from generated sprite');
    const result: any = await falProxySubscribe('fal-ai/bria/background/remove', {
      input: {
        image_url: imageUrl,
      },
      logs: false,
    });

    const processedUrl = result?.image?.url;
    if (!processedUrl) {
      console.error('[SpriteGen] No URL in background removal response:', result);
      return imageUrl;
    }

    console.log('[SpriteGen] Background removed successfully');
    return processedUrl;
  } catch (error) {
    console.error('[SpriteGen] Failed to remove background:', error);
    return imageUrl;
  }
}

export async function generateSprite(
  params: SpriteGenerationParams
): Promise<GeneratedSprite> {
  const { description, type, biome, fallbackEmoji } = params;

  const cached = spriteCache.getSprite(description, type, biome);
  if (cached) {
    console.log(`[SpriteGen] Cache hit for ${type}: ${description}`);
    return {
      url: cached.url,
      fallbackEmoji: cached.fallbackEmoji,
      cached: true,
    };
  }

  console.log(`[SpriteGen] Generating ${type} sprite: ${description}`);

  const fullPrompt = buildSpritePrompt(params);

  try {
    const result: any = await falProxySubscribe('fal-ai/flux/schnell', {
      input: {
        prompt: fullPrompt,
        image_size: {
          width: 128,
          height: 128,
        },
        num_inference_steps: 4,
        num_images: 1,
        enable_safety_checker: false,
      },
      logs: false,
      onQueueUpdate: (update) => {
        if (update.status === 'IN_PROGRESS') {
          console.log(`[SpriteGen] ${type}: ${update.logs?.map(l => l.message).join(' ')}`);
        }
      },
    });

    const imageUrl = result?.images?.[0]?.url;

    if (!imageUrl) {
      console.error('[SpriteGen] No image URL in response:', result);
      throw new Error('Failed to get image URL from flux');
    }

    const processedUrl = await removeBackground(imageUrl);

    spriteCache.setSprite(
      description,
      type,
      processedUrl,
      fallbackEmoji,
      biome,
      params.storyContext
    );

    console.log(`[SpriteGen] Successfully generated and cached ${type} sprite`);

    return {
      url: processedUrl,
      fallbackEmoji,
      cached: false,
    };
  } catch (error) {
    console.error(`[SpriteGen] Failed to generate ${type} sprite:`, error);
    return {
      url: '',
      fallbackEmoji,
      cached: false,
    };
  }
}

export async function generateMultipleSprites(
  sprites: SpriteGenerationParams[]
): Promise<GeneratedSprite[]> {
  // OPTIMIZATION: Generate all sprites in parallel instead of sequentially
  // Before: 10s × 5 sprites = 50 seconds
  // After: 10s (all run simultaneously) = 80% faster!
  console.log(`[SpriteGen] Generating ${sprites.length} sprites in parallel...`);
  return Promise.all(sprites.map(sprite => generateSprite(sprite)));
}

export async function generateCharacterSprite(
  characterName: string,
  characterDescription: string,
  icon: string,
  storyContext?: string
): Promise<GeneratedSprite> {
  return generateSprite({
    description: `${characterName}, ${characterDescription}`,
    type: 'character',
    fallbackEmoji: icon,
    storyContext,
  });
}

export async function generateEnemySprite(
  enemyDescription: string,
  biome: string,
  level: number,
  fallbackEmoji: string,
  storyContext?: string
): Promise<GeneratedSprite> {
  // Don't add generic "creature" - the description is already specific
  const baseDescription = `${enemyDescription} at ${biome}`;

  return generateSprite({
    description: baseDescription,
    type: 'enemy',
    biome,
    fallbackEmoji,
    storyContext,
  });
}

export async function generateNPCSprite(
  npcDescription: string,
  biome: string,
  fallbackEmoji: string,
  storyContext?: string
): Promise<GeneratedSprite> {
  // Don't add generic "inhabitant" - the description is already specific
  const description = `${npcDescription} at ${biome}`;

  return generateSprite({
    description,
    type: 'npc',
    biome,
    fallbackEmoji,
    storyContext,
  });
}

export async function generateItemSprite(
  itemName: string,
  itemDescription: string,
  fallbackEmoji: string,
  biome?: string
): Promise<GeneratedSprite> {
  const description = `${itemName}, ${itemDescription}`;
  
  return generateSprite({
    description,
    type: 'item',
    biome,
    fallbackEmoji,
  });
}

export function getSpriteOrEmoji(sprite: GeneratedSprite): string {
  return sprite.url || sprite.fallbackEmoji;
}

export function preloadSprite(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!url) {
      resolve();
      return;
    }

    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to preload sprite: ${url}`));
    img.src = url;
  });
}
