/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import {geminiProxyGenerate, GEMINI_MODELS} from './geminiProxyClient';

/**
 * Generate a story-aware NPC description for a given room
 */
export async function generateNPCDescription(
  roomNumber: number,
  biome: string,
  storyContext: string | null,
  storyMode: 'inspiration' | 'recreation' | 'continuation' = 'inspiration'
): Promise<string> {
  const model = GEMINI_MODELS.FLASH_LITE;

  if (!storyContext) {
    // No story context, return generic
    return 'traveler, wanderer';
  }

  const prompt = `You are helping create NPCs for a procedurally generated story-based game.

Story Context: ${storyContext}
Story Mode: ${storyMode}
Current Location: Room ${roomNumber} in a ${biome} environment
Player Progress: ${roomNumber === 0 ? 'Just starting the journey' : `${roomNumber} rooms into the adventure`}

Based on the story context and current progress, generate ONE NPC character that would make sense to encounter.

IMPORTANT RULES:
- For Recreation mode: Use actual characters from the story (e.g., for Messi story: coach, teammate, sports journalist, rival player, fan)
- For Continuation mode: Use characters that fit the world after the story (e.g., new generation, changed roles)
- For Inspiration mode: Use character TYPES inspired by the story's themes (e.g., mentor figure, competitive rival, wise guide)
- Keep it generic enough to work in any room but specific enough to feel story-relevant
- Early rooms (0-5): Introduce supportive/tutorial NPCs (mentors, guides, allies, fans)
- Mid rooms (6-15): Mix of allies, neutral parties, and challenging figures (journalists, sponsors, agents)
- Late rooms (16+): Significant figures, final challenges, climactic encounters (legendary coaches, iconic rivals)

Return ONLY a brief NPC description (2-4 words) suitable for sprite generation.
Examples: "wise mentor", "rival competitor", "supportive coach", "strategic advisor", "challenging opponent", "eager fan", "team captain"

NPC Description:`;

  try {
    // Call Gemini API through secure proxy
    const text = await geminiProxyGenerate(model, prompt);
    let description = (text || 'traveler').trim();

    // Clean up the response
    description = description.replace(/^["']|["']$/g, ''); // Remove quotes
    description = description.split('\n')[0]; // Take first line only
    description = description.substring(0, 50); // Limit length

    console.log(`[NPCGenerator] Generated NPC description for room ${roomNumber}: "${description}"`);
    return description;
  } catch (error) {
    console.error('[NPCGenerator] Error generating NPC description:', error);
    return 'traveler, wanderer';
  }
}

/**
 * Generate a story-aware enemy description for a given room
 */
export async function generateEnemyDescription(
  roomNumber: number,
  biome: string,
  enemyLevel: number,
  storyContext: string | null,
  storyMode: 'inspiration' | 'recreation' | 'continuation' = 'inspiration'
): Promise<string> {
  const model = GEMINI_MODELS.FLASH_LITE;

  if (!storyContext) {
    return `hostile creature, ${biome} monster`;
  }

  const prompt = `You are helping create enemies for a procedurally generated story-based game.

Story Context: ${storyContext}
Story Mode: ${storyMode}
Current Location: Room ${roomNumber} in a ${biome} environment
Enemy Level: ${enemyLevel}
Player Progress: ${roomNumber === 0 ? 'Just starting' : `${roomNumber} rooms in`}

Based on the story context, generate ONE enemy/obstacle that fits the narrative.

IMPORTANT RULES:
- For Recreation mode: Use actual antagonists/challenges from the story (e.g., for Messi story: tough defenders, rival team players, physical challenges)
- For Continuation mode: Use threats that evolved from the original story
- For Inspiration mode: Use obstacle TYPES inspired by story themes (e.g., competitive challenges, tests of skill)
- Make it thematically appropriate (sports story = physical challenges NOT fantasy monsters)
- Scale threat level based on room number and enemy level
- Keep description 2-4 words for sprite generation

Examples: "aggressive defender", "rival striker", "challenging obstacle", "fierce competitor", "tough opponent"

Enemy Description:`;

  try {
    // Call Gemini API through secure proxy
    const text = await geminiProxyGenerate(model, prompt);
    let description = (text || `hostile creature, ${biome} monster`).trim();

    description = description.replace(/^["']|["']$/g, '');
    description = description.split('\n')[0];
    description = description.substring(0, 50);

    console.log(`[NPCGenerator] Generated enemy description for room ${roomNumber}: "${description}"`);
    return description;
  } catch (error) {
    console.error('[NPCGenerator] Error generating enemy description:', error);
    return `hostile creature, ${biome} monster`;
  }
}

/**
 * Generate a story-aware interaction text for NPCs
 */
export async function generateNPCInteractionText(
  npcDescription: string,
  roomNumber: number,
  storyContext: string | null,
  storyMode: 'inspiration' | 'recreation' | 'continuation' = 'inspiration'
): Promise<string> {
  const model = GEMINI_MODELS.FLASH_LITE;

  if (!storyContext) {
    return 'A traveler rests here';
  }

  const prompt = `Generate a brief interaction text (one sentence, 10-15 words) for encountering this NPC:

NPC Type: ${npcDescription}
Story Context: ${storyContext}
Story Mode: ${storyMode}
Room Number: ${roomNumber}

Make it story-relevant and intriguing. The player should want to interact.

Examples:
- For "supportive coach": "A seasoned coach watches from the sidelines, ready to share wisdom."
- For "rival player": "A competitive rival eyes you with determination and respect."
- For "eager fan": "An enthusiastic supporter recognizes you and wants to talk."

Interaction Text:`;

  try {
    // Call Gemini API through secure proxy
    const responseText = await geminiProxyGenerate(model, prompt);
    let text = (responseText || 'A traveler rests here').trim();
    text = text.replace(/^["']|["']$/g, '');
    text = text.split('\n')[0];
    text = text.substring(0, 120);

    return text;
  } catch (error) {
    console.error('[NPCGenerator] Error generating interaction text:', error);
    return 'Someone waits here';
  }
}
