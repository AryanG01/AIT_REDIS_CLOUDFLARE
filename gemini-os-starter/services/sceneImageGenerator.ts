/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import { Room, StoryMode, GameObject } from '../types';
import { BiomeType, TileMap } from './mapGenerator';
import { slicePanoramaImage, createFallbackScene } from '../utils/imageSlicing';
import { getCachedImage, cacheImage } from '../utils/imageCache';
import { generatePixelArt } from './falService';
import { tileMapToReferenceImage, resizeTileMapReference, combineTileMapsAsPanorama, tileMapToBlob } from '../utils/tileMapToImage';
import { USE_BIOME_FOR_IMAGES } from '../constants';
import {geminiProxyGenerate, GEMINI_MODELS} from './geminiProxyClient';

export interface SceneGenerationParams {
  roomId: string;
  roomNumber: number;
  biome: BiomeType;
  description: string;
  objects: GameObject[];
  storyContext?: string | null;
  storyMode?: StoryMode;
  previousRoomDescription?: string;
  tileMap?: TileMap; // Include tile map for reference image generation
}

/**
 * OPTIMIZATION: Hash function for content-based cache keys
 * Same content = same hash = reuse cached scenes across sessions
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Build a prompt for Gemini to generate STYLE-ONLY description
 * LAYOUT is handled 100% by the reference image
 */
function buildScenePromptRequest(params: SceneGenerationParams): string {
  const {
    roomNumber,
    biome,
    description,
    objects,
    storyContext,
    storyMode,
    previousRoomDescription,
    tileMap,
  } = params;

  // Biome descriptions - STYLE ONLY, no layout (fallback for legacy biomes)
  const biomeDescriptions: Record<BiomeType, string> = {
    forest: 'lush parkland with tall trees, mossy boulders, and soft sunlight cutting through the canopy',
    plains: 'open grasslands with gentle hills, native plants, and distant skylines in soft focus',
    desert: 'arid terrain with wind-swept dunes, hardy shrubs, and shimmering heat haze',
    cave: 'subterranean tunnels with reinforced rock walls, industrial lighting, and shallow reflective pools',
    dungeon: 'industrial corridors with exposed pipes, emergency lighting, and maintenance equipment stacked along the walls',
  };

  // CRITICAL FIX: Use biomeDefinition.atmosphere if available (for story-aware custom biomes)
  // This ensures custom locations like "world_cup_final" use AI-generated atmosphere instead of generic "forest"
  let biomeStyle: string;
  if (tileMap?.biomeDefinition?.atmosphere && USE_BIOME_FOR_IMAGES) {
    // Use the AI-generated atmosphere from the biome definition
    biomeStyle = tileMap.biomeDefinition.atmosphere;
    console.log(`[SceneGen] Using custom biome atmosphere: ${biomeStyle}`);
  } else if (USE_BIOME_FOR_IMAGES) {
    // Fallback to hardcoded descriptions for legacy biomes
    biomeStyle = biomeDescriptions[biome] || 'generic game environment';
  } else {
    biomeStyle = 'generic game environment';
  }

  // Summarize objects - VISUAL STYLE, not placement
  const enemies = objects.filter((o) => o.type === 'enemy');
  const npcs = objects.filter((o) => o.type === 'npc');
  const items = objects.filter((o) => o.type === 'item');

  let atmosphereHints = '';
  if (enemies.length > 0) {
    atmosphereHints += `Dangerous, ominous atmosphere with threatening presence. `;
  }
  if (npcs.length > 0) {
    atmosphereHints += `Signs of civilization and friendly inhabitants. `;
  }
  if (items.length > 0) {
    atmosphereHints += `Hints of treasure and discovery. `;
  }

  // Story context integration - THEME ONLY (CRITICAL for non-fantasy stories)
  let storySection = '';
  if (storyContext) {
    const modeInstructions: Record<StoryMode, string> = {
      recreation: 'Match the visual style and atmosphere from the original story. Use specific visual elements from the source material.',
      continuation: 'Show a world that has aged and evolved, with weathering and change reflecting passage of time.',
      inspiration: 'Capture the color palette, mood, and aesthetic themes. Every visual must feel authentic to this setting.',
    };

    const fantasySignals = /(wizard|magic|spell|dragon|sorcerer|witch|mage|necromancer|demon|ghost|spirit|specter|enchanted|paladin|elf|dwarf|orc|goblin)/i;
    const isExplicitFantasy = fantasySignals.test(storyContext);

    storySection = `
**CRITICAL STORY CONTEXT (${storyMode || 'inspiration'} mode):**
"${storyContext.substring(0, 400)}..."

MANDATORY REQUIREMENT: The visual style MUST reflect this specific story setting, NOT generic fantasy.
${modeInstructions[storyMode || 'inspiration']}
If this is a modern, sports, sci-fi, or non-fantasy setting, DO NOT use medieval/fantasy visuals.
${!isExplicitFantasy ? `
ABSOLUTE RESTRICTION: This narrative contains no supernatural or magical elements.
- Avoid ghosts, spirits, glowing runes, magical auras, floating particles, or mythic creatures.
- Use real-world lighting sources (stadium lights, office fixtures, street lamps, etc.).
- Architecture, props, and costumes must belong to the story's actual genre and era.
` : ''}
`;
  }

  // Get biome name for better context
  const biomeName = tileMap?.biomeDefinition?.name || description;
  
  const pathDescription = tileMap?.pathDescription?.fullDescription || 'A path flows from left to right through the scene.';

  return `You are a visual style consultant for pixel art game scenes.

${storySection}

LOCATION: ${biomeName} (Room ${roomNumber})
DESCRIPTION: ${description}
${USE_BIOME_FOR_IMAGES ? `ENVIRONMENT STYLE: ${biomeStyle}` : `STYLE: ${biomeStyle} based on room description`}
ATMOSPHERE: ${atmosphereHints || 'peaceful, serene environment'}
${previousRoomDescription ? `CONTINUITY: Maintains visual consistency with previous area: ${previousRoomDescription}` : ''}

PATH LAYOUT DESCRIPTION:
${pathDescription}

${storyContext ? `\n**REMINDER: This is "${biomeName}" from the story context above. The visual style must match that narrative setting, not default to generic fantasy.**\n` : ''}

Generate a detailed prompt for pixel art scene generation. Include:
- The path description exactly as specified above, with visual styling appropriate to the setting
- Color palette (what colors dominate the scene?)
- Texture and materials (appropriate to the story setting - could be grass, concrete, metal, sand, etc.)
- Lighting and mood (bright, dark, mysterious, welcoming?)
- Atmospheric effects (fog, sunbeams, shadows, particle effects?)
- Environmental richness (describe what fills the non-path areas - trees, rocks, buildings, crowds, etc.)
- Art style consistency (16-bit RPG, Stardew Valley aesthetic, retro gaming)
${storyContext ? '- Setting authenticity (ensure visuals match the narrative context)' : ''}

IMPORTANT: The walkable path must follow the trajectory described in the PATH LAYOUT DESCRIPTION. Describe it with appropriate visual styling for the setting.

Output format: Single paragraph, 2-3 sentences including the path description.`;
}

