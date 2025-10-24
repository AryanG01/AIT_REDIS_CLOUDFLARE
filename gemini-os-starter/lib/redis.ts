/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Redis } from '@upstash/redis/cloudflare';

/**
 * Environment interface for Cloudflare Workers
 */
export interface Env {
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  SPRITE_CACHE: KVNamespace;
  ROOM_CACHE: KVNamespace;
  AUDIO_CACHE: KVNamespace;
  FAL_KEY: string;
  GEMINI_API_KEY?: string;
}

/**
 * Create Redis client for Cloudflare Workers
 * Uses Upstash Redis REST API for serverless compatibility
 */
export function createRedisClient(env: Env): Redis {
  return new Redis({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
}

/**
 * Redis key prefixes for different data types
 */
export const RedisKeys = {
  session: (sessionId: string) => `session:${sessionId}`,
  eventLog: (sessionId: string) => `events:${sessionId}`,
  rateLimit: (ip: string, endpoint: string) => `ratelimit:${ip}:${endpoint}`,
  analytics: (date: string) => `analytics:${date}`,
  userProgress: (userId: string) => `progress:${userId}`,
} as const;

/**
 * Session data structure stored in Redis
 */
export interface GameSession {
  sessionId: string;
  createdAt: number;
  lastSaved: number;
  storySeed: number;
  characterClass: string | null;

  // Player state
  player: {
    level: number;
    hp: number;
    maxHp: number;
    mana: number;
    maxMana: number;
    experience: number;
    position: { x: number; y: number };
  };

  // Current room
  currentRoomId: string;

  // Visited rooms
  visitedRooms: string[];

  // Inventory
  inventory: Array<{
    id: string;
    name: string;
    type: string;
    [key: string]: any;
  }>;

  // Story context
  storyContext?: {
    mode: 'inspiration' | 'recreation' | 'continuation';
    recreationText?: string;
    storyEvents?: any[];
  };

  // Metadata
  metadata: {
    totalPlayTime: number;
    roomsExplored: number;
    enemiesDefeated: number;
    npcsInteracted: number;
  };
}

/**
 * Session Manager - handles CRUD operations for game sessions
 */
export class SessionManager {
  constructor(private redis: Redis) {}

  /**
   * Create a new game session
   */
  async createSession(session: GameSession): Promise<void> {
    const key = RedisKeys.session(session.sessionId);
    // Store session with 7-day TTL
    await this.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(session));
  }

  /**
   * Load game session by ID
   */
  async loadSession(sessionId: string): Promise<GameSession | null> {
    const key = RedisKeys.session(sessionId);
    const data = await this.redis.get(key);

    if (!data) return null;

    return typeof data === 'string' ? JSON.parse(data) : (data as GameSession);
  }

  /**
   * Update existing session
   */
  async updateSession(session: GameSession): Promise<void> {
    session.lastSaved = Date.now();
    const key = RedisKeys.session(session.sessionId);
    // Extend TTL on each update
    await this.redis.setex(key, 7 * 24 * 60 * 60, JSON.stringify(session));
  }

  /**
   * Delete session (when player explicitly ends game)
   */
  async deleteSession(sessionId: string): Promise<void> {
    const key = RedisKeys.session(sessionId);
    await this.redis.del(key);
  }

  /**
   * Check if session exists
   */
  async sessionExists(sessionId: string): Promise<boolean> {
    const key = RedisKeys.session(sessionId);
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Extend session TTL (keep-alive)
   */
  async extendSession(sessionId: string): Promise<void> {
    const key = RedisKeys.session(sessionId);
    await this.redis.expire(key, 7 * 24 * 60 * 60);
  }
}

/**
 * Event Log Manager - batch saves event logs to Redis
 */
export class EventLogManager {
  constructor(private redis: Redis) {}

  /**
   * Append events to session log
   */
  async appendEvents(sessionId: string, events: any[]): Promise<void> {
    const key = RedisKeys.eventLog(sessionId);

    // Append to list (Redis LIST type)
    for (const event of events) {
      await this.redis.rpush(key, JSON.stringify(event));
    }

    // Keep only last 1000 events
    await this.redis.ltrim(key, -1000, -1);

    // Set TTL
    await this.redis.expire(key, 7 * 24 * 60 * 60);
  }

  /**
   * Get recent events
   */
  async getRecentEvents(sessionId: string, count: number = 20): Promise<any[]> {
    const key = RedisKeys.eventLog(sessionId);

    // Get last N events
    const events = await this.redis.lrange(key, -count, -1);

    return events.map((e: any) => typeof e === 'string' ? JSON.parse(e) : e);
  }

  /**
   * Get all events for analytics
   */
  async getAllEvents(sessionId: string): Promise<any[]> {
    const key = RedisKeys.eventLog(sessionId);
    const events = await this.redis.lrange(key, 0, -1);

    return events.map((e: any) => typeof e === 'string' ? JSON.parse(e) : e);
  }

  /**
   * Clear event log
   */
  async clearEvents(sessionId: string): Promise<void> {
    const key = RedisKeys.eventLog(sessionId);
    await this.redis.del(key);
  }
}

/**
 * Analytics Manager - aggregate game analytics
 */
export class AnalyticsManager {
  constructor(private redis: Redis) {}

  /**
   * Increment counter for daily analytics
   */
  async incrementCounter(metric: string, value: number = 1): Promise<void> {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = RedisKeys.analytics(date);

    await this.redis.hincrby(key, metric, value);

    // Keep analytics for 30 days
    await this.redis.expire(key, 30 * 24 * 60 * 60);
  }

  /**
   * Get analytics for a date
   */
  async getAnalytics(date: string): Promise<Record<string, number>> {
    const key = RedisKeys.analytics(date);
    const data = await this.redis.hgetall(key);

    // Convert all values to numbers
    const analytics: Record<string, number> = {};
    for (const [k, v] of Object.entries(data || {})) {
      analytics[k] = typeof v === 'string' ? parseInt(v, 10) : v as number;
    }

    return analytics;
  }
}
