/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TTSModel, VoiceProfile, SpeechFile, FalTTSResponse } from '../types/voice';
import { falProxySubscribe } from './falProxyClient';

/**
 * Secure FAL TTS Client
 * All API calls routed through backend proxy to protect API keys
 */

/**
 * Model endpoint mapping for TTS
 */
const TTS_MODEL_ENDPOINTS: Record<TTSModel, string> = {
  'dia-tts': 'fal-ai/dia-tts',
  'minimax-speech': 'fal-ai/minimax/speech-02-hd',
  'playai-tts': 'fal-ai/playai/tts/v3',
  'vibevoice': 'fal-ai/vibevoice',
  'elevenlabs': 'fal-ai/elevenlabs/tts/turbo-v2.5', // Fast, premium quality
};

/**
 * Default voice IDs for MiniMax (these are example IDs - actual IDs from fal.ai)
 */
const MINIMAX_VOICE_IDS = {
  hero_male: 'male-qn-qingse',
  hero_female: 'female-shaonv',
  villain_male: 'male-qn-jingying',
  villain_female: 'female-yujie',
  merchant: 'male-qn-daxuesheng',
  guide: 'female-tianmei',
  narrator_male: 'male-qn-qingse',
  narrator_female: 'female-tianmei',
  enemy: 'male-qn-jingying',
  mystic: 'female-yujie',
};

/**
 * ElevenLabs voice IDs
 *
 * IMPORTANT: turbo-v2.5 only supports 5 voices!
 * ✅ Supported: Callum, Adam, Charlie, George, Rachel
 * ❌ NOT supported: Josh, Bella, Sam, Glinda, Domi, Aria, Emily
 *
 * For other voices, use 'elevenlabs': 'fal-ai/elevenlabs/tts/multilingual-v2'
 */
export const ELEVENLABS_VOICES = {
  // ✅ SUPPORTED by turbo-v2.5 - Male voices
  adam: 'Adam',         // Deep, narrative
  charlie: 'Charlie',   // Casual, conversational
  george: 'George',     // Warm, friendly
  callum: 'Callum',    // Video game characters

  // ✅ SUPPORTED by turbo-v2.5 - Female voices
  rachel: 'Rachel',     // Calm, narrative (default)

  // ❌ NOT SUPPORTED by turbo-v2.5 (causes 400 errors)
  sam: 'Sam',          // Dynamic, versatile - NOT IN TURBO
  bella: 'Bella',      // Soft, friendly - NOT IN TURBO
  josh: 'Josh',        // Narrative, storytelling - NOT IN TURBO
  glinda: 'Glinda',    // Witch-like, mysterious - NOT IN TURBO
  domi: 'Domi',        // Strong, confident - NOT IN TURBO
  aria: 'Aria',        // Expressive, news - NOT IN TURBO
  emily: 'Emily',      // Calm, soothing - NOT IN TURBO
};

/**
 * Generate voice description for Dia TTS based on profile
 */
const buildDiaVoiceDescription = (profile: VoiceProfile): string => {
  const parts: string[] = [];

  // Base description
  if (profile.description) {
    parts.push(profile.description);
  } else {
    parts.push('Clear, expressive voice');
  }

  // Add emotion
  if (profile.emotion) {
    const emotionDescriptions: Record<string, string> = {
      neutral: 'calm and neutral',
      happy: 'cheerful and upbeat',
      sad: 'melancholic and somber',
      angry: 'intense and forceful',
      fearful: 'nervous and uncertain',
      surprised: 'shocked and animated',
      mysterious: 'enigmatic and intriguing',
      heroic: 'confident and inspiring',
      menacing: 'dark and threatening',
      friendly: 'warm and welcoming',
      sarcastic: 'witty and ironic',
    };
    parts.push(`with ${emotionDescriptions[profile.emotion] || 'neutral'} tone`);
  }

  return parts.join(', ');
};

/**
 * Generate speech using fal.ai TTS
 *
 * @param text - The text to convert to speech
 * @param voiceProfile - Voice configuration
 * @returns SpeechFile with URL and metadata
 */
