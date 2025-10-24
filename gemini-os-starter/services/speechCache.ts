/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SpeechFile, CachedSpeech, CharacterArchetype } from '../types/voice';
import { preloadSpeechBuffer } from './falTTSClient';

/**
 * Speech cache configuration
 */
interface SpeechCacheConfig {
  maxCacheSize: number; // Max number of cached speeches
  maxMemoryMB: number; // Max memory for audio buffers in MB
  preloadEnabled: boolean; // Whether to preload audio buffers
  ttlMinutes: number; // Time-to-live for cached items
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: SpeechCacheConfig = {
  maxCacheSize: 100, // Cache up to 100 speeches
  maxMemoryMB: 50, // Up to 50MB of audio buffers
  preloadEnabled: true,
  ttlMinutes: 30, // Cache items expire after 30 minutes
};

/**
 * Speech Cache Manager
 * Efficiently caches generated TTS audio to minimize API calls
 */
class SpeechCache {
  private cache: Map<string, CachedSpeech> = new Map();
  private config: SpeechCacheConfig;
  private currentMemoryBytes: number = 0;

  constructor(config: Partial<SpeechCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate cache key from text and character archetype
   */
  private generateKey(text: string, characterType?: CharacterArchetype, emotion?: string): string {
    // Normalize text (lowercase, trim, remove extra spaces)
    const normalizedText = text.toLowerCase().trim().replace(/\s+/g, ' ');

    // Create key from text + character type + emotion
    const parts = [normalizedText];
    if (characterType) parts.push(characterType);
    if (emotion) parts.push(emotion);

    return parts.join('::');
  }

  /**
   * Get cached speech if available
   */
  async get(
    text: string,
    characterType?: CharacterArchetype,
    emotion?: string
  ): Promise<CachedSpeech | null> {
    const key = this.generateKey(text, characterType, emotion);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if expired
    const now = Date.now();
    const age = (now - cached.speechFile.generatedAt) / 1000 / 60; // in minutes
    if (age > this.config.ttlMinutes) {
      console.log(`[SpeechCache] Cache expired for: "${text.slice(0, 30)}..."`);
      this.cache.delete(key);
      return null;
    }

    // Update access metadata
    cached.lastAccessed = now;
    cached.accessCount++;

    console.log(`[SpeechCache] Cache HIT for: "${text.slice(0, 30)}..." (accessed ${cached.accessCount} times)`);
    return cached;
  }

  /**
   * Get speech with multi-tier caching (memory → KV → generate)
   * KV stores URLs, not AudioBuffers
   */
  async getMultiTier(
    text: string,
    characterType?: CharacterArchetype,
    emotion?: string
  ): Promise<CachedSpeech | null> {
    // L1: Check in-memory cache first
    const memoryHit = await this.get(text, characterType, emotion);
    if (memoryHit) {
      console.log('[SpeechCache] L1 HIT (memory)');
      return memoryHit;
    }

    // L2: Check KV cache via API
    try {
      const context = characterType || 'default';
      const cacheKey = `${context}:${text}:${emotion || ''}`;
      const response = await fetch(`/api/cache/audio/${encodeURIComponent(cacheKey)}`);

      if (response.ok) {
        const data = await response.json();
        if (data.cached && data.data) {
          console.log('[SpeechCache] L2 HIT (KV)');

          // Reconstruct SpeechFile from cached URL
          const url = data.data as string;
          const speechFile: import('../types/voice').SpeechFile = {
            url,
            text,
            generatedAt: Date.now(),
            characterType,
          };

          // Store in memory for next time (with preloading)
          await this.set(speechFile, characterType, emotion, true);

          const cached = await this.get(text, characterType, emotion);
          return cached;
        }
      }
    } catch (error) {
      console.warn('[SpeechCache] KV lookup failed, falling back to local only:', error);
    }

    // No cache hit
    return null;
  }

  /**
   * Store speech in both memory and KV cache
   */
  async setMultiTier(
    speechFile: import('../types/voice').SpeechFile,
    characterType?: CharacterArchetype,
    emotion?: string,
    preload: boolean = true,
    saveToKV: boolean = true
  ): Promise<void> {
    // Always save to memory cache
    await this.set(speechFile, characterType, emotion, preload);

    // Optionally save URL to KV for cross-user sharing
    if (saveToKV) {
      try {
        const context = characterType || 'default';
        await fetch('/api/cache/audio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: speechFile.text,
            context,
            url: speechFile.url,
            emotion,
            ttl: this.config.ttlMinutes * 60, // Convert to seconds
          }),
        });

        console.log('[SpeechCache] Saved to KV cache');
      } catch (error) {
        console.warn('[SpeechCache] Failed to save to KV:', error);
        // Non-fatal - already saved to memory
      }
    }
  }

  /**
   * Store speech in cache
   */
  async set(
    speechFile: SpeechFile,
    characterType?: CharacterArchetype,
    emotion?: string,
    preload: boolean = true
  ): Promise<void> {
    const key = this.generateKey(speechFile.text, characterType, emotion);

    // Preload audio buffer if enabled
    let audioBuffer: AudioBuffer | undefined;
    if (preload && this.config.preloadEnabled) {
      try {
        audioBuffer = await preloadSpeechBuffer(speechFile.url);
        console.log(`[SpeechCache] Preloaded buffer for: "${speechFile.text.slice(0, 30)}..."`);
      } catch (error) {
        console.warn(`[SpeechCache] Failed to preload buffer:`, error);
      }
    }

    const cached: CachedSpeech = {
      cacheKey: key,
      speechFile,
      audioBuffer,
      lastAccessed: Date.now(),
      accessCount: 1,
      characterType,
    };

    // Check cache size limits
    this.evictIfNeeded();

    this.cache.set(key, cached);

    // Update memory tracking
    if (audioBuffer) {
      const bufferSize = audioBuffer.length * audioBuffer.numberOfChannels * 4; // 4 bytes per float32 sample
      this.currentMemoryBytes += bufferSize;
    }

    console.log(`[SpeechCache] Cached: "${speechFile.text.slice(0, 30)}..." (${this.cache.size} items, ${(this.currentMemoryBytes / 1024 / 1024).toFixed(2)} MB)`);
  }

  /**
   * Evict least recently used items if cache is full
   */
  private evictIfNeeded(): void {
    // Check cache size
    if (this.cache.size >= this.config.maxCacheSize) {
      this.evictLRU();
    }

    // Check memory size
    const maxMemoryBytes = this.config.maxMemoryMB * 1024 * 1024;
    while (this.currentMemoryBytes > maxMemoryBytes && this.cache.size > 0) {
      this.evictLRU();
    }
  }

  /**
   * Evict least recently used cache entry
   */
  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, cached] of this.cache.entries()) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const cached = this.cache.get(oldestKey)!;
      this.cache.delete(oldestKey);

      // Update memory tracking
      if (cached.audioBuffer) {
        const bufferSize = cached.audioBuffer.length * cached.audioBuffer.numberOfChannels * 4;
        this.currentMemoryBytes -= bufferSize;
      }

      console.log(`[SpeechCache] Evicted LRU: "${cached.speechFile.text.slice(0, 30)}..."`);
    }
  }

  /**
   * Check if speech is cached
   */
  has(text: string, characterType?: CharacterArchetype, emotion?: string): boolean {
    const key = this.generateKey(text, characterType, emotion);
    return this.cache.has(key);
  }

  /**
   * Clear all cached speeches
   */
  clear(): void {
    this.cache.clear();
    this.currentMemoryBytes = 0;
    console.log('[SpeechCache] Cache cleared');
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now();
    let clearedCount = 0;

    for (const [key, cached] of this.cache.entries()) {
      const age = (now - cached.speechFile.generatedAt) / 1000 / 60;
      if (age > this.config.ttlMinutes) {
        // Update memory tracking
        if (cached.audioBuffer) {
          const bufferSize = cached.audioBuffer.length * cached.audioBuffer.numberOfChannels * 4;
          this.currentMemoryBytes -= bufferSize;
        }

        this.cache.delete(key);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      console.log(`[SpeechCache] Cleared ${clearedCount} expired entries`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const entries = Array.from(this.cache.values());
    const totalAccesses = entries.reduce((sum, c) => sum + c.accessCount, 0);
    const avgAccessCount = entries.length > 0 ? totalAccesses / entries.length : 0;

    // Count by character type
    const byCharacterType: Record<string, number> = {};
    entries.forEach((cached) => {
      if (cached.characterType) {
        byCharacterType[cached.characterType] = (byCharacterType[cached.characterType] || 0) + 1;
      }
    });

    return {
      totalEntries: this.cache.size,
      memoryUsedMB: (this.currentMemoryBytes / 1024 / 1024).toFixed(2),
      maxCacheSize: this.config.maxCacheSize,
      maxMemoryMB: this.config.maxMemoryMB,
      avgAccessCount: avgAccessCount.toFixed(2),
      byCharacterType,
      preloadEnabled: this.config.preloadEnabled,
      ttlMinutes: this.config.ttlMinutes,
    };
  }

  /**
   * Preload common phrases for instant playback
   * Useful for frequently used dialogue
   */
  async preloadCommonPhrases(
    phrases: Array<{
      text: string;
      speechFile: SpeechFile;
      characterType?: CharacterArchetype;
      emotion?: string;
    }>
  ): Promise<void> {
    console.log(`[SpeechCache] Preloading ${phrases.length} common phrases...`);

    for (const phrase of phrases) {
      await this.set(phrase.speechFile, phrase.characterType, phrase.emotion, true);
    }

    console.log('[SpeechCache] Preload complete');
  }

  /**
   * Get most frequently accessed speeches
   */
  getMostAccessed(limit: number = 10): CachedSpeech[] {
    return Array.from(this.cache.values())
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  /**
   * Update cache configuration
   */
  updateConfig(config: Partial<SpeechCacheConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[SpeechCache] Configuration updated:', this.config);

    // Evict if needed with new limits
    this.evictIfNeeded();
  }
}

/**
 * Global speech cache instance
 */
export const speechCache = new SpeechCache();

/**
 * Initialize speech cache with custom config
 */
export const initializeSpeechCache = (config: Partial<SpeechCacheConfig>): void => {
  speechCache.updateConfig(config);
};

/**
 * Periodically clear expired cache entries
 */
setInterval(() => {
  speechCache.clearExpired();
}, 5 * 60 * 1000); // Every 5 minutes
