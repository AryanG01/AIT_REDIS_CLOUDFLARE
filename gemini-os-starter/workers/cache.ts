/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context } from 'hono';
import type { Env } from '../lib/redis';
import { createRedisClient } from '../lib/redis';
import { SpriteCacheKV, RoomCacheKV, AudioCacheKV } from '../lib/kv-cache';
import { rateLimitMiddleware, RateLimitPresets } from '../lib/rate-limiter';

/**
 * Cache API Handler
 * Provides REST interface to KV caches for sprites, rooms, and audio
 */
export async function handleCacheAPI(c: Context<{ Bindings: Env }>) {
  const redis = createRedisClient(c.env);

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(
    redis,
    c.req.raw,
    'cache',
    RateLimitPresets.CACHE_API
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const method = c.req.method;
  const type = c.req.param('type') as 'sprite' | 'room' | 'audio';

  try {
    // GET /api/cache/:type/:key - Retrieve from cache
    if (method === 'GET') {
      const key = c.req.param('key');

      if (!key) {
        return c.json({
          error: 'Missing cache key',
        }, 400);
      }

      let result: any = null;

      switch (type) {
        case 'sprite': {
          const spriteCache = new SpriteCacheKV(c.env.SPRITE_CACHE);
          // Key format: "prompt:type:biome"
          const [prompt, spriteType, biome] = key.split(':');
          result = await spriteCache.get(prompt, spriteType, biome || undefined);
          break;
        }

        case 'room': {
          const roomCache = new RoomCacheKV(c.env.ROOM_CACHE);
          // Key format: "storySeed:roomId"
          const [seedStr, roomId] = key.split(':');
          const storySeed = parseInt(seedStr, 10);
          result = await roomCache.get(storySeed, roomId);
          break;
        }

        case 'audio': {
          const audioCache = new AudioCacheKV(c.env.AUDIO_CACHE);
          // Key format: "context:text:emotion"
          const [context, text, emotion] = key.split(':');
          result = await audioCache.get(text, context, emotion || undefined);
          break;
        }

        default:
          return c.json({
            error: 'Invalid cache type',
            message: 'Type must be one of: sprite, room, audio',
          }, 400);
      }

      if (result === null) {
        return c.json({
          success: false,
          cached: false,
          data: null,
        }, 404);
      }

      return c.json({
        success: true,
        cached: true,
        data: result,
      });
    }

    // POST /api/cache/:type - Store in cache
    if (method === 'POST') {
      const body = await c.req.json();

      switch (type) {
        case 'sprite': {
          const { sprite, prompt, spriteType, biome } = body;

          if (!sprite || !prompt || !spriteType) {
            return c.json({
              error: 'Missing required fields',
              message: 'sprite, prompt, and spriteType are required',
            }, 400);
          }

          const spriteCache = new SpriteCacheKV(c.env.SPRITE_CACHE);
          await spriteCache.set(sprite, prompt, spriteType, biome);
          break;
        }

        case 'room': {
          const { room, storySeed } = body;

          if (!room || storySeed === undefined) {
            return c.json({
              error: 'Missing required fields',
              message: 'room and storySeed are required',
            }, 400);
          }

          const roomCache = new RoomCacheKV(c.env.ROOM_CACHE);
          await roomCache.set(storySeed, room);
          break;
        }

        case 'audio': {
          const { text, context, url, emotion, ttl } = body;

          if (!text || !context || !url) {
            return c.json({
              error: 'Missing required fields',
              message: 'text, context, and url are required',
            }, 400);
          }

          const audioCache = new AudioCacheKV(c.env.AUDIO_CACHE);
          await audioCache.set(text, context, url, emotion, ttl);
          break;
        }

        default:
          return c.json({
            error: 'Invalid cache type',
            message: 'Type must be one of: sprite, room, audio',
          }, 400);
      }

      return c.json({
        success: true,
        message: 'Cached successfully',
      });
    }

    // DELETE /api/cache/:type/:key - Remove from cache
    if (method === 'DELETE') {
      const key = c.req.param('key');

      if (!key) {
        return c.json({
          error: 'Missing cache key',
        }, 400);
      }

      switch (type) {
        case 'sprite': {
          const spriteCache = new SpriteCacheKV(c.env.SPRITE_CACHE);
          const [prompt, spriteType, biome] = key.split(':');
          await spriteCache.delete(prompt, spriteType, biome || undefined);
          break;
        }

        case 'room': {
          const roomCache = new RoomCacheKV(c.env.ROOM_CACHE);
          const [seedStr, roomId] = key.split(':');
          const storySeed = parseInt(seedStr, 10);
          await roomCache.delete(storySeed, roomId);
          break;
        }

        case 'audio': {
          const audioCache = new AudioCacheKV(c.env.AUDIO_CACHE);
          const [context, text, emotion] = key.split(':');
          await audioCache.delete(text, context, emotion || undefined);
          break;
        }

        default:
          return c.json({
            error: 'Invalid cache type',
          }, 400);
      }

      return c.json({
        success: true,
        message: 'Cache entry deleted',
      });
    }

    return c.json({
      error: 'Method not allowed',
    }, 405);
  } catch (error: any) {
    console.error('[Cache API] Error:', error);

    return c.json({
      error: 'Cache operation failed',
      message: error.message || 'Unknown error',
    }, 500);
  }
}
