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
 * Gemini API Proxy Handler
 * Secures Gemini API key by keeping it on the backend
 * Adds rate limiting and analytics tracking
 */
export async function handleGeminiProxy(c: Context<{ Bindings: Env }>) {
  const redis = createRedisClient(c.env);

  // Rate limiting DISABLED for development
  // TODO: Re-enable for production with higher limits (e.g., 100 req/min)
  // const rateLimitResponse = await rateLimitMiddleware(
  //   redis,
  //   c.req.raw,
  //   'gemini-proxy',
  //   { maxRequests: 100, windowSeconds: 60 }
  // );
  // if (rateLimitResponse) {
  //   return rateLimitResponse;
  // }

  try {
    const body = await c.req.json();
    const { model, prompt, systemPrompt, temperature, maxTokens, stream } = body;

    if (!model) {
      return c.json({ error: 'Missing model parameter' }, 400);
    }

    if (!prompt) {
      return c.json({ error: 'Missing prompt parameter' }, 400);
    }

    console.log(`[Gemini Proxy] ${model} - ${prompt.slice(0, 100)}...`);

    // Track analytics
    const analytics = new AnalyticsManager(redis);
    await analytics.incrementCounter('gemini_api_calls', 1);
    await analytics.incrementCounter(`gemini_model:${model}`, 1);

    // Make request to Gemini API
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${c.env.GEMINI_API_KEY}`;

    const contents: any[] = [];

    if (systemPrompt) {
      contents.push({
        role: 'user',
        parts: [{ text: systemPrompt }]
      });
      contents.push({
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const requestBody: any = {
      contents,
      generationConfig: {
        temperature: temperature || 1.0,
        maxOutputTokens: maxTokens || 8192,
      }
    };

    const geminiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error('[Gemini Proxy] Error:', errorText);

      return c.json({
        error: 'Gemini API request failed',
        message: errorText,
      }, geminiResponse.status);
    }

    const result = await geminiResponse.json();

    // Extract text from response
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    if (!text) {
      console.error('[Gemini Proxy] No text in response:', result);
      return c.json({
        error: 'No text generated',
        data: result,
      }, 500);
    }

    // Track successful generation
    await analytics.incrementCounter('gemini_api_success', 1);

    return c.json({
      success: true,
      data: {
        text,
        raw: result,
      },
    });
  } catch (error: any) {
    console.error('[Gemini Proxy] Error:', error);

    // Track errors
    const analytics = new AnalyticsManager(redis);
    await analytics.incrementCounter('gemini_api_errors', 1);

    return c.json({
      error: 'Gemini API request failed',
      message: error.message || 'Unknown error',
    }, 500);
  }
}
