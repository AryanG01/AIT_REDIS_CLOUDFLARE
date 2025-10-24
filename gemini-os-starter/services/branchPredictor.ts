/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BranchPredictionRequest,
  BranchPredictionResult,
  PredictedBranch,
  ChoiceOption,
  BranchPredictionConfig,
  DEFAULT_PREDICTION_CONFIG,
  PlayerStateSnapshot,
  PredictionWorkerStatus,
} from '../types/prediction';
import { playerBehaviorTracker } from './playerBehaviorTracker';
import { branchCache } from './branchCache';
import { streamAppContent } from './geminiService';

/**
 * Priority queue item for background prediction
 */
interface PredictionTask {
  id: string;
  request: BranchPredictionRequest;
  choice: ChoiceOption;
  priority: number;
  createdAt: number;
  resolve: (branch: PredictedBranch | null) => void;
  reject: (error: Error) => void;
}

/**
 * Branch Predictor Service
 * Orchestrates pre-generation of likely player choices
 */
class BranchPredictor {
  private config: BranchPredictionConfig = DEFAULT_PREDICTION_CONFIG;
  private predictionQueue: PredictionTask[] = [];
  private activePredictions: Map<string, Promise<PredictedBranch | null>> = new Map();
  private isProcessing = false;
  private debounceTimer: number | null = null;

  // Statistics
  private stats = {
    totalPredictions: 0,
    successfulPredictions: 0,
    failedPredictions: 0,
    totalResponseTime: 0,
  };

  /**
   * Configure the predictor
   */
  configure(config: Partial<BranchPredictionConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[BranchPredictor] Configured:', this.config);
  }