/**
 * Use Gemini to generate a scene image prompt, then fal.ai to create the image
 */
export async function generateSingleRoomScene(
  params: SceneGenerationParams
): Promise<string> {
  const { roomId, biome } = params;

  try {
    console.log(`[SceneGen] USE_BIOME_FOR_IMAGES: ${USE_BIOME_FOR_IMAGES} (${USE_BIOME_FOR_IMAGES ? 'biome styling enabled' : 'generic styling'})`);

    // Build the request for Gemini
    const promptRequest = buildScenePromptRequest(params);

    // OPTIMIZATION: Check cache first using content-based key (v3 = content hash)
    // Hash based on description + biome, not roomId, so scenes can be reused across sessions
    const descriptionHash = hashString(params.description + params.biome + (params.previousRoomDescription || ''));
    const cacheKey = `scene_v3_${descriptionHash}`;
    const cachedUrl = getCachedImage(cacheKey);

    if (cachedUrl) {
      console.log(`[SceneGen] Using cached scene (content-based cache key: ${cacheKey.slice(0, 30)}...)`);
      return cachedUrl;
    }

    console.log(`[SceneGen] Generating prompt for room ${roomId} using Gemini 2.5 Flash...`);

    // OPTIMIZATION: Run Gemini prompt generation and tilemap conversion in parallel
    const [imagePrompt, referenceImage] = await Promise.all([
      // Operation 1: Gemini prompt generation (1-2s)
      (async () => {
        const ai = getGeminiClient();
        const response = await ai.models.generateContentStream({
          model: GEMINI_MODELS.FLASH,
          contents: promptRequest,
          config: {},
        });

        // Extract the generated prompt from stream
        let prompt = '';
        for await (const chunk of response) {
          if (chunk.text) {
            prompt += chunk.text;
          }
        }
        console.log(prompt);

        const trimmedPrompt = prompt.trim();
        console.log(`[SceneGen] Gemini generated prompt: ${trimmedPrompt.substring(0, 150)}...`);
        return trimmedPrompt;
      })(),

      // Operation 2: Tilemap conversion (0.3-0.5s) - runs in parallel!
      (async () => {
        if (params.tileMap) {
          try {
            console.log(`[SceneGen] Converting tile map to reference Blob...`);
            const blob = await tileMapToBlob(params.tileMap);
            console.log(`[SceneGen] Reference Blob ready (${blob.size} bytes, tile map guide)`);
            return blob;
          } catch (error) {
            console.warn(`[SceneGen] Failed to create reference image:`, error);
            return undefined;
          }
        }
        return undefined;
      })()
    ]);

    console.log(`[SceneGen] Generating image via fal.ai for room ${roomId}${referenceImage ? ' (with path-based reference)' : ''}...`);

    const generatedImage = await generatePixelArt({
      prompt: imagePrompt,
      type: 'scene',
      customDimensions: { width: 1000, height: 800 },
      referenceImage: referenceImage,
      imageStrength: 0.7,
      useNanoBanana: true,
    });

    console.log(`[SceneGen] Scene image generated successfully for room ${roomId}`);

    // Cache the result
    cacheImage(cacheKey, generatedImage.url);

    return generatedImage.url;
  } catch (error) {
    console.error(`[SceneGen] Failed to generate scene for room ${roomId}:`, error);

    // Fallback: Create gradient-based scene
    console.warn(`[SceneGen] Using fallback scene for room ${roomId}`);
    return createFallbackScene(biome, 1000, 800);
  }
}

