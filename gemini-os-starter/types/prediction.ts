/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Configuration for branch prediction system
 */
export interface BranchPredictionConfig {
  enabled: boolean;
  maxConcurrentPredictions: number;  // How many branches to pre-generate
  predictionTimeout: number;          // Max time per prediction (ms)
  cacheSize: number;                  // Max cached branches per session
  stateDriftThreshold: number;        // Tolerance for state changes (0.15 = 15%)
  debounceMs: number;                 // Wait time before predicting (ms)
  slidingWindowSize: number;          // Number of interactions to track
}

/**
 * Default configuration
 */
export const DEFAULT_PREDICTION_CONFIG: BranchPredictionConfig = {
  enabled: true,
  maxConcurrentPredictions: 2,
  predictionTimeout: 8000,
  cacheSize: 10,
  stateDriftThreshold: 0.15,
  debounceMs: 500,
  slidingWindowSize: 40,
};

/**
 * Player state snapshot for cache keying
 * Uses coarse-grained values to increase cache hit rate
 */
export interface PlayerStateSnapshot {
  hp: number;           // Rounded to nearest 10
  level: number;        // Exact level
  invCount: number;     // Number of inventory items
  roomId: string;       // Current room
}

/**
 * Choice type preferences calculated from player behavior
 */
export interface ChoicePreferences {
  combat: number;       // 0.0 - 1.0
  dialogue: number;     // 0.0 - 1.0
  loot: number;         // 0.0 - 1.0
  heal: number;         // 0.0 - 1.0
  exploration: number;  // 0.0 - 1.0
  [key: string]: number;
}

/**
 * Tracked interaction for behavior analysis
 */
export interface TrackedInteraction {
  timestamp: number;
  choiceType: string;
  choiceId: string;
  playerState: PlayerStateSnapshot;
}

/**
 * Player behavior profile
 */
export interface PlayerBehaviorProfile {
  sessionId: string;
  interactions: TrackedInteraction[];
  preferences: ChoicePreferences;
  lastUpdated: number;
}

/**
 * Choice option extracted from AI scene
 */
export interface ChoiceOption {
  id: string;
  text: string;
  type: string;
  value?: number;
}

/**
 * Predicted branch with cached scene response
 */
export interface PredictedBranch {
  choiceId: string;
  choiceType: string;
  stateSnapshot: PlayerStateSnapshot;
  sceneResponse: string;     // Full HTML response from AI
  imagePrompts?: {
    background?: string;
    enemy?: string;
  };
  predictedAt: number;
  expiresAt: number;
  predictionScore: number;   // How confident we are (0-1)
}

/**
 * Branch prediction request
 */
export interface BranchPredictionRequest {
  sessionId: string;
  currentSceneId: string;
  availableChoices: ChoiceOption[];
  playerState: PlayerStateSnapshot;
  interactionHistory: any[];
  storyContext?: string;
  characterClass?: string;
}

/**
 * Branch prediction result
 */
export interface BranchPredictionResult {
  predictions: PredictedBranch[];
  predictedChoiceIds: string[];
  generationTime: number;
  cacheHits: number;
  cacheMisses: number;
}

/**
 * Branch cache entry
 */
export interface BranchCacheEntry {
  key: string;
  branch: PredictedBranch;
  createdAt: number;
  lastAccessed: number;
  accessCount: number;
}

/**
 * Branch cache statistics
 */
export interface BranchCacheStats {
  totalEntries: number;
  hitRate: number;
  averageAge: number;
  memoryUsage: number;
}

/**
 * Prediction worker status
 */
export interface PredictionWorkerStatus {
  isActive: boolean;
  queueSize: number;
  activeRequests: number;
  completedPredictions: number;
  failedPredictions: number;
  averageResponseTime: number;
}
