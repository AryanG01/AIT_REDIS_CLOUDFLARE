/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
/* tslint:disable */
import { getApiBaseUrl } from './apiConfig';

export interface GameEvent {
  id: string;
  timestamp: number;
  type:
    | 'combat'
    | 'dialogue'
    | 'loot'
    | 'exploration'
    | 'death'
    | 'levelup'
    | 'choice'
    | 'battle_start'
    | 'battle_end'
    | 'npc_interaction'
    | 'item_acquired'
    | 'room_entered'
    | 'story_scene';
  roomId: string;
  playerLevel: number;
  playerHP: number;
  description: string;
  details?: {
    npcId?: string;
    npcName?: string;
    enemyId?: string;
    enemyName?: string;
    itemId?: string;
    itemName?: string;
    choiceId?: string;
    choiceText?: string;
    choiceType?: string;  // Type of choice for branch prediction
    consequenceType?: string;
    damageDealt?: number;
    damageTaken?: number;
    xpGained?: number;
    [key: string]: any;
  };
}

export interface EventLog {
  sessionId: string;
  startTime: number;
  characterClass: string | null;
  storySeed: number;
  events: GameEvent[];
}

const STORAGE_KEY = 'gemini_os_event_log';
const MAX_EVENTS_IN_MEMORY = 100;
const MAX_EVENTS_FOR_CONTEXT = 20;

class EventLoggerService {
  private currentLog: EventLog | null = null;
  private isInitialized = false;
  private pendingEvents: GameEvent[] = [];
  private batchInterval: number | null = null;
  private readonly BATCH_SIZE = 10; // Save to Redis after 10 events
  private readonly BATCH_INTERVAL_MS = 60000; // Or after 1 minute

  initialize(characterClass: string | null, storySeed: number): void {
    this.currentLog = {
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: Date.now(),
      characterClass,
      storySeed,
      events: [],
    };
    this.isInitialized = true;
    this.saveToLocalStorage();

    // Start batch save interval
    this.startBatchSaving();
  }

  logEvent(
    type: GameEvent['type'],
    roomId: string,
    playerLevel: number,
    playerHP: number,
    description: string,
    details?: GameEvent['details']
  ): void {
    if (!this.isInitialized || !this.currentLog) {
      console.warn('[EventLogger] Logger not initialized. Call initialize() first.');
      return;
    }

    const event: GameEvent = {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      type,
      roomId,
      playerLevel,
      playerHP,
      description,
      details,
    };

    this.currentLog.events.push(event);
    this.pendingEvents.push(event);

    if (this.currentLog.events.length > MAX_EVENTS_IN_MEMORY) {
      const startIndex = this.currentLog.events.length - MAX_EVENTS_IN_MEMORY;
      this.currentLog.events = this.currentLog.events.slice(startIndex);
    }

    this.saveToLocalStorage();

    // Batch save to Redis if we have enough events
    if (this.pendingEvents.length >= this.BATCH_SIZE) {
      this.flushEventsToRedis();
    }
  }

  /**
   * Start interval for batch saving events to Redis
   */
  private startBatchSaving(): void {
    if (this.batchInterval !== null) {
      return; // Already started
    }

    this.batchInterval = window.setInterval(() => {
      this.flushEventsToRedis();
    }, this.BATCH_INTERVAL_MS);
  }

  /**
   * Stop batch saving interval
   */
  private stopBatchSaving(): void {
    if (this.batchInterval !== null) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
  }

