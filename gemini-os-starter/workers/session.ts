/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Context } from 'hono';
import type { Env, GameSession } from '../lib/redis';
import { createRedisClient, SessionManager } from '../lib/redis';
import { rateLimitMiddleware, RateLimitPresets } from '../lib/rate-limiter';

/**
 * Session API Handler
 * Manages game session persistence in Redis
 */
export async function handleSessionAPI(c: Context<{ Bindings: Env }>) {
  const redis = createRedisClient(c.env);
  const sessionManager = new SessionManager(redis);

  // Rate limiting
  const rateLimitResponse = await rateLimitMiddleware(
    redis,
    c.req.raw,
    'session',
    RateLimitPresets.SESSION_API
  );

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  const method = c.req.method;
  const path = c.req.path;

  try {
    // POST /api/session/create - Create new session
    if (method === 'POST' && path === '/api/session/create') {
      const body = await c.req.json<GameSession>();

      // Validate session data
      if (!body.sessionId || !body.player) {
        return c.json({
          error: 'Invalid session data',
          message: 'sessionId and player are required',
        }, 400);
      }

      await sessionManager.createSession(body);

      return c.json({
        success: true,
        sessionId: body.sessionId,
        message: 'Session created successfully',
      });
    }

    // GET /api/session/:sessionId - Load session
    if (method === 'GET') {
      const sessionId = c.req.param('sessionId');

      if (!sessionId) {
        return c.json({
          error: 'Missing session ID',
        }, 400);
      }

      const session = await sessionManager.loadSession(sessionId);

      if (!session) {
        return c.json({
          error: 'Session not found',
          message: `No session found with ID: ${sessionId}`,
        }, 404);
      }

      return c.json({
        success: true,
        session,
      });
    }

    // PUT /api/session/:sessionId - Update session
    if (method === 'PUT') {
      const sessionId = c.req.param('sessionId');
      const body = await c.req.json<GameSession>();

      if (!sessionId) {
        return c.json({
          error: 'Missing session ID',
        }, 400);
      }

      // Ensure sessionId matches
      if (body.sessionId !== sessionId) {
        return c.json({
          error: 'Session ID mismatch',
          message: 'URL sessionId must match body sessionId',
        }, 400);
      }

      // Check if session exists
      const exists = await sessionManager.sessionExists(sessionId);
      if (!exists) {
        return c.json({
          error: 'Session not found',
          message: `No session found with ID: ${sessionId}`,
        }, 404);
      }

      await sessionManager.updateSession(body);

      return c.json({
        success: true,
        message: 'Session updated successfully',
      });
    }

    // DELETE /api/session/:sessionId - Delete session
    if (method === 'DELETE') {
      const sessionId = c.req.param('sessionId');

      if (!sessionId) {
        return c.json({
          error: 'Missing session ID',
        }, 400);
      }

      await sessionManager.deleteSession(sessionId);

      return c.json({
        success: true,
        message: 'Session deleted successfully',
      });
    }

    return c.json({
      error: 'Method not allowed',
    }, 405);
  } catch (error: any) {
    console.error('[Session API] Error:', error);

    return c.json({
      error: 'Session operation failed',
      message: error.message || 'Unknown error',
    }, 500);
  }
}
