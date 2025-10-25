/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import { Room, StoryMode } from '../types';
import { generateRoom } from './roomGenerator';
import { generatePixelArt } from './falService';
import { TileMap } from './mapGenerator';
import {geminiProxyGenerate, GEMINI_MODELS} from './geminiProxyClient';

/**
 * Configuration for multi-room batch generation
 */
export interface MultiRoomConfig {
  numRooms: 2 | 3; // Number of rooms to generate at once
  useAnchorImage: boolean; // Use previous scene as anchor
}

/**
 * Calculate optimal dimensions for X-room panorama using native aspect ratios
 */
function getPanoramaDimensions(numRooms: 2 | 3): {
  aspectRatio: string;
  totalWidth: number;
  totalHeight: number;
  roomWidth: number;
  roomHeight: number;
} {
  if (numRooms === 2) {
    // Use 16:9 aspect ratio for 2 rooms
    return {
      aspectRatio: '16:9',
      totalWidth: 1600,
      totalHeight: 900,
      roomWidth: 800,
      roomHeight: 900,
    };
  } else {
    // Use 21:9 aspect ratio for 3 rooms
    return {
      aspectRatio: '21:9',
      totalWidth: 2100,
      totalHeight: 900,
      roomWidth: 700,
      roomHeight: 900,
    };
  }
}

function generateCombinedPathDescription(tileMaps: TileMap[]): string {
  const roomDescriptions = tileMaps.map((tileMap, index) => {
    const pathDesc = tileMap.pathDescription?.fullDescription || 'A path runs through the area.';
    const position = index === 0 ? 'LEFT SECTION' : index === tileMaps.length - 1 ? 'RIGHT SECTION' : 'MIDDLE SECTION';
    return `${position}: ${pathDesc}`;
  });

  const transitions = [];
  for (let i = 0; i < tileMaps.length - 1; i++) {
    const currentEnd = tileMaps[i].pathPoints[tileMaps[i].pathPoints.length - 1];
    const nextStart = tileMaps[i + 1].pathPoints[0];
    
    const transitionY = ((currentEnd.y + nextStart.y) / 2 / (tileMaps[i].height * tileMaps[i].tileSize) * 100).toFixed(0);
    transitions.push(`smooth transition at ${transitionY}% vertical position between sections ${i + 1} and ${i + 2}`);
  }

  return `PANORAMA PATH LAYOUT:\n${roomDescriptions.join('\n')}\n\nTRANSITIONS:\n${transitions.join(', ')}.`;
}

/**
 * Slice a panorama into X individual room scenes and scale to target dimensions
 * Dynamically calculates slice width from actual panorama dimensions
 */
export async function slicePanorama(
  imageUrl: string,
  numRooms: number,
  targetWidth: number = 1000,  // Target canvas viewport width
  targetHeight: number = 800    // Target canvas viewport height
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      console.log(`[MultiRoomGen] Received panorama: ${img.width}x${img.height}, slicing into ${numRooms} rooms`);

      // Calculate slice dimensions from actual panorama
      const sliceWidth = img.width / numRooms;
      const sliceHeight = img.height;

      // Create single canvas for slicing and scaling
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Set up canvas for target viewport dimensions
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const scenes: string[] = [];

      console.log(`[MultiRoomGen] Slice size: ${sliceWidth}x${sliceHeight}, scaling to ${targetWidth}x${targetHeight}`);

      for (let i = 0; i < numRooms; i++) {
        const sourceX = i * sliceWidth;

        // Slice from panorama and scale to viewport in one operation
        ctx.clearRect(0, 0, targetWidth, targetHeight);
        ctx.drawImage(
          img,
          sourceX, 0, sliceWidth, sliceHeight,  // source (slice from panorama)
          0, 0, targetWidth, targetHeight        // destination (scaled to viewport)
        );

        // Convert scaled image to data URL
        scenes.push(canvas.toDataURL('image/png'));

        console.log(`[MultiRoomGen] Room ${i + 1}: sliced from x=${sourceX.toFixed(0)}, scaled to viewport`);
      }

      resolve(scenes);
    };

    img.onerror = () => reject(new Error('Failed to load panorama image'));
    img.src = imageUrl;
  });
}

/**
 * Build scene prompt for multi-room panorama
 */
