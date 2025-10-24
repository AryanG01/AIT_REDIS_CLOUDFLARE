/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context } from 'hono';
import type { Env } from '../lib/redis';
import { createRedisClient } from '../lib/redis';
import { rateLimitMiddleware, RateLimitPresets, createRateLimitHeaders } from '../lib/rate-limiter';
import { AnalyticsManager } from '../lib/redis';

/**
 * FAL API Proxy Handler
 * Replaces the Vercel serverless function
 * Adds rate limiting and analytics tracking
 */
export async function handleFalProxy(c: Context<{ Bindings: Env }>) {
  const redis = createRedisClient(c.env);

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(
    redis,
    c.req.raw,
    'fal-proxy',
    RateLimitPresets.FAL_PROXY
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const body = await c.req.json();
    const { endpoint, input, logs = false } = body;

    if (!endpoint) {
      return c.json({ error: 'Missing endpoint parameter' }, 400);
    }

    console.log(`[FAL Proxy] ${endpoint} - ${JSON.stringify(input).slice(0, 100)}...`);

    // Track analytics
    const analytics = new AnalyticsManager(redis);
    await analytics.incrementCounter('fal_api_calls', 1);
    await analytics.incrementCounter(`fal_endpoint:${endpoint}`, 1);

    // Make request to FAL API
    // Note: FAL client doesn't work well in Workers, so we use fetch directly
    const falResponse = await fetch(`https://queue.fal.run/${endpoint}`, {
      method: 'POST',
      headers: {
        'Authorization': `Key ${c.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input,
        webhook_url: null,
        enable_queue: true,
      }),
    });

    if (!falResponse.ok) {
      const errorText = await falResponse.text();
      console.error('[FAL Proxy] Error:', errorText);

      return c.json({
        error: 'FAL API request failed',
        message: errorText,
      }, falResponse.status);
    }

    const queueResponse = await falResponse.json() as any;

    // Poll for result
    const requestId = queueResponse.request_id;
    if (!requestId) {
      return c.json({
        error: 'No request_id received from FAL',
        data: queueResponse,
      }, 500);
    }

    // Poll for completion (max 60 seconds)
    let result: any = null;
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      const statusResponse = await fetch(`https://queue.fal.run/${endpoint}/requests/${requestId}/status`, {
        headers: {
          'Authorization': `Key ${c.env.FAL_KEY}`,
        },
      });

      const status = await statusResponse.json() as any;

      if (status.status === 'COMPLETED') {
        result = status.response_data || status;
        break;
      } else if (status.status === 'FAILED') {
        return c.json({
          error: 'FAL API request failed',
          message: status.error || 'Unknown error',
        }, 500);
      }

      // Wait 1 second before next poll
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }

    if (!result) {
      return c.json({
        error: 'Request timeout',
        message: 'FAL API did not respond in time',
      }, 504);
    }

    // Track successful generation
    await analytics.incrementCounter('fal_api_success', 1);

    return c.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error('[FAL Proxy] Error:', error);

    // Track errors
    const analytics = new AnalyticsManager(redis);
    await analytics.incrementCounter('fal_api_errors', 1);

    return c.json({
      error: 'FAL API request failed',
      message: error.message || 'Unknown error',
    }, 500);
  }
}
