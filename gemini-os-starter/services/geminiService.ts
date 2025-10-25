/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
import {getSystemPrompt} from '../constants';
import {InteractionData} from '../types';
import {BiomeDefinition} from '../types/biomes';
import {eventLogger} from './eventLogger';
import {geminiProxyGenerate, GEMINI_MODELS} from './geminiProxyClient';

export async function* streamAppContent(
  interactionHistory: InteractionData[],
  currentMaxHistoryLength: number,
  characterClass?: string,
  characterHP?: number,
  storySeed?: number,
  playerLevel?: number,
  consequences?: Array<{type: string; description: string}>,
  storyContext?: string | null,
  storyMode?: string,
  existingVisualIdentity?: {
    imagePrompts: { background: string; character: string };
    appearance: string;
  }
): AsyncGenerator<string, void, void> {
  const model = GEMINI_MODELS.FLASH_LITE;

  if (interactionHistory.length === 0) {
    yield `<div class="p-4 text-orange-700 bg-orange-100 rounded-lg">
      <p class="font-bold text-lg">No interaction data provided.</p>
    </div>`;
    return;
  }

  const eventContext = eventLogger.getContextForAI();

  const systemPrompt = getSystemPrompt(
    currentMaxHistoryLength,
    characterClass,
    characterHP,
    storySeed,
    playerLevel,
    consequences,
    storyContext,
    storyMode,
    eventContext,
    existingVisualIdentity
  ); // Generate system prompt dynamically with game context

  const currentInteraction = interactionHistory[0];
  // pastInteractions already respects currentMaxHistoryLength due to slicing in App.tsx
  const pastInteractions = interactionHistory.slice(1);

  const currentElementName =
    currentInteraction.elementText ||
    currentInteraction.id ||
    'Unknown Element';
  let currentInteractionSummary = `Current Player Action: ${currentElementName} (Type: ${currentInteraction.type || 'N/A'}, ID: ${currentInteraction.id || 'N/A'}).`;
  if (currentInteraction.value) {
    currentInteractionSummary += ` Associated value: '${currentInteraction.value.substring(0, 100)}'.`;
  }

  let historyPromptSegment = '';
  if (pastInteractions.length > 0) {
    historyPromptSegment = `\n\nPrevious Player Actions (most recent first):`;

    // Iterate over the pastInteractions array
    pastInteractions.forEach((interaction, index) => {
      const pastElementName =
        interaction.elementText || interaction.id || 'Unknown Element';
      historyPromptSegment += `\n${index + 1}. ${pastElementName} (Type: ${interaction.type || 'N/A'}, ID: ${interaction.id || 'N/A'})`;
      if (interaction.value) {
        historyPromptSegment += ` with value '${interaction.value.substring(0, 50)}'`;
      }
      historyPromptSegment += '.';
    });
  }

  const fullPrompt = `${systemPrompt}

${currentInteractionSummary}
${historyPromptSegment}

Full Context for Current Interaction (for your reference):
${JSON.stringify(currentInteraction, null, 1)}

Return ONLY the JSON object for the game story scene:`;

  try {
    // Call Gemini API through secure proxy
    const text = await geminiProxyGenerate(model, fullPrompt);

    // Yield the full response (streaming removed for security)
    yield text;
  } catch (error) {
    console.error('Error streaming from Gemini:', error);
    let errorMessage = 'An error occurred while generating content.';
    // Check if error is an instance of Error and has a message property
    if (error instanceof Error && typeof error.message === 'string') {
      errorMessage += ` Details: ${error.message}`;
    } else if (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as any).message === 'string'
    ) {
      // Handle cases where error might be an object with a message property (like the API error object)
      errorMessage += ` Details: ${(error as any).message}`;
    } else if (typeof error === 'string') {
      errorMessage += ` Details: ${error}`;
    }

    yield `<div class="p-4 text-red-700 bg-red-100 rounded-lg">
      <p class="font-bold text-lg">Error Generating Content</p>
      <p class="mt-2">${errorMessage}</p>
      <p class="mt-1">This may be due to an API key issue, network problem, or misconfiguration. Please check the developer console for more details.</p>
    </div>`;
  }
}

/**
 * Generate a single biome definition using AI
 */
export async function generateBiomeWithAI(
  biomeName: string,
  storyContext: string
): Promise<BiomeDefinition> {
  const model = GEMINI_MODELS.FLASH_LITE;

  const prompt = `Create a game biome definition for "${biomeName}" in this story context: "${storyContext}"

You must return ONLY valid JSON with this exact structure (no markdown, no extra text):
{
  "name": "Display name for the biome",
  "baseTile": "ground tile type (single word, lowercase)",
  "pathTile": "walkable path tile type (single word, lowercase)",
  "obstacleTiles": ["obstacle1", "obstacle2", "obstacle3"],
  "colors": {
    "base": "#hexcolor for ground",
    "path": "#hexcolor for path",
    "obstacles": ["#hexcolor1", "#hexcolor2", "#hexcolor3"]
  },
  "atmosphere": "Brief atmospheric description (one sentence)"
}

Example for "swamp":
{
  "name": "Swamp",
  "baseTile": "murkyWater",
  "pathTile": "mud",
  "obstacleTiles": ["deadTree", "algae", "rock"],
  "colors": {
    "base": "#2d5a3d",
    "path": "#4a3f2e",
    "obstacles": ["#1a2f1a", "#3d5a3d", "#57534e"]
  },
  "atmosphere": "Murky waters and twisted dead trees create an eerie atmosphere"
}

Return ONLY the JSON object, nothing else.`;

  try {
    console.log(`[GeminiService] Generating biome: ${biomeName}`);

    // Call Gemini API through secure proxy
    const text = await geminiProxyGenerate(model, prompt);

    // Try to extract JSON from response (in case AI wrapped it in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON');
    }

    const biomeData: BiomeDefinition = JSON.parse(jsonMatch[0]);

    console.log(`[GeminiService] Successfully generated biome: ${biomeName}`);
    return biomeData;
  } catch (error) {
    console.error('[GeminiService] Error generating biome:', error);

    // Fallback to a generic biome
    return {
      name: biomeName,
      baseTile: 'grass',
      pathTile: 'dirt',
      obstacleTiles: ['rock', 'tree', 'bush'],
      colors: {
        base: '#4ade80',
        path: '#92400e',
        obstacles: ['#a1a1aa', '#22c55e', '#16a34a'],
      },
      atmosphere: `A mysterious ${biomeName} area`,
    };
  }
}

