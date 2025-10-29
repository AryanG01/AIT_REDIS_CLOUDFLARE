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

  // Rate limiting DISABLED for development
  // TODO: Re-enable for production with higher limits (e.g., 100 req/min)
  // const rateLimitResponse = await rateLimitMiddleware(
  //   redis,
  //   c.req.raw,
  //   'fal-proxy',
  //   { maxRequests: 100, windowSeconds: 60 }
  // );
  // if (rateLimitResponse) {
  //   return rateLimitResponse;
  // }

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
        ...input,  // Spread input params to top level instead of nesting
        webhook_url: null,
        enable_queue: true,
      }),
    });

    // Get response text first for better error handling
    const responseText = await falResponse.text();

    // Log response for debugging
    console.log(`[FAL Proxy] Response status: ${falResponse.status}, text preview:`, responseText.slice(0, 500));

    if (!falResponse.ok) {
      console.error('[FAL Proxy] Error response:', responseText);

      return c.json({
        error: 'FAL API request failed',
        message: responseText,
      }, { status: falResponse.status });
    }

    // Parse JSON with error handling
    let queueResponse: any;
    try {
      queueResponse = JSON.parse(responseText);
    } catch (jsonError: any) {
      console.error('[FAL Proxy] JSON parse error:', jsonError.message, 'Response:', responseText.slice(0, 500));
      return c.json({
        error: 'Failed to parse FAL API response',
        message: `JSON parse error: ${jsonError.message}`,
        rawResponse: responseText.slice(0, 1000),
      }, 500);
    }

    // Poll for result
    const requestId = queueResponse.request_id;
    const statusUrl = queueResponse.status_url;

    if (!requestId || !statusUrl) {
      return c.json({
        error: 'No request_id or status_url received from FAL',
        data: queueResponse,
      }, 500);
    }

    // Poll for completion (max 60 seconds)
    let result: any = null;
    let attempts = 0;
    const maxAttempts = 60;

    while (attempts < maxAttempts) {
      // Use the status_url provided by FAL instead of constructing it manually
      const statusResponse = await fetch(statusUrl, {
        headers: {
          'Authorization': `Key ${c.env.FAL_KEY}`,
        },
      });

      // Check if response is OK before parsing JSON
      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        console.error('[FAL Proxy] Status check error:', errorText);
        return c.json({
          error: 'FAL API status check failed',
          message: errorText,
        }, { status: statusResponse.status });
      }

      // Get response text first for better error handling
      const responseText = await statusResponse.text();
      let status: any;
      try {
        status = JSON.parse(responseText);
      } catch (jsonError: any) {
        console.error('[FAL Proxy] JSON parse error:', jsonError.message, 'Response:', responseText.slice(0, 200));
        return c.json({
          error: 'Failed to parse FAL API response',
          message: `JSON parse error: ${jsonError.message}`,
        }, 500);
      }

      if (status.status === 'COMPLETED') {
        // FAL API requires fetching from response_url to get actual image data
        const responseUrl = status.response_url;
        console.log('[FAL Proxy] Request completed, fetching result from:', responseUrl);

        if (!responseUrl) {
          console.error('[FAL Proxy] No response_url in completed status:', status);
          return c.json({
            error: 'No response_url in FAL status',
            data: status,
          }, 500);
        }

        // Fetch the actual result from response_url
        const resultResponse = await fetch(responseUrl, {
          headers: {
            'Authorization': `Key ${c.env.FAL_KEY}`,
          },
        });

        if (!resultResponse.ok) {
          const errorText = await resultResponse.text();
          console.error('[FAL Proxy] Failed to fetch result:', errorText);
          return c.json({
            error: 'Failed to fetch FAL result',
            message: errorText,
          }, { status: resultResponse.status });
        }

        const resultText = await resultResponse.text();
        try {
          result = JSON.parse(resultText);
          console.log('[FAL Proxy] Fetched result structure:', JSON.stringify(result).slice(0, 500));
        } catch (jsonError: any) {
          console.error('[FAL Proxy] JSON parse error on result:', jsonError.message);
          return c.json({
            error: 'Failed to parse FAL result',
            message: `JSON parse error: ${jsonError.message}`,
          }, 500);
        }
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

    // DEBUG: Log response structure for different endpoints
    console.log('[FAL Proxy] Response structure for endpoint:', endpoint);
    console.log('[FAL Proxy] Result keys:', Object.keys(result || {}));
    console.log('[FAL Proxy] Full result:', JSON.stringify(result).slice(0, 1000));
    console.log('[FAL Proxy] Returning to client:', JSON.stringify({success: true, data: result}).slice(0, 500));

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
