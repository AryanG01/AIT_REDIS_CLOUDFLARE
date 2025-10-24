/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context } from 'hono';
import type { Env } from '../lib/redis';
import { createRedisClient, EventLogManager, AnalyticsManager } from '../lib/redis';
import { rateLimitMiddleware, RateLimitPresets } from '../lib/rate-limiter';

/**
 * Analytics API Handler
 * Manages event logs and game analytics
 */
export async function handleAnalyticsAPI(c: Context<{ Bindings: Env }>) {
  const redis = createRedisClient(c.env);

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(
    redis,
    c.req.raw,
    'analytics',
    RateLimitPresets.ANALYTICS_API
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const method = c.req.method;
  const path = c.req.path;

  try {
    // POST /api/analytics/events - Batch save events
    if (method === 'POST' && path === '/api/analytics/events') {
      const body = await c.req.json();
      const { sessionId, events } = body;

      if (!sessionId || !events || !Array.isArray(events)) {
        return c.json({
          error: 'Invalid request',
          message: 'sessionId and events array are required',
        }, 400);
      }

      const eventLogger = new EventLogManager(redis);
      await eventLogger.appendEvents(sessionId, events);

      // Track analytics counters
      const analytics = new AnalyticsManager(redis);
      await analytics.incrementCounter('total_events', events.length);

      // Count by event type
      const eventCounts: Record<string, number> = {};
      events.forEach((event: any) => {
        const type = event.type || 'unknown';
        eventCounts[type] = (eventCounts[type] || 0) + 1;
      });

      for (const [type, count] of Object.entries(eventCounts)) {
        await analytics.incrementCounter(`event_type:${type}`, count);
      }

      return c.json({
        success: true,
        message: `${events.length} events saved`,
      });
    }

    // GET /api/analytics/:date - Get analytics for a date
    if (method === 'GET') {
      const date = c.req.param('date');

      if (!date) {
        return c.json({
          error: 'Missing date parameter',
          message: 'Date should be in format YYYY-MM-DD',
        }, 400);
      }

      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return c.json({
          error: 'Invalid date format',
          message: 'Date should be in format YYYY-MM-DD',
        }, 400);
      }

      const analytics = new AnalyticsManager(redis);
      const data = await analytics.getAnalytics(date);

      return c.json({
        success: true,
        date,
        analytics: data,
      });
    }

    return c.json({
      error: 'Method not allowed',
    }, 405);
  } catch (error: any) {
    console.error('[Analytics API] Error:', error);

    return c.json({
      error: 'Analytics operation failed',
      message: error.message || 'Unknown error',
    }, 500);
  }
}
