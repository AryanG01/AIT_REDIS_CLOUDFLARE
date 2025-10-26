/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Redis } from '@upstash/redis';
import { RedisKeys } from './redis';

/**
 * Rate Limiter Configuration
 */
export interface RateLimitConfig {
  /**
   * Number of requests allowed in the window
   */
  maxRequests: number;

  /**
   * Time window in seconds
   */
  windowSeconds: number;

  /**
   * Custom identifier (default: IP address)
   */
  identifier?: string;
}

/**
 * Rate Limit Result
 */
export interface RateLimitResult {
  /**
   * Whether the request is allowed
   */
  allowed: boolean;

  /**
   * Remaining requests in this window
   */
  remaining: number;

  /**
   * Total limit
   */
  limit: number;

  /**
   * Time until reset (seconds)
   */
  resetIn: number;

  /**
   * Retry after (seconds) - only set if not allowed
   */
  retryAfter?: number;
}

/**
 * Rate Limiter using Redis
 * Implements sliding window algorithm for accurate rate limiting
 */
export class RateLimiter {
  constructor(private redis: Redis) {}

  /**
   * Check rate limit for a request
   */
  async checkLimit(
    endpoint: string,
    ip: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const identifier = config.identifier || ip;
    const key = RedisKeys.rateLimit(identifier, endpoint);
    const now = Date.now();
    const windowMs = config.windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Use Redis sorted set for sliding window
    // Score is timestamp, value is unique request ID

    // Remove old entries outside the window
    await this.redis.zremrangebyscore(key, 0, windowStart);

    // Count requests in current window
    const count = await this.redis.zcard(key);

    const allowed = count < config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count - (allowed ? 1 : 0));

    // If allowed, add this request to the window
    if (allowed) {
      const requestId = `${now}:${Math.random()}`;
      await this.redis.zadd(key, { score: now, member: requestId });

      // Set expiry on the key
      await this.redis.expire(key, config.windowSeconds);
    }

    // Calculate reset time
    const oldestEntry = await this.redis.zrange(key, 0, 0, { withScores: true });
    const oldestTimestamp = oldestEntry.length > 0 ? oldestEntry[0].score : now;
    const resetIn = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

    return {
      allowed,
      remaining,
      limit: config.maxRequests,
      resetIn: Math.max(0, resetIn),
      retryAfter: allowed ? undefined : Math.max(1, resetIn),
    };
  }

  /**
   * Simple counter-based rate limiter (less accurate but faster)
   */
  async checkLimitSimple(
    endpoint: string,
    ip: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const identifier = config.identifier || ip;
    const key = RedisKeys.rateLimit(identifier, endpoint);

    // Increment counter
    const count = await this.redis.incr(key);

    // Always set/refresh expiry to avoid race conditions
    // This ensures the key doesn't persist forever if count === 1 check is missed
    await this.redis.expire(key, config.windowSeconds);

    const allowed = count <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - count);

    // Get TTL for reset time
    const ttl = await this.redis.ttl(key);
    const resetIn = Math.max(0, ttl);

    return {
      allowed,
      remaining,
      limit: config.maxRequests,
      resetIn,
      retryAfter: allowed ? undefined : resetIn,
    };
  }

  /**
   * Reset rate limit for an identifier
   */
  async resetLimit(endpoint: string, ip: string): Promise<void> {
    const key = RedisKeys.rateLimit(ip, endpoint);
    await this.redis.del(key);
  }

  /**
   * Get current usage for an identifier
   */
  async getUsage(endpoint: string, ip: string): Promise<number> {
    const key = RedisKeys.rateLimit(ip, endpoint);
    const count = await this.redis.zcard(key);
    return count;
  }
}

/**
 * Predefined rate limit configurations
 */
export const RateLimitPresets = {
  /**
   * FAL API proxy: 30 requests per minute
   * (Generous for image generation, but prevents abuse)
   */
  FAL_PROXY: {
    maxRequests: 30,
    windowSeconds: 60,
  },

  /**
   * Session API: 100 requests per minute
   * (Frequent auto-saves are expected)
   */
  SESSION_API: {
    maxRequests: 100,
    windowSeconds: 60,
  },

  /**
   * Cache API: 200 requests per minute
   * (High frequency cache lookups)
   */
  CACHE_API: {
    maxRequests: 200,
    windowSeconds: 60,
  },

  /**
   * Analytics API: 20 requests per minute
   * (Lower frequency, batch operations)
   */
  ANALYTICS_API: {
    maxRequests: 20,
    windowSeconds: 60,
  },

  /**
   * Global API: 300 requests per 5 minutes
   * (Aggregate limit across all endpoints)
   */
  GLOBAL: {
    maxRequests: 300,
    windowSeconds: 300,
  },
} as const;

/**
 * Helper to get client IP from request
 */
export function getClientIP(request: Request): string {
  // Cloudflare provides IP in CF-Connecting-IP header
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP;

  // Fallback to X-Forwarded-For
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // Last resort: X-Real-IP
  const realIP = request.headers.get('X-Real-IP');
  if (realIP) return realIP;

  return 'unknown';
}

/**
 * Helper to create rate limit headers for response
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.resetIn.toString(),
  };

  if (!result.allowed && result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }

  return headers;
}

/**
 * Middleware-style rate limit checker
 */
export async function rateLimitMiddleware(
  redis: Redis,
  request: Request,
  endpoint: string,
  config: RateLimitConfig
): Promise<Response | null> {
  const limiter = new RateLimiter(redis);
  const ip = getClientIP(request);

  const result = await limiter.checkLimitSimple(endpoint, ip, config);

  // Add rate limit headers to all responses
  const headers = createRateLimitHeaders(result);

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: `Too many requests. Retry after ${result.retryAfter} seconds.`,
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      }
    );
  }

  // Return null if allowed (continue to actual handler)
  // Caller should add headers to their response
  return null;
}