function buildMultiRoomPrompt(
  rooms: Array<{
    roomNumber: number;
    biome: string;
    description: string;
  }>,
  pathDescription: string,
  storyContext?: string | null,
  storyMode?: StoryMode
): string {
  const roomDescriptions = rooms.map((room, idx) =>
    `[Room ${room.roomNumber} (${idx === 0 ? 'LEFT' : idx === rooms.length - 1 ? 'RIGHT' : 'CENTER'})]: ${room.description}`
  ).join(' → ');

  let storySection = '';
  if (storyContext) {
    storySection = `\n\nSTORY CONTEXT: ${storyContext.substring(0, 300)}...\n`;
  }

  return `You are a creative prompt generator for pixel art game scenes.
${storySection}

MULTI-ROOM PANORAMA (${rooms.length} connected rooms):
${roomDescriptions}

PATH LAYOUT:
${pathDescription}

Generate a detailed, vivid prompt for creating a seamless horizontal panorama showing these ${rooms.length} connected locations. The prompt should describe:
- A continuous landscape flowing from left to right
- **CRITICAL**: A clear, golden/yellow walkable path that follows the exact path layout described above
- Smooth transitions between the different areas as specified in the path layout
- Consistent lighting and atmosphere across all sections
- Visual elements that match each room's description
- Make it feel like a classic top-down 16-bit RPG panorama

**CRITICAL**: The path must follow the exact trajectory and transitions described in the path layout. Include the path description details in the visual prompt.

Output ONLY the image generation prompt, 2-3 sentences maximum.`;
}

/**
 * Generate X rooms at once as a panorama with dual reference system
 */
export async function generateMultiRoomBatch(
  roomIds: string[],
  storySeed: number,
  startingRoomNumber: number,
  config: MultiRoomConfig,
  previousSceneUrl?: string, // Anchor image for continuity
  storyContext?: string | null,
  storyMode?: StoryMode
): Promise<Room[]> {
  const numRooms = config.numRooms;

  if (roomIds.length !== numRooms) {
    throw new Error(`Expected ${numRooms} room IDs, got ${roomIds.length}`);
  }

  console.log(`[MultiRoomGen] Generating batch of ${numRooms} rooms: ${roomIds.join(', ')}`);

  // Step 1: Generate all rooms WITHOUT scene images (just tile maps + objects)
  const roomBases = await Promise.all(
    roomIds.map((roomId, idx) =>
      generateRoom(
        roomId,
        storySeed,
        startingRoomNumber + idx,
        undefined,
        storyContext,
        storyMode,
        undefined,
        false // Don't generate scene yet
      )
    )
  );

  // Step 2: Generate combined path description
  const tileMaps = roomBases.map(room => room.tileMap!);
  const pathDescription = generateCombinedPathDescription(tileMaps);

  console.log(`[MultiRoomGen] Generated path description for ${numRooms} rooms`);

  // Step 3: Generate panorama prompt using Gemini 2.5 Pro
  const promptRequest = buildMultiRoomPrompt(
    roomBases.map((room, idx) => ({
      roomNumber: startingRoomNumber + idx,
      biome: room.tileMap!.biome,
      description: room.description,
    })),
    pathDescription,
    storyContext,
    storyMode
  );

  console.log(`[MultiRoomGen] Generating panorama prompt using Gemini 2.5 Pro...`);

  // Call Gemini API through secure proxy
  let imagePrompt = await geminiProxyGenerate(GEMINI_MODELS.PRO, promptRequest);
  imagePrompt = imagePrompt.trim();
  console.log(`[MultiRoomGen] Prompt: ${imagePrompt.substring(0, 150)}...`);

  // Step 4: Prepare image references (anchor system)
  const imageReferences: string[] = [];

  if (config.useAnchorImage && previousSceneUrl) {
    imageReferences.push(previousSceneUrl);
    console.log(`[MultiRoomGen] Using previous scene as visual anchor: ${previousSceneUrl.substring(0, 50)}...`);
  }

  // Step 5: Generate panorama using Nano Banana
  const dimensions = getPanoramaDimensions(numRooms);

  console.log(`[MultiRoomGen] Generating ${dimensions.aspectRatio} panorama (${dimensions.totalWidth}x${dimensions.totalHeight}) with path description...`);

  if (imageReferences.length > 0) {
    console.log(`[MultiRoomGen] Using ${imageReferences.length} reference image(s) for visual continuity`);
  }

  const generatedImage = await generatePixelArt({
    prompt: imagePrompt,
    type: 'panorama',
    customDimensions: {
      width: dimensions.totalWidth,
      height: dimensions.totalHeight,
    },
    referenceImages: imageReferences.length > 0 ? imageReferences : undefined,
    useNanoBanana: true,
  });

  console.log(`[MultiRoomGen] Panorama generated successfully`);

  // Step 6: Slice panorama into individual room scenes and scale to viewport
  const TARGET_VIEWPORT_WIDTH = 1000;  // Standard canvas viewport width
  const TARGET_VIEWPORT_HEIGHT = 800;  // Standard canvas viewport height

  const slicedScenes = await slicePanorama(
    generatedImage.url,
    numRooms,
    TARGET_VIEWPORT_WIDTH,  // Scale to match canvas viewport
    TARGET_VIEWPORT_HEIGHT
  );

  console.log(`[MultiRoomGen] Sliced panorama into ${numRooms} scenes and scaled to ${TARGET_VIEWPORT_WIDTH}x${TARGET_VIEWPORT_HEIGHT}`);

  // Step 7: Attach scenes to rooms
  roomBases.forEach((room, idx) => {
    room.sceneImage = slicedScenes[idx];
    room.sceneImageLoading = false;
  });

  return roomBases;
}
