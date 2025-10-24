/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PredictedBranch,
  BranchCacheEntry,
  BranchCacheStats,
  PlayerStateSnapshot,
  DEFAULT_PREDICTION_CONFIG,
} from '../types/prediction';

/**
 * LRU Cache for predicted branches
 * Stores pre-generated scene responses for likely player choices
 */
class BranchCache {
  private cache: Map<string, BranchCacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;

  // Statistics
  private hits = 0;
  private misses = 0;

  constructor(
    maxSize: number = DEFAULT_PREDICTION_CONFIG.cacheSize,
    ttlMs: number = 5 * 60 * 1000 // 5 minutes default
  ) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  /**
   * Generate cache key from parameters
   */
  private generateKey(
    sessionId: string,
    sceneId: string,
    choiceId: string,
    state: PlayerStateSnapshot
  ): string {
    return `${sessionId}:${sceneId}:${choiceId}:${state.hp}:${state.level}:${state.invCount}`;
  }

  /**
   * Store a predicted branch
   */
  set(
    sessionId: string,
    sceneId: string,
    choiceId: string,
    state: PlayerStateSnapshot,
    branch: PredictedBranch
  ): void {
    const key = this.generateKey(sessionId, sceneId, choiceId, state);

    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    const entry: BranchCacheEntry = {
      key,
      branch,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 0,
    };

    this.cache.set(key, entry);

    console.log(`[BranchCache] Cached branch for choice ${choiceId} (${this.cache.size}/${this.maxSize})`);
  }

  /**
   * Retrieve a predicted branch
   * Returns null if not found or expired
   */
  get(
    sessionId: string,
    sceneId: string,
    choiceId: string,
    state: PlayerStateSnapshot,
    stateDriftThreshold: number = DEFAULT_PREDICTION_CONFIG.stateDriftThreshold
  ): PredictedBranch | null {
    // Try exact match first
    const exactKey = this.generateKey(sessionId, sceneId, choiceId, state);
    let entry = this.cache.get(exactKey);

    // If no exact match, try fuzzy match with state drift tolerance
    if (!entry) {
      entry = this.findFuzzyMatch(sessionId, sceneId, choiceId, state, stateDriftThreshold);
    }

    if (!entry) {
      this.misses++;
      return null;
    }

    // Check if expired
    const now = Date.now();
    if (now > entry.branch.expiresAt) {
      this.cache.delete(entry.key);
      this.misses++;
      console.log(`[BranchCache] Branch expired for choice ${choiceId}`);
      return null;
    }

    // Update access info
    entry.lastAccessed = now;
    entry.accessCount++;
    this.hits++;

    console.log(`[BranchCache] Cache hit for choice ${choiceId} (score: ${entry.branch.predictionScore.toFixed(2)})`);
    return entry.branch;
  }

  /**
   * Find a cache entry with similar state (fuzzy matching)
   */
  private findFuzzyMatch(
    sessionId: string,
    sceneId: string,
    choiceId: string,
    state: PlayerStateSnapshot,
    driftThreshold: number
  ): BranchCacheEntry | null {
    for (const [key, entry] of this.cache.entries()) {
      // Must match session, scene, and choice
      if (!key.startsWith(`${sessionId}:${sceneId}:${choiceId}:`)) {
        continue;
      }

      // Check state drift
      const cachedState = entry.branch.stateSnapshot;
      const drift = this.calculateStateDrift(state, cachedState);

      if (drift <= driftThreshold) {
        console.log(`[BranchCache] Fuzzy match found (drift: ${(drift * 100).toFixed(1)}%)`);
        return entry;
      }
    }

    return null;
  }

  /**
   * Calculate state drift between current and cached state
   * Returns value between 0 (identical) and 1 (completely different)
   */
  private calculateStateDrift(
    current: PlayerStateSnapshot,
    cached: PlayerStateSnapshot
  ): number {
    // Different room = complete invalidation
    if (current.roomId !== cached.roomId) {
      return 1.0;
    }

    // Level change is significant
    const levelDrift = Math.abs(current.level - cached.level) / Math.max(current.level, 1);

    // HP change (relative to max)
    const hpDrift = Math.abs(current.hp - cached.hp) / Math.max(current.hp, cached.hp, 100);

    // Inventory change is less significant
    const invDrift = Math.abs(current.invCount - cached.invCount) / Math.max(current.invCount, cached.invCount, 10);

    // Weighted average: HP (50%), Level (40%), Inventory (10%)
    return hpDrift * 0.5 + levelDrift * 0.4 + invDrift * 0.1;
  }

  /**
   * Check if a branch exists for a choice
   */
  has(
    sessionId: string,
    sceneId: string,
    choiceId: string,
    state: PlayerStateSnapshot
  ): boolean {
    return this.get(sessionId, sceneId, choiceId, state) !== null;
  }

  /**
   * Remove a specific cached branch
   */
  delete(
    sessionId: string,
    sceneId: string,
    choiceId: string,
    state: PlayerStateSnapshot
  ): boolean {
    const key = this.generateKey(sessionId, sceneId, choiceId, state);
    return this.cache.delete(key);
  }

  /**
   * Clear all cached branches for a session
   */
  clearSession(sessionId: string): void {
    const keysToDelete: string[] = [];

    for (const [key] of this.cache.entries()) {
      if (key.startsWith(`${sessionId}:`)) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    console.log(`[BranchCache] Cleared ${keysToDelete.length} entries for session ${sessionId}`);
  }

  /**
   * Clear all cached branches
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    console.log('[BranchCache] Cleared all cache entries');
  }

  /**
   * Evict the oldest (least recently used) entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      console.log('[BranchCache] Evicted oldest entry:', oldestKey);
    }
  }

  /**
   * Clean up expired entries
   */
  cleanupExpired(): number {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.branch.expiresAt) {
        keysToDelete.push(key);
      }
    }

    keysToDelete.forEach(key => this.cache.delete(key));

    if (keysToDelete.length > 0) {
      console.log(`[BranchCache] Cleaned up ${keysToDelete.length} expired entries`);
    }

    return keysToDelete.length;
  }

  /**
   * Get cache statistics
   */
  getStats(): BranchCacheStats {
    const now = Date.now();
    let totalAge = 0;
    let estimatedMemory = 0;

    for (const entry of this.cache.values()) {
      totalAge += now - entry.createdAt;
      // Rough estimate: 10KB per cached scene (HTML + metadata)
      estimatedMemory += 10 * 1024;
    }

    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;
    const averageAge = this.cache.size > 0 ? totalAge / this.cache.size : 0;

    return {
      totalEntries: this.cache.size,
      hitRate,
      averageAge,
      memoryUsage: estimatedMemory,
    };
  }

  /**
   * Get all cached entries (for debugging)
   */
  getAllEntries(): BranchCacheEntry[] {
    return Array.from(this.cache.values());
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }

  /**
   * Export cache state for debugging
   */
  export(): string {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      choiceId: entry.branch.choiceId,
      choiceType: entry.branch.choiceType,
      predictionScore: entry.branch.predictionScore,
      accessCount: entry.accessCount,
      age: Date.now() - entry.createdAt,
    }));

    return JSON.stringify({
      stats: this.getStats(),
      entries,
    }, null, 2);
  }
}

// Export singleton instance
export const branchCache = new BranchCache();

// Start periodic cleanup (every 2 minutes)
if (typeof window !== 'undefined') {
  setInterval(() => {
    branchCache.cleanupExpired();
  }, 2 * 60 * 1000);
}
