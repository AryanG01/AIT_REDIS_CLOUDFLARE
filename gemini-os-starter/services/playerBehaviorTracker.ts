/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PlayerBehaviorProfile,
  TrackedInteraction,
  ChoicePreferences,
  PlayerStateSnapshot,
  DEFAULT_PREDICTION_CONFIG,
} from '../types/prediction';

const STORAGE_KEY = 'player_behavior_profile';

/**
 * Tracks player behavior patterns across interactions
 * Uses sliding window to calculate choice type preferences
 */
class PlayerBehaviorTracker {
  private profile: PlayerBehaviorProfile | null = null;
  private initialized = false;
  private readonly windowSize: number;

  constructor(windowSize: number = DEFAULT_PREDICTION_CONFIG.slidingWindowSize) {
    this.windowSize = windowSize;
  }

  /**
   * Initialize tracker for a new session
   */
  initialize(sessionId: string): void {
    // Try to load existing profile
    const loaded = this.loadFromStorage();

    if (loaded && this.profile?.sessionId === sessionId) {
      console.log('[BehaviorTracker] Loaded existing profile for session', sessionId);
      this.initialized = true;
      return;
    }

    // Create new profile
    this.profile = {
      sessionId,
      interactions: [],
      preferences: this.getDefaultPreferences(),
      lastUpdated: Date.now(),
    };

    this.initialized = true;
    this.saveToStorage();
    console.log('[BehaviorTracker] Initialized new profile for session', sessionId);
  }

  /**
   * Track a new player interaction
   */
  trackInteraction(
    choiceType: string,
    choiceId: string,
    playerState: PlayerStateSnapshot
  ): void {
    if (!this.initialized || !this.profile) {
      console.warn('[BehaviorTracker] Tracker not initialized');
      return;
    }

    const interaction: TrackedInteraction = {
      timestamp: Date.now(),
      choiceType: this.normalizeChoiceType(choiceType),
      choiceId,
      playerState,
    };

    // Add to interactions
    this.profile.interactions.push(interaction);

    // Maintain sliding window size
    if (this.profile.interactions.length > this.windowSize) {
      this.profile.interactions = this.profile.interactions.slice(-this.windowSize);
    }

    // Recalculate preferences
    this.profile.preferences = this.calculatePreferences();
    this.profile.lastUpdated = Date.now();

    // Persist to storage
    this.saveToStorage();

    console.log('[BehaviorTracker] Tracked interaction:', {
      type: choiceType,
      preferences: this.profile.preferences,
    });
  }

  /**
   * Get current player preferences
   */
  getPreferences(): ChoicePreferences {
    if (!this.profile) {
      return this.getDefaultPreferences();
    }
    return { ...this.profile.preferences };
  }

  /**
   * Get all tracked interactions
   */
  getInteractions(): TrackedInteraction[] {
    return this.profile?.interactions || [];
  }

  /**
   * Get recent interactions (last N)
   */
  getRecentInteractions(count: number): TrackedInteraction[] {
    if (!this.profile) return [];
    const startIndex = Math.max(0, this.profile.interactions.length - count);
    return this.profile.interactions.slice(startIndex);
  }

  /**
   * Calculate preference score for a specific choice type
   * Considers: historical frequency (70%) + recent bias (30%)
   */
  getPreferenceScore(choiceType: string): number {
    if (!this.profile || this.profile.interactions.length === 0) {
      return 0.2; // Default neutral score
    }

    const normalizedType = this.normalizeChoiceType(choiceType);

    // Historical frequency (all interactions)
    const totalCount = this.profile.interactions.length;
    const typeCount = this.profile.interactions.filter(
      i => i.choiceType === normalizedType
    ).length;
    const historicalScore = typeCount / totalCount;

    // Recent bias (last 10 interactions)
    const recentInteractions = this.getRecentInteractions(10);
    const recentCount = recentInteractions.length;
    const recentTypeCount = recentInteractions.filter(
      i => i.choiceType === normalizedType
    ).length;
    const recentScore = recentCount > 0 ? recentTypeCount / recentCount : historicalScore;

    // Weighted combination: 70% historical, 30% recent
    return historicalScore * 0.7 + recentScore * 0.3;
  }

