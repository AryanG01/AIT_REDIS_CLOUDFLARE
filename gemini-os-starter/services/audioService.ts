/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MusicGenerationContext,
  AudioContext,
  AudioFile,
} from '../types/audio';
import { generateRoomMusic, generateBattleMusic, generateStoryMusic } from './falAudioClient';
import { audioCache } from './audioCache';
import {geminiProxyGenerate, GEMINI_MODELS} from './geminiProxyClient';

// Cache for LLM-generated music descriptions
const musicDescriptionCache = new Map<string, { genre: string; mood: string }>();

/**
 * Use LLM to generate genre and mood from story context
 */
const generateMusicDescriptionWithLLM = async (storyContext: string): Promise<{ genre: string; mood: string }> => {
  // Check cache first
  if (musicDescriptionCache.has(storyContext)) {
    return musicDescriptionCache.get(storyContext)!;
  }

  try {
    const prompt = `Based on this story description, generate appropriate music genre and mood for background game music.

Story: ${storyContext}

Respond ONLY with a JSON object in this exact format (no other text):
{
  "genre": "one specific genre (e.g., 'medieval fantasy', 'sci-fi electronic', 'dark horror ambient', 'western', 'noir jazz', 'pirate adventure', etc.)",
  "mood": "mood description with 2-3 adjectives (e.g., 'mysterious, ancient', 'dark, ominous', 'hopeful, bright', etc.)"
}`;

    // Call Gemini API through secure proxy
    const text = await geminiProxyGenerate(GEMINI_MODELS.FLASH_LITE, prompt);

    // Extract JSON from the response (handle markdown code blocks if present)
    let jsonText = text.trim();
    if (jsonText.includes('```')) {
      const match = jsonText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (match) {
        jsonText = match[1];
      }
    }

    const parsed = JSON.parse(jsonText);
    const result = {
      genre: parsed.genre || 'cinematic adventure',
      mood: parsed.mood || 'atmospheric, mysterious',
    };

    // Cache the result
    musicDescriptionCache.set(storyContext, result);

    console.log('[AudioService] LLM-generated music description:', result);
    return result;
  } catch (error) {
    console.error('[AudioService] Failed to generate music description with LLM:', error);
    // Fallback to keyword extraction
    return {
      genre: extractGenre(storyContext),
      mood: extractMood(storyContext),
    };
  }
};

/**
 * Extract genre/theme from story context (fallback method)
 */
const extractGenre = (storyContext: string | null): string => {
  if (!storyContext) return 'cinematic adventure';

  const text = storyContext.toLowerCase();

  // Genre detection
  if (text.includes('sci-fi') || text.includes('space') || text.includes('cyberpunk') || text.includes('robot')) {
    return 'sci-fi electronic';
  }
  if (text.includes('horror') || text.includes('dark') || text.includes('terror') || text.includes('nightmare')) {
    return 'dark horror ambient';
  }
  if (text.includes('western') || text.includes('cowboy') || text.includes('frontier')) {
    return 'western';
  }
  if (text.includes('medieval') || text.includes('kingdom') || text.includes('magic') || text.includes('dragon')) {
    return 'medieval fantasy';
  }
  if (text.includes('noir') || text.includes('detective') || text.includes('mystery')) {
    return 'noir jazz';
  }
  if (text.includes('pirate') || text.includes('ocean') || text.includes('ship')) {
    return 'pirate adventure';
  }
  if (text.includes('sport') || text.includes('soccer') || text.includes('football') || text.includes('basketball') || text.includes('baseball')) {
    return 'sports drama';
  }
  if (text.includes('thriller') || text.includes('crime') || text.includes('suspense')) {
    return 'suspenseful thriller';
  }
  if (text.includes('romance') || text.includes('love')) {
    return 'romantic drama';
  }
  if (text.includes('comedy') || text.includes('funny') || text.includes('humor')) {
    return 'lighthearted comedy';
  }
  if (text.includes('historical') || text.includes('history') || text.includes('past')) {
    return 'historical drama';
  }

  // Check for fantasy keywords as one of many genre options (not default)
  if (text.includes('fantasy') || text.includes('magic') || text.includes('wizard') || text.includes('elf') || text.includes('dwarf')) {
    return 'fantasy adventure';
  }

  return 'cinematic adventure';
};

/**
 * Extract mood/atmosphere from story context
 */
const extractMood = (storyContext: string | null): string => {
  if (!storyContext) return 'mysterious';

  const text = storyContext.toLowerCase();

  if (text.includes('dark') || text.includes('grim') || text.includes('shadow')) {
    return 'dark, ominous';
  }
  if (text.includes('bright') || text.includes('hope') || text.includes('light')) {
    return 'hopeful, bright';
  }
  if (text.includes('ancient') || text.includes('forgotten') || text.includes('mystery')) {
    return 'mysterious, ancient';
  }
  if (text.includes('epic') || text.includes('legend') || text.includes('hero')) {
    return 'epic, heroic';
  }
  if (text.includes('peaceful') || text.includes('calm') || text.includes('serene')) {
    return 'peaceful, calm';
  }

  return 'atmospheric, mysterious';
};