  /**
   * Main entry point: Predict and pre-generate branches for a scene
   */
  async predictBranches(request: BranchPredictionRequest): Promise<BranchPredictionResult> {
    if (!this.config.enabled) {
      return this.getEmptyResult();
    }

    const startTime = Date.now();
    const predictions: PredictedBranch[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;

    console.log(`[BranchPredictor] Predicting branches for ${request.availableChoices.length} choices`);

    // Rank choices by likelihood
    const rankedChoices = this.rankChoices(request);

    // Select top N choices to predict
    const choicesToPredict = rankedChoices.slice(0, this.config.maxConcurrentPredictions);

    // Check cache first
    for (const choice of choicesToPredict) {
      const cached = branchCache.get(
        request.sessionId,
        request.currentSceneId,
        choice.id,
        request.playerState,
        this.config.stateDriftThreshold
      );

      if (cached) {
        predictions.push(cached);
        cacheHits++;
        console.log(`[BranchPredictor] Using cached prediction for choice: ${choice.text}`);
      } else {
        cacheMisses++;
        // Queue for generation
        this.queuePrediction(request, choice);
      }
    }

    // Process queue in background (don't await)
    this.processQueue();

    const generationTime = Date.now() - startTime;

    return {
      predictions,
      predictedChoiceIds: choicesToPredict.map(c => c.id),
      generationTime,
      cacheHits,
      cacheMisses,
    };
  }

  /**
   * Get a predicted branch if available (synchronous check)
   */
  getPredictedBranch(
    sessionId: string,
    sceneId: string,
    choiceId: string,
    playerState: PlayerStateSnapshot
  ): PredictedBranch | null {
    return branchCache.get(sessionId, sceneId, choiceId, playerState);
  }

  /**
   * Rank choices by likelihood based on player behavior + context
   */
  private rankChoices(request: BranchPredictionRequest): ChoiceOption[] {
    const { availableChoices, playerState } = request;

    // Get player preferences
    const preferences = playerBehaviorTracker.getPreferences();

    // Calculate urgency context
    const contextUrgency = this.calculateContextUrgency(playerState);

    // Score each choice
    const scored = availableChoices.map(choice => {
      // Base score from player preferences (60% weight)
      const preferenceScore = preferences[choice.type] || 0.2;

      // Context urgency bonus (30% weight)
      let urgencyScore = 0;
      if (contextUrgency.type === choice.type) {
        urgencyScore = contextUrgency.score;
      }

      // Small random factor for variety (10% weight)
      const randomFactor = Math.random() * 0.1;

      const totalScore = preferenceScore * 0.6 + urgencyScore * 0.3 + randomFactor;

      return {
        choice,
        score: totalScore,
      };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    console.log('[BranchPredictor] Ranked choices:', scored.map(s => ({
      text: s.choice.text,
      type: s.choice.type,
      score: s.score.toFixed(3),
    })));

    return scored.map(s => s.choice);
  }

  /**
   * Calculate context urgency (e.g., low HP = high heal urgency)
   */
  private calculateContextUrgency(playerState: PlayerStateSnapshot): {
    type: string;
    score: number;
  } {
    // Low HP = high heal urgency
    if (playerState.hp < 30) {
      return { type: 'heal', score: 0.8 };
    }

    // Default: slight combat preference
    return { type: 'combat', score: 0.3 };
  }

  /**
   * Queue a prediction task for background processing
   */
  private queuePrediction(request: BranchPredictionRequest, choice: ChoiceOption): void {
    const taskId = `${request.sessionId}_${request.currentSceneId}_${choice.id}`;

    // Avoid duplicate tasks
    if (this.activePredictions.has(taskId)) {
      console.log(`[BranchPredictor] Task already queued: ${choice.text}`);
      return;
    }

    const task: PredictionTask = {
      id: taskId,
      request,
      choice,
      priority: 1, // Could be adjusted based on ranking
      createdAt: Date.now(),
      resolve: () => {},
      reject: () => {},
    };

    this.predictionQueue.push(task);
    console.log(`[BranchPredictor] Queued prediction for: ${choice.text} (queue size: ${this.predictionQueue.length})`);
  }

  /**
   * Process the prediction queue in background
   */
  private processQueue(): void {
    if (this.isProcessing || this.predictionQueue.length === 0) {
      return;
    }

    // Debounce to avoid rapid-fire predictions
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = window.setTimeout(async () => {
      this.isProcessing = true;

      // Process tasks in parallel (up to maxConcurrentPredictions)
      const tasksToProcess = this.predictionQueue.splice(0, this.config.maxConcurrentPredictions);

      const promises = tasksToProcess.map(task => this.executePredict ionTask(task));
      await Promise.allSettled(promises);

      this.isProcessing = false;

      // Continue processing if queue is not empty
      if (this.predictionQueue.length > 0) {
        this.processQueue();
      }
    }, this.config.debounceMs);
  }

  /**
   * Execute a single prediction task
   */
  private async executePredictionTask(task: PredictionTask): Promise<void> {
    const { request, choice } = task;
    const startTime = Date.now();

    try {
      console.log(`[BranchPredictor] Generating prediction for: ${choice.text}`);

      this.stats.totalPredictions++;

      // Create a promise for this prediction
      const predictionPromise = this.generateBranch(request, choice);
      this.activePredictions.set(task.id, predictionPromise);

      // Generate the branch with timeout
      const branch = await Promise.race([
        predictionPromise,
        this.timeoutPromise(this.config.predictionTimeout),
      ]);

      if (branch) {
        // Cache the result
        branchCache.set(
          request.sessionId,
          request.currentSceneId,
          choice.id,
          request.playerState,
          branch
        );

        this.stats.successfulPredictions++;
        this.stats.totalResponseTime += Date.now() - startTime;

        console.log(`[BranchPredictor] ✓ Predicted branch for: ${choice.text} (${Date.now() - startTime}ms)`);
      }
    } catch (error) {
      console.error(`[BranchPredictor] ✗ Failed to predict branch for: ${choice.text}`, error);
      this.stats.failedPredictions++;
    } finally {
      this.activePredictions.delete(task.id);
    }
  }

  /**
   * Generate a branch by calling Gemini API
   */
  private async generateBranch(
    request: BranchPredictionRequest,
    choice: ChoiceOption
  ): Promise<PredictedBranch | null> {
    try {
      // Simulate the user choosing this option
      const predictedInteraction = {
        id: choice.id,
        type: choice.type,
        value: choice.value?.toString(),
        elementType: 'button',
        elementText: choice.text,
        appContext: null,
      };

      // Add to interaction history
      const predictedHistory = [...request.interactionHistory, predictedInteraction];

      // Stream the AI response
      let fullResponse = '';
      for await (const chunk of streamAppContent(
        predictedHistory,
        10, // history length
        request.characterClass,
        request.playerState.hp,
        undefined, // story seed
        request.playerState.level,
        request.storyContext || undefined
      )) {
        fullResponse += chunk;
      }

      // Parse image prompts from response (if present)
      const imagePrompts = this.extractImagePrompts(fullResponse);

      // Calculate prediction score (how confident we are)
      const predictionScore = playerBehaviorTracker.getPreferenceScore(choice.type);

      // Create predicted branch
      const branch: PredictedBranch = {
        choiceId: choice.id,
        choiceType: choice.type,
        stateSnapshot: request.playerState,
        sceneResponse: fullResponse,
        imagePrompts,
        predictedAt: Date.now(),
        expiresAt: Date.now() + (5 * 60 * 1000), // 5 min TTL
        predictionScore,
      };

      return branch;
    } catch (error) {
      console.error('[BranchPredictor] Error generating branch:', error);
      return null;
    }
  }

  /**
   * Extract image prompts from AI response
   */
  private extractImagePrompts(response: string): { background?: string; enemy?: string } | undefined {
    try {
      // Look for JSON blocks in the response
      const jsonMatch = response.match(/\{[\s\S]*"imagePrompts"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.imagePrompts;
      }
    } catch (error) {
      // Ignore parsing errors
    }
    return undefined;
  }

  /**
   * Create a timeout promise
   */
  private timeoutPromise(ms: number): Promise<null> {
    return new Promise(resolve => setTimeout(() => resolve(null), ms));
  }

  /**
   * Clear all pending predictions
   */
  clearQueue(): void {
    this.predictionQueue = [];
    this.activePredictions.clear();
    if (this.debounceTimer !== null) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    console.log('[BranchPredictor] Cleared prediction queue');
  }

  /**
   * Get worker status
   */
  getStatus(): PredictionWorkerStatus {
    const avgResponseTime = this.stats.successfulPredictions > 0
      ? this.stats.totalResponseTime / this.stats.successfulPredictions
      : 0;

    return {
      isActive: this.isProcessing,
      queueSize: this.predictionQueue.length,
      activeRequests: this.activePredictions.size,
      completedPredictions: this.stats.successfulPredictions,
      failedPredictions: this.stats.failedPredictions,
      averageResponseTime: avgResponseTime,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      totalPredictions: 0,
      successfulPredictions: 0,
      failedPredictions: 0,
      totalResponseTime: 0,
    };
  }

  /**
   * Get empty result
   */
  private getEmptyResult(): BranchPredictionResult {
    return {
      predictions: [],
      predictedChoiceIds: [],
      generationTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }
}

// Export singleton instance
export const branchPredictor = new BranchPredictor();