/**
 * Generate a panorama scene (2000x800) for current + next room
 * Uses BOTH tile maps as reference for perfect path continuity
 */
export async function generateScenePanorama(
  currentRoomParams: SceneGenerationParams,
  nextRoomParams: SceneGenerationParams
): Promise<{ currentScene: string; nextScene: string }> {
  try {
    // Build prompts for both rooms
    const currentPromptRequest = buildScenePromptRequest(currentRoomParams);
    const nextPromptRequest = buildScenePromptRequest(nextRoomParams);

    console.log(`[SceneGen] Generating panorama prompts for rooms ${currentRoomParams.roomId} + ${nextRoomParams.roomId}...`);

    // OPTIMIZATION: Run both Gemini calls AND tilemap combination in parallel
    const [currentImagePrompt, nextImagePrompt, panoramaReferenceUrl] = await Promise.all([
      // Operation 1: Generate current room prompt (1-2s)
      (async () => {
        const ai = getGeminiClient();
        const response = await ai.models.generateContentStream({
          model: GEMINI_MODELS.FLASH,
          contents: currentPromptRequest,
          config: {},
        });

        let prompt = '';
        for await (const chunk of response) {
          if (chunk.text) prompt += chunk.text;
        }
        return prompt.trim();
      })(),

      // Operation 2: Generate next room prompt (1-2s) - runs in parallel!
      (async () => {
        const ai = getGeminiClient();
        const response = await ai.models.generateContentStream({
          model: GEMINI_MODELS.FLASH,
          contents: nextPromptRequest,
          config: {},
        });

        let prompt = '';
        for await (const chunk of response) {
          if (chunk.text) prompt += chunk.text;
        }
        return prompt.trim();
      })(),

      // Operation 3: Combine tilemaps (0.5s) - also runs in parallel!
      (async () => {
        if (currentRoomParams.tileMap && nextRoomParams.tileMap) {
          try {
            console.log(`[SceneGen] Creating panorama reference with path guidance...`);
            const url = await combineTileMapsAsPanorama(
              currentRoomParams.tileMap,
              nextRoomParams.tileMap
            );
            console.log(`[SceneGen] Panorama reference ready`);
            return url;
          } catch (error) {
            console.warn(`[SceneGen] Failed to create panorama reference:`, error);
            return undefined;
          }
        }
        return undefined;
      })()
    ]);

    const currentPath = currentRoomParams.tileMap?.pathDescription?.fullDescription || '';
    const nextPath = nextRoomParams.tileMap?.pathDescription?.fullDescription || '';

    const panoramaPrompt = `LEFT SECTION: ${currentImagePrompt} Path layout: ${currentPath} | RIGHT SECTION: ${nextImagePrompt} Path layout: ${nextPath}
Seamlessly blended artistic styles with unified lighting and color harmony. Natural visual transition between areas where the paths connect.`;

    console.log(`[SceneGen] Panorama prompt: ${panoramaPrompt.substring(0, 200)}...`);

    console.log(`[SceneGen] Generating 2000x800 panorama via fal.ai${panoramaReferenceUrl ? ' (with path reference)' : ''}...`);

    const panoramaImage = await generatePixelArt({
      prompt: panoramaPrompt,
      type: 'panorama',
      customDimensions: { width: 2000, height: 800 },
      referenceImage: panoramaReferenceUrl,
      imageStrength: 0.7,
      useNanoBanana: true,
    });

    console.log(`[SceneGen] Panorama generated, slicing into sections...`);

    // Slice into current and next scenes
    const sliced = await slicePanoramaImage(panoramaImage.url);

    console.log(`[SceneGen] Panorama sliced successfully! Current scene length: ${sliced.currentScene.length}, Next scene length: ${sliced.nextScene.length}`);

    return sliced;
  } catch (error) {
    console.error('[SceneGen] Failed to generate panorama:', error);

    // Fallback: Generate individual scenes in parallel for faster recovery
    console.log('[SceneGen] Generating fallback scenes in parallel...');
    const [currentScene, nextScene] = await Promise.all([
      generateSingleRoomScene(currentRoomParams),
      generateSingleRoomScene(nextRoomParams)
    ]);

    return { currentScene, nextScene };
  }
}
