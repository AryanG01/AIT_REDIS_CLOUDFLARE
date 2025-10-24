/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * KV Cache Adapter for AI-generated content
 * Provides a simple interface for caching sprites, rooms, and audio in Cloudflare KV
 */

import type { CachedSprite } from '../services/spriteCache';
import type { Room } from '../types';

/**
 * TTL constants (in seconds)
 */
export const CacheTTL = {
  SPRITE: 7 * 24 * 60 * 60, // 7 days
  ROOM: 24 * 60 * 60, // 24 hours
  AUDIO: 30 * 60, // 30 minutes
  SCENE: 7 * 24 * 60 * 60, // 7 days
} as const;

/**
 * Sprite Cache Manager for KV
 */
export class SpriteCacheKV {
  constructor(private kv: KVNamespace) {}

  /**
   * Generate cache key for sprite
   */
  private getCacheKey(prompt: string, type: string, biome?: string): string {
    const normalized = `${type}:${biome || 'default'}:${prompt.toLowerCase().trim()}`;
    return this.hashString(normalized);
  }

  /**
   * Get sprite from KV cache
   */
  async get(prompt: string, type: string, biome?: string): Promise<CachedSprite | null> {
    const key = this.getCacheKey(prompt, type, biome);
    const cached = await this.kv.get(key, 'json');

    if (!cached) return null;

    // Type assertion for KV response
    return cached as CachedSprite;
  }

  /**
   * Store sprite in KV cache
   */
  async set(sprite: CachedSprite, prompt: string, type: string, biome?: string): Promise<void> {
    const key = this.getCacheKey(prompt, type, biome);

    await this.kv.put(key, JSON.stringify(sprite), {
      expirationTtl: CacheTTL.SPRITE,
    });
  }

  /**
   * Check if sprite exists in cache
   */
  async has(prompt: string, type: string, biome?: string): Promise<boolean> {
    const cached = await this.get(prompt, type, biome);
    return cached !== null;
  }

  /**
   * Delete sprite from cache
   */
  async delete(prompt: string, type: string, biome?: string): Promise<void> {
    const key = this.getCacheKey(prompt, type, biome);
    await this.kv.delete(key);
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sprite_${Math.abs(hash).toString(36)}`;
  }
}

/**
 * Room Cache Manager for KV
 */
export class RoomCacheKV {
  constructor(private kv: KVNamespace) {}

  /**
   * Generate cache key for room
   */
  private getCacheKey(storySeed: number, roomId: string): string {
    return `room:${storySeed}:${roomId}`;
  }

  /**
   * Get room from KV cache
   */
  async get(storySeed: number, roomId: string): Promise<Room | null> {
    const key = this.getCacheKey(storySeed, roomId);
    const cached = await this.kv.get(key, 'json');

    if (!cached) return null;

    return cached as Room;
  }

  /**
   * Store room in KV cache
   */
  async set(storySeed: number, room: Room): Promise<void> {
    const key = this.getCacheKey(storySeed, room.id);

    await this.kv.put(key, JSON.stringify(room), {
      expirationTtl: CacheTTL.ROOM,
    });
  }

  /**
   * Store multiple rooms at once
   */
  async setMany(storySeed: number, rooms: Room[]): Promise<void> {
    const promises = rooms.map(room => this.set(storySeed, room));
    await Promise.all(promises);
  }

  /**
   * Check if room exists in cache
   */
  async has(storySeed: number, roomId: string): Promise<boolean> {
    const cached = await this.get(storySeed, roomId);
    return cached !== null;
  }

  /**
   * Delete room from cache
   */
  async delete(storySeed: number, roomId: string): Promise<void> {
    const key = this.getCacheKey(storySeed, roomId);
    await this.kv.delete(key);
  }

  /**
   * Clear all rooms for a story seed
   * Note: KV doesn't support prefix deletion, so this lists and deletes
   */
  async clearSeed(storySeed: number): Promise<void> {
    // List all keys with prefix
    const prefix = `room:${storySeed}:`;
    const list = await this.kv.list({ prefix });

    // Delete all matching keys
    const deletePromises = list.keys.map(key => this.kv.delete(key.name));
    await Promise.all(deletePromises);
  }
}

/**
 * Audio Cache Manager for KV
 * Stores URLs to generated audio, not the audio buffers themselves
 */
export class AudioCacheKV {
  constructor(private kv: KVNamespace) {}

  /**
   * Generate cache key for audio
   */
  private getCacheKey(text: string, context: string, emotion?: string): string {
    const normalized = text.toLowerCase().trim().replace(/\s+/g, ' ');
    const parts = [context, normalized];
    if (emotion) parts.push(emotion);

    return this.hashString(parts.join('::'));
  }

  /**
   * Get audio URL from cache
   */
  async get(text: string, context: string, emotion?: string): Promise<string | null> {
    const key = this.getCacheKey(text, context, emotion);
    const url = await this.kv.get(key, 'text');

    return url;
  }

  /**
   * Store audio URL in cache
   */
  async set(text: string, context: string, url: string, emotion?: string, ttl: number = CacheTTL.AUDIO): Promise<void> {
    const key = this.getCacheKey(text, context, emotion);

    await this.kv.put(key, url, {
      expirationTtl: ttl,
    });
  }

  /**
   * Check if audio exists in cache
   */
  async has(text: string, context: string, emotion?: string): Promise<boolean> {
    const cached = await this.get(text, context, emotion);
    return cached !== null;
  }

  /**
   * Delete audio from cache
   */
  async delete(text: string, context: string, emotion?: string): Promise<void> {
    const key = this.getCacheKey(text, context, emotion);
    await this.kv.delete(key);
  }

  /**
   * Simple hash function for cache keys
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `audio_${Math.abs(hash).toString(36)}`;
  }
}

/**
 * Generic KV Cache helper
 */
export class GenericCacheKV {
  constructor(private kv: KVNamespace) {}

  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const value = await this.kv.get(key, 'json');
    return value as T | null;
  }

  /**
   * Set value in cache with TTL
   */
  async set<T>(key: string, value: T, ttl: number): Promise<void> {
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: ttl,
    });
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    await this.kv.delete(key);
  }

  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    const value = await this.kv.get(key);
    return value !== null;
  }
}

/**
 * Multi-tier cache strategy helper
 * Checks memory → KV → generates new content
 */
export interface CacheStrategy<T> {
  /**
   * Check in-memory cache (L1)
   */
  checkMemory: () => T | null;

  /**
   * Check KV cache (L2)
   */
  checkKV: () => Promise<T | null>;

  /**
   * Generate new content (fallback)
   */
  generate: () => Promise<T>;

  /**
   * Save to both memory and KV
   */
  saveToCache: (data: T) => Promise<void>;
}

/**
 * Execute multi-tier cache lookup
 */
export async function multiTierCacheLookup<T>(strategy: CacheStrategy<T>): Promise<T> {
  // L1: Check memory
  const memoryResult = strategy.checkMemory();
  if (memoryResult) {
    console.log('[Cache] L1 HIT (memory)');
    return memoryResult;
  }

  // L2: Check KV
  const kvResult = await strategy.checkKV();
  if (kvResult) {
    console.log('[Cache] L2 HIT (KV)');
    // Save to memory for next time
    await strategy.saveToCache(kvResult);
    return kvResult;
  }

  // L3: Generate new
  console.log('[Cache] MISS - generating new content');
  const generated = await strategy.generate();

  // Save to both caches
  await strategy.saveToCache(generated);

  return generated;
}
