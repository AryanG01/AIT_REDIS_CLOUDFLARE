/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BranchPredictionConfig,
  DEFAULT_PREDICTION_CONFIG,
} from '../types/prediction';

/**
 * Branch Prediction Configuration
 *
 * Customize these settings to control the behavior of the branch prediction system
 */

/**
 * Development mode: More verbose logging, shorter timeouts
 */
export const DEV_PREDICTION_CONFIG: BranchPredictionConfig = {
  enabled: true,
  maxConcurrentPredictions: 2,   // Predict top 2 choices
  predictionTimeout: 8000,         // 8 second timeout per prediction
  cacheSize: 10,                   // Keep 10 cached branches
  stateDriftThreshold: 0.15,       // 15% state drift tolerance
  debounceMs: 500,                 // Wait 500ms before predicting
  slidingWindowSize: 40,           // Track last 40 interactions
};

/**
 * Production mode: Optimized for performance and cost
 */
export const PROD_PREDICTION_CONFIG: BranchPredictionConfig = {
  enabled: true,
  maxConcurrentPredictions: 2,   // Predict top 2 choices
  predictionTimeout: 10000,        // 10 second timeout
  cacheSize: 15,                   // Keep 15 cached branches
  stateDriftThreshold: 0.20,       // 20% state drift tolerance (more cache hits)
  debounceMs: 700,                 // Wait 700ms before predicting
  slidingWindowSize: 50,           // Track last 50 interactions
};

/**
 * Aggressive mode: Maximum prediction coverage (higher API costs)
 */
export const AGGRESSIVE_PREDICTION_CONFIG: BranchPredictionConfig = {
  enabled: true,
  maxConcurrentPredictions: 3,   // Predict top 3 choices
  predictionTimeout: 12000,        // 12 second timeout
  cacheSize: 20,                   // Keep 20 cached branches
  stateDriftThreshold: 0.10,       // 10% state drift (more accuracy)
  debounceMs: 300,                 // Quick predictions
  slidingWindowSize: 60,           // Track last 60 interactions
};

/**
 * Conservative mode: Minimal prediction (lower API costs)
 */
export const CONSERVATIVE_PREDICTION_CONFIG: BranchPredictionConfig = {
  enabled: true,
  maxConcurrentPredictions: 1,   // Predict only top choice
  predictionTimeout: 8000,         // 8 second timeout
  cacheSize: 8,                    // Keep 8 cached branches
  stateDriftThreshold: 0.25,       // 25% state drift tolerance
  debounceMs: 1000,                // Wait 1 second before predicting
  slidingWindowSize: 30,           // Track last 30 interactions
};

/**
 * Disabled mode: Branch prediction off
 */
export const DISABLED_PREDICTION_CONFIG: BranchPredictionConfig = {
  enabled: false,
  maxConcurrentPredictions: 0,
  predictionTimeout: 0,
  cacheSize: 0,
  stateDriftThreshold: 0,
  debounceMs: 0,
  slidingWindowSize: 0,
};

/**
 * Get the appropriate config based on environment
 */
export function getBranchPredictionConfig(): BranchPredictionConfig {
  // Check environment variable
  const env = import.meta.env.MODE || 'development';

  if (env === 'production') {
    return PROD_PREDICTION_CONFIG;
  }

  return DEV_PREDICTION_CONFIG;
}

/**
 * Get config by name
 */
export function getConfigByName(
  name: 'default' | 'dev' | 'prod' | 'aggressive' | 'conservative' | 'disabled'
): BranchPredictionConfig {
  switch (name) {
    case 'dev':
      return DEV_PREDICTION_CONFIG;
    case 'prod':
      return PROD_PREDICTION_CONFIG;
    case 'aggressive':
      return AGGRESSIVE_PREDICTION_CONFIG;
    case 'conservative':
      return CONSERVATIVE_PREDICTION_CONFIG;
    case 'disabled':
      return DISABLED_PREDICTION_CONFIG;
    default:
      return DEFAULT_PREDICTION_CONFIG;
  }
}