  /**
   * Flush pending events to Redis via API
   */
  private async flushEventsToRedis(): Promise<void> {
    if (!this.currentLog || this.pendingEvents.length === 0) {
      return;
    }

    const eventsToSave = [...this.pendingEvents];
    this.pendingEvents = []; // Clear pending immediately

    try {
      await fetch(`${getApiBaseUrl()}/api/analytics/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: this.currentLog.sessionId,
          events: eventsToSave,
        }),
      });

      console.log(`[EventLogger] Flushed ${eventsToSave.length} events to Redis`);
    } catch (error) {
      console.warn('[EventLogger] Failed to flush events to Redis:', error);
      // Re-add events to pending queue for retry
      this.pendingEvents.unshift(...eventsToSave);

      // Prevent infinite growth
      if (this.pendingEvents.length > MAX_EVENTS_IN_MEMORY) {
        this.pendingEvents = this.pendingEvents.slice(-MAX_EVENTS_IN_MEMORY);
      }
    }
  }

  /**
   * Force flush all pending events (call before unload)
   */
  async flushAll(): Promise<void> {
    await this.flushEventsToRedis();
  }

  getRecentEvents(count: number = MAX_EVENTS_FOR_CONTEXT): GameEvent[] {
    if (!this.currentLog) return [];
    const startIndex = Math.max(0, this.currentLog.events.length - count);
    return this.currentLog.events.slice(startIndex);
  }

  getEventsSummary(count: number = MAX_EVENTS_FOR_CONTEXT): string {
    const recentEvents = this.getRecentEvents(count);
    
    if (recentEvents.length === 0) {
      return 'No previous events in this session.';
    }

    const summaryLines = recentEvents.map((event, index) => {
      const timeAgo = this.formatTimeAgo(event.timestamp);
      let summary = `${index + 1}. [${timeAgo}] ${event.type.toUpperCase()}: ${event.description}`;
      
      if (event.details) {
        const details = [];
        if (event.details.npcName) details.push(`NPC: ${event.details.npcName}`);
        if (event.details.enemyName) details.push(`Enemy: ${event.details.enemyName}`);
        if (event.details.itemName) details.push(`Item: ${event.details.itemName}`);
        if (event.details.damageDealt) details.push(`Damage dealt: ${event.details.damageDealt}`);
        if (event.details.damageTaken) details.push(`Damage taken: ${event.details.damageTaken}`);
        if (event.details.xpGained) details.push(`XP gained: ${event.details.xpGained}`);
        if (event.details.choiceText) details.push(`Choice: "${event.details.choiceText}"`);
        
        if (details.length > 0) {
          summary += ` (${details.join(', ')})`;
        }
      }
      
      return summary;
    });

    return `Recent Events:\n${summaryLines.join('\n')}`;
  }

  getContextForAI(): string {
    const recentEvents = this.getRecentEvents(MAX_EVENTS_FOR_CONTEXT);
    
    if (recentEvents.length === 0) {
      return '';
    }

    const combatEvents = recentEvents.filter(e => e.type === 'combat' || e.type === 'battle_end');
    const npcEvents = recentEvents.filter(e => e.type === 'npc_interaction' || e.type === 'dialogue');
    const lootEvents = recentEvents.filter(e => e.type === 'loot' || e.type === 'item_acquired');
    const choiceEvents = recentEvents.filter(e => e.type === 'choice');
    const storyScenes = recentEvents.filter(e => e.type === 'story_scene');

    const contextParts = [];

    if (combatEvents.length > 0) {
      const lastCombat = combatEvents[combatEvents.length - 1];
      contextParts.push(`Recent Combat: ${lastCombat.description}`);
      if (lastCombat.details?.enemyName) {
        contextParts.push(`  - Enemy: ${lastCombat.details.enemyName}`);
      }
    }

    if (npcEvents.length > 0) {
      const npcNames = new Set(npcEvents.map(e => e.details?.npcName).filter(Boolean));
      if (npcNames.size > 0) {
        contextParts.push(`Previously Encountered NPCs: ${Array.from(npcNames).join(', ')}`);
      }
    }

    if (choiceEvents.length > 0) {
      const startIndex = Math.max(0, choiceEvents.length - 3);
      const recentChoices = choiceEvents.slice(startIndex).map(e => {
        const choiceText = e.details?.choiceText || 'Unknown choice';
        const consequenceType = e.details?.consequenceType || 'neutral';
        return `  - ${choiceText} (${consequenceType})`;
      });
      contextParts.push(`Recent Choices:\n${recentChoices.join('\n')}`);
    }

    if (storyScenes.length > 0) {
      const recentScenes = storyScenes.slice(-3).map(scene => {
        const summary = scene.description.length > 180
          ? `${scene.description.slice(0, 177)}...`
          : scene.description;
        return `  - ${summary}`;
      });
      contextParts.push(`Story Progress:\n${recentScenes.join('\n')}`);
    }

    if (lootEvents.length > 0) {
      const items = lootEvents.map(e => e.details?.itemName).filter(Boolean);
      if (items.length > 0) {
        contextParts.push(`Recently Acquired Items: ${items.join(', ')}`);
      }
    }

    const playerJourney = [];
    const rooms = new Set(recentEvents.map(e => e.roomId));
    playerJourney.push(`Rooms Explored: ${rooms.size}`);
    
    const lastEvent = recentEvents[recentEvents.length - 1];
    playerJourney.push(`Current Status: Level ${lastEvent.playerLevel}, HP ${lastEvent.playerHP}`);

    contextParts.push(`Player Journey: ${playerJourney.join(' | ')}`);

    return contextParts.join('\n');
  }

  getCurrentLog(): EventLog | null {
    return this.currentLog;
  }

  reset(): void {
    // Flush any pending events before reset
    if (this.pendingEvents.length > 0) {
      this.flushEventsToRedis().catch(err => {
        console.warn('[EventLogger] Failed to flush events on reset:', err);
      });
    }

    // Stop batch saving
    this.stopBatchSaving();

    this.currentLog = null;
    this.isInitialized = false;
    this.pendingEvents = [];
    this.clearLocalStorage();
  }

  exportToJSON(): string {
    if (!this.currentLog) {
      return JSON.stringify({ error: 'No active log' }, null, 2);
    }
    return JSON.stringify(this.currentLog, null, 2);
  }

  private formatTimeAgo(timestamp: number): string {
    const secondsAgo = Math.floor((Date.now() - timestamp) / 1000);
    
    if (secondsAgo < 60) return `${secondsAgo}s ago`;
    if (secondsAgo < 3600) return `${Math.floor(secondsAgo / 60)}m ago`;
    if (secondsAgo < 86400) return `${Math.floor(secondsAgo / 3600)}h ago`;
    return `${Math.floor(secondsAgo / 86400)}d ago`;
  }

  private saveToLocalStorage(): void {
    if (!this.currentLog) return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentLog));
    } catch (error) {
      console.error('[EventLogger] Failed to save to localStorage:', error);
    }
  }

  private clearLocalStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[EventLogger] Failed to clear localStorage:', error);
    }
  }

  loadFromLocalStorage(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.currentLog = JSON.parse(stored);
        this.isInitialized = true;
        return true;
      }
    } catch (error) {
      console.error('[EventLogger] Failed to load from localStorage:', error);
    }
    return false;
  }
}

export const eventLogger = new EventLoggerService();