/**
 * Determine music intensity based on player health
 */
const getIntensityFromHP = (currentHP?: number, maxHP?: number): string => {
  if (!currentHP || !maxHP) return 'moderate';

  const hpPercent = (currentHP / maxHP) * 100;

  if (hpPercent < 25) return 'tense, desperate, urgent';
  if (hpPercent < 50) return 'cautious, suspenseful';
  if (hpPercent < 75) return 'moderate, steady';
  return 'confident, exploratory';
};

/**
 * Analyze recent consequences to determine moral theme
 */
const getMoralTheme = (consequences: any[] = []): string => {
  if (consequences.length === 0) return '';

  const recent = consequences.slice(-5); // Last 5 choices
  const counts = {
    violent: 0,
    merciful: 0,
    clever: 0,
    diplomatic: 0,
    greedy: 0,
  };

  recent.forEach((c) => {
    if (c.type in counts) {
      counts[c.type as keyof typeof counts]++;
    }
  });

  const dominant = Object.entries(counts).reduce((max, [key, val]) =>
    val > max[1] ? [key, val] : max, ['', 0]
  )[0];

  const themes: Record<string, string> = {
    violent: 'aggressive, battle-hardened',
    merciful: 'compassionate, gentle',
    clever: 'cunning, tactical',
    diplomatic: 'peaceful, harmonious',
    greedy: 'ambitious, intense',
  };

  return themes[dominant] || '';
};

/**
 * Build room music prompt based on context
 */
const buildRoomMusicPrompt = async (context: MusicGenerationContext): Promise<string> => {
  let genre: string;
  let mood: string;

  // Use LLM to generate genre and mood if story context exists
  if (context.storyContext && context.storyContext.trim().length > 0) {
    const llmDescription = await generateMusicDescriptionWithLLM(context.storyContext);
    genre = llmDescription.genre;
    mood = llmDescription.mood;
  } else {
    // Fallback to keyword extraction or defaults
    genre = extractGenre(context.storyContext);
    mood = extractMood(context.storyContext);
  }

  const intensity = getIntensityFromHP(context.playerHP, context.maxHP);
  const moralTheme = getMoralTheme(context.recentConsequences);

  const roomDesc = context.currentRoom?.description || 'staging area';
  const roomType = context.currentRoom?.type || context.currentRoom?.biome || 'location';

  // Story mode adaptation
  let modeContext = '';
  if (context.storyMode === 'recreation') {
    modeContext = 'faithful to original story atmosphere';
  } else if (context.storyMode === 'continuation') {
    modeContext = 'evolved themes from original story';
  } else {
    modeContext = 'inspired by story themes';
  }

  const parts = [
    `${genre} music for ${roomType}.`,
    `${mood} atmosphere.`,
    `${intensity} pacing.`,
    moralTheme ? `${moralTheme} undertones.` : '',
    `Setting: ${roomDesc.slice(0, 50)}.`,
    modeContext,
    'MUST BE SEAMLESSLY LOOPABLE with perfect loop points.',
    'Short, tight loop. No fade in/out. Instrumental ambient game soundtrack.',
  ].filter(Boolean);

  return parts.join(' ');
};

/**
 * Build battle music prompt based on context
 */
const buildBattleMusicPrompt = async (context: MusicGenerationContext): Promise<string> => {
  let genre: string;

  // Use LLM to generate genre if story context exists
  if (context.storyContext && context.storyContext.trim().length > 0) {
    const llmDescription = await generateMusicDescriptionWithLLM(context.storyContext);
    genre = llmDescription.genre;
  } else {
    genre = extractGenre(context.storyContext);
  }

  const enemy = context.battleState?.enemy;

  if (!enemy) {
    return `${genre} combat music. Epic, intense, orchestral battle theme.`;
  }

  const enemyType = enemy.type || 'enemy';
  const enemyLevel = enemy.enemyLevel || 1;
  const characterClass = context.characterClass || 'hero';

  const intensity = enemyLevel >= 5 ? 'epic, overwhelming, boss battle' :
                    enemyLevel >= 3 ? 'intense, challenging' :
                    'tense, fast-paced';

  const parts = [
    `Music for ${genre} ${enemyType} battle.`,
    `${intensity} combat.`,
    `${characterClass} vs ${enemy.sprite || enemyType}.`,
    'Epic orchestral battle theme with dynamic percussion.',
    'Heroic, energetic, game soundtrack.',
    'SEAMLESSLY LOOPABLE. Short loop, no fade in/out, perfect loop points.',
  ];

  return parts.join(' ');
};

/**
 * Build story moment music prompt based on context
 */