  /**
   * Predict likely choice types based on context
   */
  predictLikelyChoices(
    availableChoices: string[],
    contextUrgency?: { type: string; score: number }
  ): string[] {
    const scored = availableChoices.map(choiceType => {
      let score = this.getPreferenceScore(choiceType);

      // Boost score if matches context urgency
      if (contextUrgency && this.normalizeChoiceType(choiceType) === contextUrgency.type) {
        score += contextUrgency.score * 0.3;
      }

      return { choiceType, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.map(s => s.choiceType);
  }

  /**
   * Get statistics about player behavior
   */
  getStatistics(): {
    totalInteractions: number;
    topChoiceType: string;
    diversity: number; // 0-1, how varied are choices
    playstyle: 'aggressive' | 'diplomatic' | 'balanced' | 'cautious';
  } {
    if (!this.profile || this.profile.interactions.length === 0) {
      return {
        totalInteractions: 0,
        topChoiceType: 'unknown',
        diversity: 0,
        playstyle: 'balanced',
      };
    }

    const preferences = this.profile.preferences;
    const totalInteractions = this.profile.interactions.length;

    // Find top choice type
    const topChoice = Object.entries(preferences)
      .sort((a, b) => b[1] - a[1])[0];
    const topChoiceType = topChoice[0];

    // Calculate diversity (entropy-based)
    const diversity = this.calculateDiversity(preferences);

    // Determine playstyle
    let playstyle: 'aggressive' | 'diplomatic' | 'balanced' | 'cautious' = 'balanced';
    if (preferences.combat > 0.5) playstyle = 'aggressive';
    else if (preferences.dialogue > 0.5) playstyle = 'diplomatic';
    else if (preferences.heal > 0.4) playstyle = 'cautious';

    return {
      totalInteractions,
      topChoiceType,
      diversity,
      playstyle,
    };
  }

  /**
   * Reset the tracker
   */
  reset(): void {
    this.profile = null;
    this.initialized = false;
    this.clearStorage();
    console.log('[BehaviorTracker] Reset tracker');
  }

  /**
   * Export profile as JSON
   */
  exportProfile(): string {
    if (!this.profile) {
      return JSON.stringify({ error: 'No active profile' });
    }
    return JSON.stringify(this.profile, null, 2);
  }

  // ========== Private Methods ==========

  /**
   * Calculate preferences from interaction history
   */
  private calculatePreferences(): ChoicePreferences {
    if (!this.profile || this.profile.interactions.length === 0) {
      return this.getDefaultPreferences();
    }

    const typeCounts: Record<string, number> = {};
    const total = this.profile.interactions.length;

    // Count each type
    this.profile.interactions.forEach(interaction => {
      const type = interaction.choiceType;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // Convert to percentages
    const preferences: ChoicePreferences = {
      combat: (typeCounts.combat || 0) / total,
      dialogue: (typeCounts.dialogue || 0) / total,
      loot: (typeCounts.loot || 0) / total,
      heal: (typeCounts.heal || 0) / total,
      exploration: (typeCounts.exploration || 0) / total,
    };

    // Include any other types
    Object.keys(typeCounts).forEach(type => {
      if (!(type in preferences)) {
        preferences[type] = typeCounts[type] / total;
      }
    });

    return preferences;
  }

  /**
   * Get default neutral preferences
   */
  private getDefaultPreferences(): ChoicePreferences {
    return {
      combat: 0.2,
      dialogue: 0.2,
      loot: 0.2,
      heal: 0.2,
      exploration: 0.2,
    };
  }

  /**
   * Normalize choice type to standard categories
   */
  private normalizeChoiceType(type: string): string {
    const normalized = type.toLowerCase().trim();

    // Map variations to standard types
    if (['attack', 'fight', 'damage', 'battle'].includes(normalized)) {
      return 'combat';
    }
    if (['talk', 'speak', 'negotiate', 'persuade'].includes(normalized)) {
      return 'dialogue';
    }
    if (['take', 'pickup', 'collect', 'grab'].includes(normalized)) {
      return 'loot';
    }
    if (['restore', 'rest', 'potion', 'recover'].includes(normalized)) {
      return 'heal';
    }
    if (['move', 'explore', 'search', 'investigate'].includes(normalized)) {
      return 'exploration';
    }

    return normalized;
  }

  /**
   * Calculate diversity score (0-1) using Shannon entropy
   */
  private calculateDiversity(preferences: ChoicePreferences): number {
    const values = Object.values(preferences).filter(v => v > 0);
    if (values.length === 0) return 0;

    const entropy = -values.reduce((sum, p) => sum + p * Math.log2(p), 0);
    const maxEntropy = Math.log2(values.length);

    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * Save profile to localStorage
   */
  private saveToStorage(): void {
    if (!this.profile) return;

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.profile));
    } catch (error) {
      console.error('[BehaviorTracker] Failed to save to storage:', error);
    }
  }

  /**
   * Load profile from localStorage
   */
  private loadFromStorage(): boolean {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.profile = JSON.parse(stored);
        this.initialized = true;
        return true;
      }
    } catch (error) {
      console.error('[BehaviorTracker] Failed to load from storage:', error);
    }
    return false;
  }

  /**
   * Clear storage
   */
  private clearStorage(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[BehaviorTracker] Failed to clear storage:', error);
    }
  }
}

// Export singleton instance
export const playerBehaviorTracker = new PlayerBehaviorTracker();
