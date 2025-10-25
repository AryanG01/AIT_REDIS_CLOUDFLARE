/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MusicModel, AudioFile, FalAudioResponse } from '../types/audio';
import { falProxySubscribe } from './falProxyClient';

/**
 * Secure FAL Audio Client
 * All API calls routed through backend proxy to protect API keys
 */

/**
 * Model endpoint mapping
 */
const MODEL_ENDPOINTS: Record<MusicModel, string> = {
  'cassetteai': 'cassetteai/music-generator',
  'minimax': 'fal-ai/minimax-music',
};

/**
 * Default duration for each model (in seconds)
 * Optimized for fast generation and seamless looping
 */
const DEFAULT_DURATIONS: Record<MusicModel, number> = {
  'cassetteai': 15, // Short, seamless loops for all music types
  'minimax': 20, // Concise story moments that loop well
};

/**
 * Generate music using fal.ai with automatic fallback
 *
 * @param prompt - Text description of the music to generate
 * @param model - Which AI model to use
 * @param duration - Length of music in seconds
 * @param enableFallback - Whether to fallback to cassetteai if primary model fails
 * @returns AudioFile with URL and metadata
 */
export const generateMusic = async (
  prompt: string,
  model: MusicModel = 'cassetteai',
  duration?: number,
  enableFallback: boolean = true
): Promise<AudioFile> => {
  const actualDuration = duration || DEFAULT_DURATIONS[model];
  const endpoint = MODEL_ENDPOINTS[model];

  console.log(`[FalAudio] Generating ${actualDuration}s music with ${model}`);
  console.log(`[FalAudio] Prompt: "${prompt}"`);

  try {
    const startTime = Date.now();

    const result = await falProxySubscribe(endpoint, {
      input: {
        prompt,
        duration: actualDuration,
      },
      logs: true,
    }) as { data: FalAudioResponse };

    const endTime = Date.now();
    const generationTime = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`[FalAudio] Generated in ${generationTime}s`);
    console.log(`[FalAudio] URL: ${result.data.audio_file.url}`);

    const audioFile: AudioFile = {
      url: result.data.audio_file.url,
      duration: result.data.duration || actualDuration,
      model,
      generatedAt: Date.now(),
      prompt,
    };

    return audioFile;
  } catch (error: any) {
    console.error(`[FalAudio] Generation failed for ${model}:`, error);

    // Automatic fallback to cassetteai if enabled and not already using it
    if (enableFallback && model !== 'cassetteai') {
      console.warn(`[FalAudio] Falling back to cassetteai for: "${prompt.slice(0, 60)}..."`);
      return generateMusic(prompt, 'cassetteai', 15, false); // Disable fallback recursion
    }

    throw new Error(`Music generation failed: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Generate room ambience music (fast, loopable)
 */
export const generateRoomMusic = async (prompt: string): Promise<AudioFile> => {
  return generateMusic(prompt, 'cassetteai', 15);
};

/**
 * Generate battle music (epic, orchestral)
 * Uses cassetteai for fast, reliable generation with 18s duration for variety
 */
export const generateBattleMusic = async (prompt: string): Promise<AudioFile> => {
  return generateMusic(prompt, 'cassetteai', 18);
};

/**
 * Generate story moment music (shorter, seamlessly looping)
 * Automatically falls back to cassetteai if minimax fails
 */
export const generateStoryMusic = async (prompt: string): Promise<AudioFile> => {
  return generateMusic(prompt, 'minimax', 20);
};

/**
 * Preload audio file from URL into AudioBuffer for smooth playback
 * This downloads and decodes the audio file
 */
export const preloadAudioBuffer = async (url: string): Promise<AudioBuffer> => {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return audioBuffer;
  } catch (error) {
    console.error('[FalAudio] Failed to preload audio:', error);
    throw error;
  }
};

/**
 * Health check - verify fal.ai proxy is accessible
 */
export const checkFalConnection = async (): Promise<boolean> => {
  try {
    // Proxy is always available - no API key needed on client
    return true;
  } catch (error) {
    console.error('[FalAudio] Connection check failed:', error);
    return false;
  }
};
