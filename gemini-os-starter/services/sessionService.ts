/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GameSession } from '../lib/redis';

const SESSION_TOKEN_KEY = 'gemini_os_session_token';
const AUTO_SAVE_INTERVAL_MS = 30000; // 30 seconds

/**
 * Client-side Session Service
 * Handles auto-saving game state to Redis for multi-device persistence
 */
class SessionService {
  private currentSessionId: string | null = null;
  private autoSaveInterval: number | null = null;
  private lastSaveTime: number = 0;

  /**
   * Initialize session - either create new or restore existing
   */
  async initializeSession(characterClass: string | null, storySeed: number): Promise<string> {
    // Check if we have an existing session token
    const existingToken = this.getSessionToken();

    if (existingToken) {
      // Try to restore the session
      const restored = await this.restoreSession(existingToken);
      if (restored) {
        console.log('[SessionService] Restored existing session:', existingToken);
        this.currentSessionId = existingToken;
        this.startAutoSave();
        return existingToken;
      }
    }

    // Create new session
    const sessionId = this.generateSessionId();
    this.currentSessionId = sessionId;
    this.setSessionToken(sessionId);

    // Create initial session data
    const initialSession: GameSession = {
      sessionId,
      createdAt: Date.now(),
      lastSaved: Date.now(),
      storySeed,
      characterClass,
      player: {
        level: 1,
        hp: 100,
        maxHp: 100,
        mana: 50,
        maxMana: 50,
        experience: 0,
        position: { x: 0, y: 0 },
      },
      currentRoomId: 'room_0',
      visitedRooms: [],
      inventory: [],
      metadata: {
        totalPlayTime: 0,
        roomsExplored: 0,
        enemiesDefeated: 0,
        npcsInteracted: 0,
      },
    };

    await this.createSession(initialSession);

    console.log('[SessionService] Created new session:', sessionId);
    this.startAutoSave();

    return sessionId;
  }

  /**
   * Create new session in Redis
   */
  private async createSession(session: GameSession): Promise<void> {
    try {
      const response = await fetch('/api/session/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });

      if (!response.ok) {
        throw new Error('Failed to create session');
      }

      console.log('[SessionService] Session created successfully');
    } catch (error) {
      console.error('[SessionService] Failed to create session:', error);
      throw error;
    }
  }

  /**
   * Restore session from Redis
   */
  private async restoreSession(sessionId: string): Promise<GameSession | null> {
    try {
      const response = await fetch(`/api/session/${sessionId}`);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      return data.session as GameSession;
    } catch (error) {
      console.error('[SessionService] Failed to restore session:', error);
      return null;
    }
  }

  /**
   * Save current game state to Redis
   */
  async saveGameState(gameState: Partial<GameSession>): Promise<void> {
    if (!this.currentSessionId) {
      console.warn('[SessionService] No active session to save');
      return;
    }

    try {
      // Merge with existing session data
      const fullSession: GameSession = {
        sessionId: this.currentSessionId,
        createdAt: gameState.createdAt || Date.now(),
        lastSaved: Date.now(),
        storySeed: gameState.storySeed || 0,
        characterClass: gameState.characterClass || null,
        player: gameState.player || {
          level: 1,
          hp: 100,
          maxHp: 100,
          mana: 50,
          maxMana: 50,
          experience: 0,
          position: { x: 0, y: 0 },
        },
        currentRoomId: gameState.currentRoomId || 'room_0',
        visitedRooms: gameState.visitedRooms || [],
        inventory: gameState.inventory || [],
        storyContext: gameState.storyContext,
        metadata: gameState.metadata || {
          totalPlayTime: 0,
          roomsExplored: 0,
          enemiesDefeated: 0,
          npcsInteracted: 0,
        },
      };

      const response = await fetch(`/api/session/${this.currentSessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fullSession),
      });

      if (!response.ok) {
        throw new Error('Failed to save session');
      }

      this.lastSaveTime = Date.now();
      console.log('[SessionService] Game state saved successfully');
    } catch (error) {
      console.error('[SessionService] Failed to save game state:', error);
    }
  }

  /**
   * Load game state from Redis
   */
  async loadGameState(): Promise<GameSession | null> {
    if (!this.currentSessionId) {
      return null;
    }

    return await this.restoreSession(this.currentSessionId);
  }

  /**
   * Start auto-save interval
   */
  private startAutoSave(): void {
    if (this.autoSaveInterval !== null) {
      return; // Already started
    }

    this.autoSaveInterval = window.setInterval(() => {
      // Auto-save will be triggered by the app calling saveGameState
      console.log('[SessionService] Auto-save tick');
    }, AUTO_SAVE_INTERVAL_MS);
  }

  /**
   * Stop auto-save interval
   */
  private stopAutoSave(): void {
    if (this.autoSaveInterval !== null) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = null;
    }
  }

  /**
   * End session and clean up
   */
  async endSession(): Promise<void> {
    this.stopAutoSave();

    if (this.currentSessionId) {
      try {
        await fetch(`/api/session/${this.currentSessionId}`, {
          method: 'DELETE',
        });

        console.log('[SessionService] Session ended');
      } catch (error) {
        console.error('[SessionService] Failed to end session:', error);
      }

      this.clearSessionToken();
      this.currentSessionId = null;
    }
  }

  /**
   * Get current session ID
   */
  getSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Get time since last save
   */
  getTimeSinceLastSave(): number {
    if (this.lastSaveTime === 0) {
      return 0;
    }

    return Date.now() - this.lastSaveTime;
  }

  /**
   * Check if session should auto-save
   */
  shouldAutoSave(): boolean {
    return this.getTimeSinceLastSave() >= AUTO_SAVE_INTERVAL_MS;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get session token from localStorage
   */
  private getSessionToken(): string | null {
    try {
      return localStorage.getItem(SESSION_TOKEN_KEY);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save session token to localStorage
   */
  private setSessionToken(sessionId: string): void {
    try {
      localStorage.setItem(SESSION_TOKEN_KEY, sessionId);
    } catch (error) {
      console.error('[SessionService] Failed to save session token:', error);
    }
  }

  /**
   * Clear session token from localStorage
   */
  private clearSessionToken(): void {
    try {
      localStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (error) {
      console.error('[SessionService] Failed to clear session token:', error);
    }
  }

  /**
   * Generate shareable session URL
   */
  getShareableURL(): string {
    if (!this.currentSessionId) {
      return window.location.origin;
    }

    const url = new URL(window.location.origin);
    url.searchParams.set('session', this.currentSessionId);
    return url.toString();
  }

  /**
   * Check if URL contains session parameter
   */
  getSessionFromURL(): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get('session');
  }
}

/**
 * Global session service instance
 */
export const sessionService = new SessionService();