export const generateSpeech = async (
  text: string,
  voiceProfile: VoiceProfile
): Promise<SpeechFile> => {
  const model = voiceProfile.model;
  const endpoint = TTS_MODEL_ENDPOINTS[model];

  console.log(`[FalTTS] Generating speech with ${model}`);
  console.log(`[FalTTS] Text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);

  try {
    const startTime = Date.now();
    let result: { data: FalTTSResponse };

    switch (model) {
      case 'dia-tts': {
        // Dia TTS - emotion-aware dialogue generation
        result = await falProxySubscribe(endpoint, {
          input: {
            text,
            audio_conditioning: voiceProfile.description
              ? { description: buildDiaVoiceDescription(voiceProfile) }
              : undefined,
          },
          logs: true,
        }) as { data: FalTTSResponse };
        break;
      }

      case 'minimax-speech': {
        // MiniMax - high quality with voice selection
        result = await falProxySubscribe(endpoint, {
          input: {
            text,
            voice_id: voiceProfile.voiceId || MINIMAX_VOICE_IDS.hero_male,
            speed: voiceProfile.speed || 1.0,
            vol: 1.0, // Volume
            pitch: voiceProfile.pitch || 0,
          },
          logs: true,
        }) as { data: FalTTSResponse };
        break;
      }

      case 'playai-tts': {
        // PlayAI - fast and multilingual
        result = await falProxySubscribe(endpoint, {
          input: {
            text,
            voice: voiceProfile.voiceId || 'en-US-Neural2-A',
            speed: voiceProfile.speed || 1.0,
            emotion: voiceProfile.emotion || 'neutral',
          },
          logs: true,
        }) as { data: FalTTSResponse };
        break;
      }

      case 'vibevoice': {
        // VibeVoice - expressive multi-voice
        result = await falProxySubscribe(endpoint, {
          input: {
            text,
            voice_preset: voiceProfile.voiceId || 'default',
            speed: voiceProfile.speed || 1.0,
            style: voiceProfile.style || 0.5,
          },
          logs: true,
        }) as { data: FalTTSResponse };
        break;
      }

      case 'elevenlabs': {
        // ElevenLabs Turbo v2.5 - Fast, premium quality
        // Only include parameters that the API accepts
        const elevenLabsInput = {
          text,
          voice: voiceProfile.voiceId || ELEVENLABS_VOICES.rachel,
          stability: voiceProfile.stability || 0.5,
          similarity_boost: 0.75,
          speed: voiceProfile.speed || 1.0,
          // Note: turbo-v2.5 doesn't support 'style' parameter
        };

        console.log('[FalTTS] ElevenLabs Request:', {
          endpoint,
          input: elevenLabsInput,
          voiceProfile: {
            model: voiceProfile.model,
            voiceId: voiceProfile.voiceId,
            stability: voiceProfile.stability,
            speed: voiceProfile.speed,
            emotion: voiceProfile.emotion,
          }
        });

        result = await falProxySubscribe(endpoint, {
          input: elevenLabsInput,
          logs: true,
        }) as { data: FalTTSResponse };
        break;
      }

      default:
        throw new Error(`Unsupported TTS model: ${model}`);
    }

    const endTime = Date.now();
    const generationTime = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`[FalTTS] Generated in ${generationTime}s`);
    console.log(`[FalTTS] Raw result:`, result);
    console.log(`[FalTTS] Result.data:`, result.data);

    // Parse response based on actual structure
    let audioUrl: string;
    let duration: number;

    // Try different response structures
    // ElevenLabs uses result.data.audio.url (most common)
    if (result.data.audio?.url) {
      // ElevenLabs structure
      audioUrl = result.data.audio.url;
      duration = result.data.duration || 5;
    } else if (result.data.audio_file?.url) {
      // Some models use audio_file
      audioUrl = result.data.audio_file.url;
      duration = result.data.duration || 5;
    } else if (typeof result.data === 'object' && 'url' in result.data) {
      // Direct URL in data
      audioUrl = (result.data as any).url;
      duration = (result.data as any).duration || 5;
    } else if (result.data.audio_url) {
      // URL with different field name
      audioUrl = result.data.audio_url;
      duration = result.data.duration || 5;
    } else {
      // Log full structure and throw error
      console.error('[FalTTS] Unexpected response structure:', JSON.stringify(result, null, 2));
      throw new Error('Could not find audio URL in response. Check console for full response structure.');
    }

    console.log(`[FalTTS] Audio URL: ${audioUrl}`);

    const speechFile: SpeechFile = {
      url: audioUrl,
      duration,
      model,
      generatedAt: Date.now(),
      text,
      voiceProfile,
    };

    return speechFile;
  } catch (error: any) {
    console.error(`[FalTTS] Generation failed for ${model}:`, error);

    throw new Error(`Speech generation failed: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Generate speech with Dia TTS (emotion-aware)
 */
export const generateDiaSpeech = async (
  text: string,
  emotion?: string,
  description?: string
): Promise<SpeechFile> => {
  const profile: VoiceProfile = {
    model: 'dia-tts',
    emotion: emotion as any,
    description: description || 'Clear, expressive character voice',
  };
  return generateSpeech(text, profile);
};

/**
 * Generate speech with MiniMax (high quality)
 */
export const generateMinimaxSpeech = async (
  text: string,
  voiceId?: string,
  speed?: number
): Promise<SpeechFile> => {
  const profile: VoiceProfile = {
    model: 'minimax-speech',
    voiceId: voiceId || MINIMAX_VOICE_IDS.hero_male,
    speed: speed || 1.0,
  };
  return generateSpeech(text, profile);
};

/**
 * Generate speech with PlayAI (fast)
 */
export const generatePlayAISpeech = async (
  text: string,
  emotion?: string,
  speed?: number
): Promise<SpeechFile> => {
  const profile: VoiceProfile = {
    model: 'playai-tts',
    emotion: emotion as any,
    speed: speed || 1.0,
  };
  return generateSpeech(text, profile);
};

/**
 * Generate speech with ElevenLabs (premium quality, streaming support)
 */
export const generateElevenLabsSpeech = async (
  text: string,
  voiceId?: string,
  speed?: number,
  stability?: number
): Promise<SpeechFile> => {
  const profile: VoiceProfile = {
    model: 'elevenlabs',
    voiceId: voiceId || ELEVENLABS_VOICES.rachel,
    speed: speed || 1.0,
    stability: stability || 0.5,
  };
  return generateSpeech(text, profile);
};

/**
 * Stream speech generation with ElevenLabs
 * Returns audio URL as soon as generation completes
 *
 * NOTE: While ElevenLabs supports true streaming, fal.ai's implementation
 * currently returns the complete audio file. This function uses the stream
 * API but behaves similarly to subscribe() for now.
 *
 * @param text - Text to convert to speech
 * @param voiceProfile - Voice configuration
 * @param onProgress - Optional callback for progress updates
 * @returns SpeechFile with URL and metadata
 */
export const generateSpeechStreaming = async (
  text: string,
  voiceProfile: VoiceProfile,
  onProgress?: (progress: number) => void
): Promise<SpeechFile> => {
  const endpoint = TTS_MODEL_ENDPOINTS[voiceProfile.model];

  console.log(`[FalTTS] Streaming speech with ${voiceProfile.model}`);
  console.log(`[FalTTS] Text: "${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"`);

  try {
    const startTime = Date.now();

    // Build input based on model
    let input: any = { text };

    if (voiceProfile.model === 'elevenlabs') {
      // ElevenLabs Turbo v2.5 - only include supported parameters
      input = {
        text,
        voice: voiceProfile.voiceId || ELEVENLABS_VOICES.rachel,
        stability: voiceProfile.stability || 0.5,
        similarity_boost: 0.75,
        speed: voiceProfile.speed || 1.0,
        // Note: turbo-v2.5 doesn't support 'style' parameter
      };
    }

    // Use stream API
    const stream = await fal.stream(endpoint, {
      input,
    });

    let eventCount = 0;
    // Process stream events
    for await (const event of stream) {
      eventCount++;
      console.log(`[FalTTS] Stream event ${eventCount}:`, event);

      // Update progress if callback provided
      if (onProgress && event.type === 'progress') {
        onProgress((event as any).progress || 0);
      }
    }

    // Get final result
    const result = await stream.done();

    const endTime = Date.now();
    const generationTime = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`[FalTTS] Stream completed in ${generationTime}s`);
    console.log(`[FalTTS] Result:`, result);

    // Parse response (same flexible parsing as non-streaming)
    let audioUrl: string;
    let duration: number;

    const data = result.data || result;

    // ElevenLabs uses data.audio.url (most common)
    if (data.audio?.url) {
      // ElevenLabs structure
      audioUrl = data.audio.url;
      duration = data.duration || 5;
    } else if (data.audio_file?.url) {
      // Some models use audio_file
      audioUrl = data.audio_file.url;
      duration = data.duration || 5;
    } else if (typeof data === 'object' && 'url' in data) {
      // Direct URL in data
      audioUrl = (data as any).url;
      duration = (data as any).duration || 5;
    } else if (data.audio_url) {
      // URL with different field name
      audioUrl = data.audio_url;
      duration = data.duration || 5;
    } else {
      console.error('[FalTTS] Unexpected streaming response:', JSON.stringify(result, null, 2));
      throw new Error('Could not find audio URL in streaming response');
    }

    console.log(`[FalTTS] Stream audio URL: ${audioUrl}`);

    const speechFile: SpeechFile = {
      url: audioUrl,
      duration,
      model: voiceProfile.model,
      generatedAt: Date.now(),
      text,
      voiceProfile,
    };

    return speechFile;
  } catch (error: any) {
    console.error(`[FalTTS] Streaming failed for ${voiceProfile.model}:`, error);

    throw new Error(`Speech streaming failed: ${error.message || 'Unknown error'}`);
  }
};

/**
 * Preload speech audio from URL into AudioBuffer
 */
export const preloadSpeechBuffer = async (url: string): Promise<AudioBuffer> => {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();

    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    return audioBuffer;
  } catch (error) {
    console.error('[FalTTS] Failed to preload speech:', error);
    throw error;
  }
};

/**
 * Export voice ID mappings for configuration
 */
export { MINIMAX_VOICE_IDS };
