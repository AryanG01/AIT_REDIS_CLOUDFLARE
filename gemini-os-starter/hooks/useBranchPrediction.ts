/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  BranchPredictionRequest,
  BranchPredictionResult,
  PredictedBranch,
  PlayerStateSnapshot,
  ChoiceOption,
  PredictionWorkerStatus,
} from '../types/prediction';
import { branchPredictor } from '../services/branchPredictor';
import { playerBehaviorTracker } from '../services/playerBehaviorTracker';
import { branchCache } from '../services/branchCache';

export interface UseBranchPredictionOptions {
  enabled: boolean;
  sessionId: string;
  currentSceneId: string;
  playerState: PlayerStateSnapshot;
  interactionHistory: any[];
  characterClass?: string;
  storyContext?: string;
}

export interface UseBranchPredictionResult {
  // Predict branches for current scene
  predictBranches: (choices: ChoiceOption[]) => Promise<BranchPredictionResult>;

  // Get a predicted branch if available
  getPredictedBranch: (choiceId: string) => PredictedBranch | null;

  // Track a player interaction
  trackInteraction: (choiceType: string, choiceId: string) => void;

  // Worker status
  status: PredictionWorkerStatus;

  // Statistics
  stats: {
    cacheHitRate: number;
    predictions: number;
  };

  // Clear all predictions
  clear: () => void;
}

/**
 * Hook for branch prediction system
 * Manages pre-generation of likely player choices
 */
export function useBranchPrediction(
  options: UseBranchPredictionOptions
): UseBranchPredictionResult {
  const [status, setStatus] = useState<PredictionWorkerStatus>({
    isActive: false,
    queueSize: 0,
    activeRequests: 0,
    completedPredictions: 0,
    failedPredictions: 0,
    averageResponseTime: 0,
  });

  const [stats, setStats] = useState({
    cacheHitRate: 0,
    predictions: 0,
  });

  const lastSceneIdRef = useRef<string>(options.currentSceneId);
  const statusUpdateIntervalRef = useRef<number | null>(null);

  // Initialize behavior tracker on mount
  useEffect(() => {
    if (options.enabled && options.sessionId) {
      playerBehaviorTracker.initialize(options.sessionId);
      console.log('[useBranchPrediction] Initialized for session:', options.sessionId);
    }

    return () => {
      // Cleanup on unmount
      branchPredictor.clearQueue();
    };
  }, [options.enabled, options.sessionId]);

  // Clear predictions when scene changes
  useEffect(() => {
    if (options.currentSceneId !== lastSceneIdRef.current) {
      console.log('[useBranchPrediction] Scene changed, clearing predictions');
      branchPredictor.clearQueue();
      lastSceneIdRef.current = options.currentSceneId;
    }
  }, [options.currentSceneId]);

  // Update status periodically
  useEffect(() => {
    if (options.enabled) {
      statusUpdateIntervalRef.current = window.setInterval(() => {
        const newStatus = branchPredictor.getStatus();
        setStatus(newStatus);

        const cacheStats = branchCache.getStats();
        setStats({
          cacheHitRate: cacheStats.hitRate,
          predictions: newStatus.completedPredictions,
        });
      }, 1000); // Update every second

      return () => {
        if (statusUpdateIntervalRef.current !== null) {
          clearInterval(statusUpdateIntervalRef.current);
        }
      };
    }
  }, [options.enabled]);

  /**
   * Predict branches for available choices
   */
  const predictBranches = useCallback(
    async (choices: ChoiceOption[]): Promise<BranchPredictionResult> => {
      if (!options.enabled) {
        return {
          predictions: [],
          predictedChoiceIds: [],
          generationTime: 0,
          cacheHits: 0,
          cacheMisses: 0,
        };
      }

      const request: BranchPredictionRequest = {
        sessionId: options.sessionId,
        currentSceneId: options.currentSceneId,
        availableChoices: choices,
        playerState: options.playerState,
        interactionHistory: options.interactionHistory,
        storyContext: options.storyContext,
        characterClass: options.characterClass,
      };

      return await branchPredictor.predictBranches(request);
    },
    [
      options.enabled,
      options.sessionId,
      options.currentSceneId,
      options.playerState,
      options.interactionHistory,
      options.storyContext,
      options.characterClass,
    ]
  );

  /**
   * Get a predicted branch if available
   */
  const getPredictedBranch = useCallback(
    (choiceId: string): PredictedBranch | null => {
      if (!options.enabled) return null;

      return branchPredictor.getPredictedBranch(
        options.sessionId,
        options.currentSceneId,
        choiceId,
        options.playerState
      );
    },
    [
      options.enabled,
      options.sessionId,
      options.currentSceneId,
      options.playerState,
    ]
  );

  /**
   * Track a player interaction
   */
  const trackInteraction = useCallback(
    (choiceType: string, choiceId: string): void => {
      if (!options.enabled) return;

      playerBehaviorTracker.trackInteraction(
        choiceType,
        choiceId,
        options.playerState
      );

      console.log('[useBranchPrediction] Tracked interaction:', { choiceType, choiceId });
    },
    [options.enabled, options.playerState]
  );

  /**
   * Clear all predictions
   */
  const clear = useCallback((): void => {
    branchPredictor.clearQueue();
    branchCache.clear();
    console.log('[useBranchPrediction] Cleared all predictions');
  }, []);

  return {
    predictBranches,
    getPredictedBranch,
    trackInteraction,
    status,
    stats,
    clear,
  };
}

/**
 * Helper hook to automatically predict branches when choices become available
 */
export function useAutoBranchPrediction(
  options: UseBranchPredictionOptions & {
    availableChoices: ChoiceOption[];
  }
): UseBranchPredictionResult {
  const branchPrediction = useBranchPrediction(options);
  const lastPredictionRef = useRef<string>('');

  // Auto-predict when choices are available
  useEffect(() => {
    if (
      options.enabled &&
      options.availableChoices.length > 0 &&
      options.currentSceneId !== lastPredictionRef.current
    ) {
      // Debounce: wait a bit before predicting to ensure scene is stable
      const timer = setTimeout(() => {
        branchPrediction.predictBranches(options.availableChoices);
        lastPredictionRef.current = options.currentSceneId;
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [
    options.enabled,
    options.availableChoices,
    options.currentSceneId,
    branchPrediction,
  ]);

  return branchPrediction;
}
