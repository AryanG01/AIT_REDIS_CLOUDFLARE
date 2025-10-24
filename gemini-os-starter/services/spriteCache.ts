/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */

export interface CachedSprite {
  url: string;
  prompt: string;
  type: 'character' | 'enemy' | 'npc' | 'item';
  fallbackEmoji: string;
  timestamp: number;
  biome?: string;
  storyContext?: string;
}

export interface SpriteCache {
  [key: string]: CachedSprite;
}

const CACHE_KEY = 'gemini_os_sprite_cache';
const MAX_CACHE_SIZE = 200;
const CACHE_EXPIRY_DAYS = 7;

class SpriteCacheService {
  private cache: SpriteCache = {};
  private isInitialized = false;

  initialize(): void {
    this.loadFromLocalStorage();
    this.isInitialized = true;
  }

  getCacheKey(prompt: string, type: string, biome?: string): string {
    const normalized = `${type}:${biome || 'default'}:${prompt.toLowerCase().trim()}`;
    return this.hashString(normalized);
  }

  getSprite(prompt: string, type: CachedSprite['type'], biome?: string): CachedSprite | null {
    if (!this.isInitialized) this.initialize();

    const key = this.getCacheKey(prompt, type, biome);
    const cached = this.cache[key];

    if (!cached) return null;

    if (this.isExpired(cached)) {
      delete this.cache[key];
      this.saveToLocalStorage();
      return null;
    }

    return cached;
  }

  /**
   * Get sprite with multi-tier caching (memory → KV → generate)
   * This is an async version that checks KV cache if memory cache misses
   */
  async getSpriteMultiTier(prompt: string, type: CachedSprite['type'], biome?: string): Promise<CachedSprite | null> {
    // L1: Check in-memory cache first
    const memoryHit = this.getSprite(prompt, type, biome);
    if (memoryHit) {
      console.log('[SpriteCache] L1 HIT (memory)');
      return memoryHit;
    }

    // L2: Check KV cache via API
    try {
      const cacheKey = `${prompt}:${type}:${biome || ''}`;
      const response = await fetch(`/api/cache/sprite/${encodeURIComponent(cacheKey)}`);

      if (response.ok) {
        const data = await response.json();
        if (data.cached && data.data) {
          console.log('[SpriteCache] L2 HIT (KV)');

          // Store in memory for next time
          const sprite = data.data as CachedSprite;
          this.setSprite(prompt, type, sprite.url, sprite.fallbackEmoji, biome, sprite.storyContext);

          return sprite;
        }
      }
    } catch (error) {
      console.warn('[SpriteCache] KV lookup failed, falling back to local only:', error);
    }

    // No cache hit
    return null;
  }

  /**
   * Set sprite and optionally save to KV cache
   */
  async setSpriteMultiTier(
    prompt: string,
    type: CachedSprite['type'],
    url: string,
    fallbackEmoji: string,
    biome?: string,
    storyContext?: string,
    saveToKV: boolean = true
  ): Promise<void> {
    // Always save to memory + localStorage
    this.setSprite(prompt, type, url, fallbackEmoji, biome, storyContext);

    // Optionally save to KV for cross-user sharing
    if (saveToKV) {
      try {
        const sprite: CachedSprite = {
          url,
          prompt,
          type,
          fallbackEmoji,
          timestamp: Date.now(),
          biome,
          storyContext,
        };

        await fetch('/api/cache/sprite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sprite,
            prompt,
            spriteType: type,
            biome,
          }),
        });

