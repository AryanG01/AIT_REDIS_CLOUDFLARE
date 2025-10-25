/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env } from '../lib/redis';

// Import route handlers
import { handleFalProxy } from './fal-proxy';
import { handleGeminiProxy } from './gemini-proxy';
import { handleSessionAPI } from './session';
import { handleCacheAPI } from './cache';
import { handleAnalyticsAPI } from './analytics';

/**
 * Main Cloudflare Worker
 * Routes API requests to appropriate handlers
 */
const app = new Hono<{ Bindings: Env }>();

// Enable CORS for all routes
app.use('/*', cors({
  origin: '*', // Update with your domain in production
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 600,
}));

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    timestamp: Date.now(),
    version: '1.0.0',
  });
});

// FAL API Proxy (replaces Vercel function)
app.post('/api/fal-proxy', handleFalProxy);

// Gemini API Proxy
app.post('/api/gemini-proxy', handleGeminiProxy);

// Session Management API
app.post('/api/session/create', handleSessionAPI);
app.get('/api/session/:sessionId', handleSessionAPI);
app.put('/api/session/:sessionId', handleSessionAPI);
app.delete('/api/session/:sessionId', handleSessionAPI);

// Cache API (for sprites, rooms, audio)
app.get('/api/cache/:type/:key', handleCacheAPI);
app.post('/api/cache/:type', handleCacheAPI);
app.delete('/api/cache/:type/:key', handleCacheAPI);

// Analytics API
app.post('/api/analytics/events', handleAnalyticsAPI);
app.get('/api/analytics/:date', handleAnalyticsAPI);

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist',
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('Worker error:', err);

  return c.json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  }, 500);
});

export default app;