const buildStoryMomentPrompt = async (context: MusicGenerationContext): Promise<string> => {
  let genre: string;
  let mood: string;

  // Use LLM to generate genre and mood if story context exists
  if (context.storyContext && context.storyContext.trim().length > 0) {
    const llmDescription = await generateMusicDescriptionWithLLM(context.storyContext);
    genre = llmDescription.genre;
    mood = llmDescription.mood;
  } else {
    genre = extractGenre(context.storyContext);
    mood = extractMood(context.storyContext);
  }

  const moralTheme = getMoralTheme(context.recentConsequences);

  const parts = [
    `${genre} cinematic music for story moment.`,
    `${mood} emotional tone.`,
    moralTheme ? `Reflecting ${moralTheme} journey.` : '',
    'Narrative, atmospheric, potentially with subtle vocals.',
    'Game cutscene soundtrack.',
    'SEAMLESSLY LOOPABLE with perfect loop points. Short loop, no fade in/out.',
  ].filter(Boolean);

  return parts.join(' ');
};

/**
 * Generate or retrieve cached music based on context
 */
export const getMusicForContext = async (
  context: MusicGenerationContext,
  audioContext: AudioContext,
  forceRegenerate: boolean = false
): Promise<AudioFile> => {
  // Build prompt based on audio context
  let prompt: string;
  let generator: (prompt: string) => Promise<AudioFile>;
  let cacheKey: string;

  switch (audioContext) {
    case 'room':
      prompt = await buildRoomMusicPrompt(context);
      generator = generateRoomMusic;
      cacheKey = `${context.currentRoom?.type || 'default'}_${context.roomCounter || 0}_${context.storyMode}`;
      break;

    case 'battle':
      prompt = await buildBattleMusicPrompt(context);
      generator = generateBattleMusic;
      cacheKey = `${context.battleState?.enemy.type || 'enemy'}_${context.battleState?.enemy.enemyLevel || 1}`;
      break;

    case 'story-moment':
      prompt = await buildStoryMomentPrompt(context);
      generator = generateStoryMusic;
      cacheKey = `story_${Date.now()}`; // Always unique for story moments
      break;

    case 'victory': {
      let genre: string;
      if (context.storyContext && context.storyContext.trim().length > 0) {
        const llmDescription = await generateMusicDescriptionWithLLM(context.storyContext);
        genre = llmDescription.genre;
      } else {
        genre = extractGenre(context.storyContext);
      }
      prompt = `${genre} victory fanfare. Triumphant, celebratory, heroic. Epic orchestral game soundtrack. SEAMLESSLY LOOPABLE, no fade in/out.`;
      generator = generateBattleMusic;
      cacheKey = 'victory';
      break;
    }

    case 'defeat': {
      let genre: string;
      if (context.storyContext && context.storyContext.trim().length > 0) {
        const llmDescription = await generateMusicDescriptionWithLLM(context.storyContext);
        genre = llmDescription.genre;
      } else {
        genre = extractGenre(context.storyContext);
      }
      prompt = `${genre} defeat music. Somber, melancholic, reflective. Game over soundtrack. SEAMLESSLY LOOPABLE, no fade in/out.`;
      generator = generateStoryMusic;
      cacheKey = 'defeat';
      break;
    }

    default:
      prompt = 'Ambient fantasy music for exploration. Mysterious, atmospheric. SEAMLESSLY LOOPABLE with perfect loop points, no fade in/out.';
      generator = generateRoomMusic;
      cacheKey = 'default';
  }

  // Check cache first (unless forced to regenerate)
  if (!forceRegenerate) {
    const cached = await audioCache.get(cacheKey, audioContext);
    if (cached) {
      return cached.audioFile;
    }
  }

  // Generate new music
  console.log(`[AudioService] Generating ${audioContext} music...`);
  const audioFile = await generator(prompt);

  // Cache the result (preload for room/battle music for instant playback)
  const shouldPreload = audioContext === 'room' || audioContext === 'battle';
  await audioCache.set(cacheKey, audioContext, audioFile, shouldPreload);

  return audioFile;
};

/**
 * Shorthand: Get music for room
 */
export const getRoomMusic = (context: MusicGenerationContext): Promise<AudioFile> => {
  return getMusicForContext(context, 'room');
};

/**
 * Shorthand: Get music for battle
 */
export const getBattleMusic = (context: MusicGenerationContext): Promise<AudioFile> => {
  return getMusicForContext(context, 'battle');
};

/**
 * Shorthand: Get music for story moment
 */
export const getStoryMomentMusic = (context: MusicGenerationContext): Promise<AudioFile> => {
  return getMusicForContext(context, 'story-moment');
};

/**
 * Get cache statistics
 */
export const getAudioCacheStats = () => {
  return audioCache.getStats();
};

/**
 * Clear audio cache
 */
export const clearAudioCache = () => {
  audioCache.clear();
};