        console.log('[SpriteCache] Saved to KV cache');
      } catch (error) {
        console.warn('[SpriteCache] Failed to save to KV:', error);
        // Non-fatal - already saved to local cache
      }
    }
  }

  setSprite(
    prompt: string,
    type: CachedSprite['type'],
    url: string,
    fallbackEmoji: string,
    biome?: string,
    storyContext?: string
  ): void {
    if (!this.isInitialized) this.initialize();

    const key = this.getCacheKey(prompt, type, biome);
    
    this.cache[key] = {
      url,
      prompt,
      type,
      fallbackEmoji,
      timestamp: Date.now(),
      biome,
      storyContext,
    };

    this.pruneCache();
    this.saveToLocalStorage();
  }

  getSpriteOrFallback(
    prompt: string,
    type: CachedSprite['type'],
    fallbackEmoji: string,
    biome?: string
  ): { url: string | null; emoji: string } {
    const cached = this.getSprite(prompt, type, biome);
    
    if (cached) {
      return { url: cached.url, emoji: fallbackEmoji };
    }

    return { url: null, emoji: fallbackEmoji };
  }

  hasCachedSprite(prompt: string, type: CachedSprite['type'], biome?: string): boolean {
    return this.getSprite(prompt, type, biome) !== null;
  }

  clearCache(): void {
    this.cache = {};
    this.saveToLocalStorage();
  }

  getCacheStats(): {
    totalSprites: number;
    byType: Record<string, number>;
    oldestEntry: number | null;
    cacheSize: number;
  } {
    const sprites = Object.values(this.cache);
    const byType: Record<string, number> = {};

    sprites.forEach(sprite => {
      byType[sprite.type] = (byType[sprite.type] || 0) + 1;
    });

    const oldestEntry = sprites.length > 0
      ? Math.min(...sprites.map(s => s.timestamp))
      : null;

    return {
      totalSprites: sprites.length,
      byType,
      oldestEntry,
      cacheSize: this.estimateCacheSize(),
    };
  }

  exportCache(): string {
    return JSON.stringify(this.cache, null, 2);
  }

  importCache(json: string): boolean {
    try {
      const imported = JSON.parse(json);
      this.cache = imported;
      this.saveToLocalStorage();
      return true;
    } catch (error) {
      console.error('[SpriteCache] Failed to import cache:', error);
      return false;
    }
  }

  private isExpired(sprite: CachedSprite): boolean {
    const now = Date.now();
    const expiryTime = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    return (now - sprite.timestamp) > expiryTime;
  }

  private pruneCache(): void {
    const sprites = Object.entries(this.cache);

    if (sprites.length <= MAX_CACHE_SIZE) return;

    sprites.sort((a, b) => a[1].timestamp - b[1].timestamp);

    const toRemove = sprites.length - MAX_CACHE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      delete this.cache[sprites[i][0]];
    }
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `sprite_${Math.abs(hash).toString(36)}`;
  }

  private estimateCacheSize(): number {
    const json = JSON.stringify(this.cache);
    return new Blob([json]).size;
  }

  private loadFromLocalStorage(): void {
    try {
      const stored = localStorage.getItem(CACHE_KEY);
      if (stored) {
        this.cache = JSON.parse(stored);
        this.cleanExpiredEntries();
      }
    } catch (error) {
      console.error('[SpriteCache] Failed to load from localStorage:', error);
      this.cache = {};
    }
  }

  private saveToLocalStorage(): void {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache));
    } catch (error) {
      console.error('[SpriteCache] Failed to save to localStorage:', error);
      
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        console.warn('[SpriteCache] localStorage quota exceeded, clearing old entries...');
        this.clearOldEntries(50);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(this.cache));
        } catch (retryError) {
          console.error('[SpriteCache] Still failed after clearing entries:', retryError);
        }
      }
    }
  }

  private cleanExpiredEntries(): void {
    const entries = Object.entries(this.cache);
    let cleaned = 0;

    entries.forEach(([key, sprite]) => {
      if (this.isExpired(sprite)) {
        delete this.cache[key];
        cleaned++;
      }
    });

    if (cleaned > 0) {
      console.log(`[SpriteCache] Cleaned ${cleaned} expired entries`);
      this.saveToLocalStorage();
    }
  }

  private clearOldEntries(count: number): void {
    const sprites = Object.entries(this.cache);
    sprites.sort((a, b) => a[1].timestamp - b[1].timestamp);

    for (let i = 0; i < Math.min(count, sprites.length); i++) {
      delete this.cache[sprites[i][0]];
    }
  }
}

export const spriteCache = new SpriteCacheService();