/**
 * Generate a biome progression for the entire game based on story context
 * Recreation mode: 5 rooms, Inspiration/Continuation: 20 rooms
 */
export async function generateBiomeProgression(
  storyContext: string | null,
  storyMode: string,
  numRooms?: number
): Promise<string[]> {
  // CRITICAL: Recreation mode uses only 5 rooms
  const roomCount = numRooms ?? (storyMode === 'recreation' ? 5 : 20);
  const model = GEMINI_MODELS.FLASH_LITE;

  const contextDescription = storyContext
    ? `Story: "${storyContext.slice(0, 500)}..." (${storyMode} mode - ${roomCount} rooms)`
    : 'Generic fantasy adventure';

  const isFantasyStory = !storyContext ||
    /fantasy|magic|dragon|dungeon|medieval|sword|wizard|elf|dwarf/i.test(storyContext);

  const recreationNote = storyMode === 'recreation'
    ? `\n**RECREATION MODE (5 rooms):** Each location should represent a KEY STORY MOMENT from the narrative. Focus on the most important scenes.`
    : '';

  const prompt = `You are a game designer creating a ${roomCount}-room progression for a story-based game.

${contextDescription}

IMPORTANT: Create location names that FIT THE STORY CONTEXT!${recreationNote}

${isFantasyStory ? `
For fantasy stories, you can use these pre-made biomes:
forest, swamp, desert, ice, cave, dungeon, plains, castle, volcanic, beach, darkforest, crystalcave, ruins, city, space
` : `
For NON-FANTASY stories (modern, sports, sci-fi, historical, etc.), CREATE CUSTOM LOCATION NAMES that match the story!

Examples:
- Soccer/Football story: "training_ground", "local_stadium", "national_championship", "world_cup_qualifier", "world_cup_final"
- Modern thriller: "apartment", "office_building", "subway", "warehouse", "penthouse"
- Space story: "space_station", "cargo_bay", "engine_room", "command_center", "alien_ship"
- Historical: "village", "market", "palace", "battlefield", "throne_room"
`}

Create a logical progression that:
1. Starts appropriate to the story setting (e.g., training ground for sports, apartment for thriller)
2. Gradually increases in stakes/intensity (e.g., local matches → national → world cup)
3. Makes narrative sense for THIS SPECIFIC story
4. Ends with the most climactic/important location (e.g., world cup final, final boss location)

Use UNDERSCORES for multi-word locations (e.g., "training_ground", "world_cup_final", "local_stadium")

Return ONLY a JSON array of exactly ${roomCount} location names:
["location1", "location2", "location3", ...]

${storyMode === 'recreation' ? `Example for "Lionel Messi winning World Cup" (5 rooms):
["training_facility", "opening_match_defeat", "knockout_rounds", "world_cup_final", "victory_celebration"]` : `Example for "Lionel Messi winning World Cup" (20 rooms):
["training_ground", "practice_match", "local_stadium", "national_league", "champions_league", "world_cup_qualifier", "group_stage", "knockout_round", "quarterfinal", "semifinal", "world_cup_final"]`}`;

  try {
    console.log('[GeminiService] Generating biome progression...');

    // Call Gemini API through secure proxy
    const text = await geminiProxyGenerate(model, prompt);

    // Extract JSON array
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      throw new Error('AI response did not contain valid JSON array');
    }

    const progression: string[] = JSON.parse(jsonMatch[0]);

    // Ensure we have exactly roomCount
    if (progression.length < roomCount) {
      // Pad with last biome
      while (progression.length < roomCount) {
        progression.push(progression[progression.length - 1]);
      }
    } else if (progression.length > roomCount) {
      // Trim to exact size
      progression.length = roomCount;
    }

    console.log(`[GeminiService] Generated progression: ${progression.slice(0, 5).join(', ')}...`);
    return progression;
  } catch (error) {
    console.error('[GeminiService] Error generating biome progression:', error);

    // Fallback to default progression
    return [
      'forest', 'forest', 'plains', 'plains', 'darkforest',
      'cave', 'cave', 'desert', 'desert', 'ruins',
      'dungeon', 'dungeon', 'dungeon', 'castle', 'castle',
      'volcanic', 'volcanic', 'volcanic', 'dungeon', 'dungeon'
    ];
  }
}
