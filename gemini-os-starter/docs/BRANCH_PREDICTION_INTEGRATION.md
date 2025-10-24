# Branch Prediction System - Integration Guide

## Overview

The Branch Prediction System pre-generates AI responses for likely player choices, reducing response time from 2-5 seconds to near-instant (0-100ms) for predicted branches.

## Architecture

```
┌─────────────────────┐
│   Player Action     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐      ┌────────────────────┐
│ Behavior Tracker    │─────▶│  Choice Ranking    │
│ (Sliding Window)    │      │  (Score Choices)   │
└─────────────────────┘      └──────────┬─────────┘
                                        │
                                        ▼
                             ┌────────────────────┐
                             │  Branch Predictor  │
                             │  (Generate Top N)  │
                             └──────────┬─────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    │                                       │
                    ▼                                       ▼
          ┌──────────────────┐                   ┌──────────────────┐
          │  Branch Cache    │                   │  Gemini API      │
          │  (Check Cache)   │                   │  (Generate New)  │
          └──────────────────┘                   └──────────────────┘
                    │                                       │
                    └───────────────────┬───────────────────┘
                                        │
                                        ▼
                              ┌────────────────────┐
                              │  Cached Branches   │
                              │  (Instant Lookup)  │
                              └────────────────────┘
```

## How It Works

### 1. Player Behavior Tracking

**Service:** `services/playerBehaviorTracker.ts`

Tracks player choices in a sliding window (default: last 40 interactions) and calculates preferences:

```typescript
{
  combat: 0.65,     // Player chooses combat 65% of the time
  dialogue: 0.20,   // Dialogue 20%
  loot: 0.10,       // Loot 10%
  heal: 0.05        // Heal 5%
}
```

### 2. Smart Choice Ranking

**Service:** `services/branchPredictor.ts`

Ranks available choices using:
- **60%** Player preference score (from behavior tracker)
- **30%** Context urgency (e.g., low HP → prioritize heal)
- **10%** Random factor (for variety)

Example:
```
Scene has 4 choices:
1. "Attack the enemy" (combat)    → Score: 0.85 ✓ PREDICT
2. "Negotiate" (dialogue)          → Score: 0.42 ✓ PREDICT
3. "Take the treasure" (loot)     → Score: 0.28
4. "Retreat" (exploration)         → Score: 0.15
```

### 3. Cache Management

**Service:** `services/branchCache.ts`

- **LRU Cache:** Evicts oldest entries when full
- **TTL:** 5-minute expiration per branch
- **Fuzzy Matching:** Tolerates 15% state drift (HP/level changes)
- **Memory:** ~10KB per cached branch, max 10-20 branches

### 4. Background Generation

**Hook:** `hooks/useBranchPrediction.ts`

- Debounced: Waits 500ms after scene appears before predicting
- Async: Runs in background, doesn't block UI
- Timeout: 8-second max per prediction
- Queue: Processes top N choices in parallel

## Integration Steps

### Step 1: Initialize in App Component

Find your main game component (likely `App.tsx` or similar) and add the branch prediction hook:

```typescript
import { useBranchPrediction } from './hooks/useBranchPrediction';
import { branchPredictor } from './services/branchPredictor';
import { getBranchPredictionConfig } from './config/branchPredictionConfig';

// In your component
function GameApp() {
  // ... existing state ...

  // Configure predictor on mount
  useEffect(() => {
    const config = getBranchPredictionConfig();
    branchPredictor.configure(config);
  }, []);

  // Create player state snapshot
  const playerState = useMemo(() => ({
    hp: Math.round(playerHP / 10) * 10, // Coarse-grained for caching
    level: playerLevel,
    invCount: inventory.length,
    roomId: currentRoomId,
  }), [playerHP, playerLevel, inventory.length, currentRoomId]);

  // Initialize branch prediction
  const branchPrediction = useBranchPrediction({
    enabled: true,
    sessionId: currentSessionId,
    currentSceneId: currentSceneId,
    playerState,
    interactionHistory: interactionHistory,
    characterClass: selectedClass,
    storyContext: storyContext,
  });

  // ... rest of component ...
}
```

### Step 2: Extract Choices from AI Response

When the AI generates a scene with choices, extract them into `ChoiceOption` format:

```typescript
// Parse AI JSON response
const sceneData = JSON.parse(aiResponse);

// Extract choices
const choices: ChoiceOption[] = sceneData.choices?.map(choice => ({
  id: choice.id,
  text: choice.text,
  type: choice.type,
  value: choice.value,
})) || [];

// Trigger prediction
if (choices.length > 0) {
  branchPrediction.predictBranches(choices);
}
```

### Step 3: Check for Predicted Branches on User Choice

When player clicks a choice, check if we have a prediction:

```typescript
const handleUserChoice = async (choiceId: string, choiceType: string) => {
  // Check if we predicted this branch
  const predicted = branchPrediction.getPredictedBranch(choiceId);

  if (predicted) {
    // ⚡ INSTANT: Use cached response
    console.log('✓ Using predicted branch (instant response)');
    setSceneContent(predicted.sceneResponse);

    // Track for behavior learning
    branchPrediction.trackInteraction(choiceType, choiceId);

    return;
  }

  // ⏳ FALLBACK: Generate normally (2-5 seconds)
  console.log('⏳ No prediction, generating...');
  const response = await generateSceneFromChoice(choiceId);
  setSceneContent(response);

  // Still track for future predictions
  branchPrediction.trackInteraction(choiceType, choiceId);
};
```

### Step 4: Track Interactions in Event Logger

When logging events, include the `choiceType`:

```typescript
eventLogger.logEvent(
  'choice',
  roomId,
  playerLevel,
  playerHP,
  `Player chose: ${choiceText}`,
  {
    choiceId: choiceId,
    choiceText: choiceText,
    choiceType: choiceType,  // ← ADD THIS
    consequenceType: 'neutral',
  }
);
```

### Step 5: (Optional) Display Prediction Status

Show prediction status in dev mode or debug panel:

```typescript
function PredictionDebugPanel() {
  const { status, stats } = branchPrediction;

  return (
    <div className="prediction-status">
      <h4>Branch Prediction</h4>
      <p>Active: {status.isActive ? 'Yes' : 'No'}</p>
      <p>Queue: {status.queueSize}</p>
      <p>Predictions: {status.completedPredictions}</p>
      <p>Cache Hit Rate: {(stats.cacheHitRate * 100).toFixed(1)}%</p>
      <p>Avg Response: {status.averageResponseTime.toFixed(0)}ms</p>
    </div>
  );
}
```

## Configuration

### Quick Configuration

```typescript
import { branchPredictor } from './services/branchPredictor';

// Choose a preset
branchPredictor.configure({
  enabled: true,
  maxConcurrentPredictions: 2,  // Predict top 2 choices
  stateDriftThreshold: 0.15,     // 15% drift tolerance
});
```

### Available Presets

```typescript
import { getConfigByName } from './config/branchPredictionConfig';

// Conservative (lowest cost)
const config = getConfigByName('conservative');

// Balanced (recommended)
const config = getConfigByName('prod');

// Aggressive (best UX, higher cost)
const config = getConfigByName('aggressive');

// Disabled
const config = getConfigByName('disabled');

branchPredictor.configure(config);
```

### Custom Configuration

```typescript
branchPredictor.configure({
  enabled: true,
  maxConcurrentPredictions: 3,   // Predict top 3 choices
  predictionTimeout: 10000,       // 10 second timeout
  cacheSize: 15,                  // Keep 15 cached branches
  stateDriftThreshold: 0.20,      // 20% state drift tolerance
  debounceMs: 500,                // Wait 500ms before predicting
  slidingWindowSize: 50,          // Track last 50 interactions
});
```

## API Reference

### `useBranchPrediction(options)`

**Options:**
- `enabled: boolean` - Enable/disable prediction
- `sessionId: string` - Current session ID
- `currentSceneId: string` - Current scene ID
- `playerState: PlayerStateSnapshot` - Current player state
- `interactionHistory: any[]` - Interaction history for AI context
- `characterClass?: string` - Player's character class
- `storyContext?: string` - Story context for AI

**Returns:**
- `predictBranches(choices)` - Trigger prediction for choices
- `getPredictedBranch(choiceId)` - Get cached prediction
- `trackInteraction(type, id)` - Track player choice
- `status` - Worker status (queue size, active requests, etc.)
- `stats` - Statistics (cache hit rate, predictions)
- `clear()` - Clear all predictions

### `branchPredictor.configure(config)`

Configure the predictor globally.

### `playerBehaviorTracker.getStatistics()`

Get player behavior stats:
```typescript
{
  totalInteractions: 45,
  topChoiceType: 'combat',
  diversity: 0.72,  // 0-1, how varied are choices
  playstyle: 'aggressive' | 'diplomatic' | 'balanced' | 'cautious'
}
```

### `branchCache.getStats()`

Get cache statistics:
```typescript
{
  totalEntries: 8,
  hitRate: 0.65,        // 65% cache hit rate
  averageAge: 45000,    // Average age in ms
  memoryUsage: 81920    // ~80KB
}
```

## Performance & Cost Analysis

### Without Prediction
- **Response Time:** 2-5 seconds per choice
- **API Calls:** 1 per interaction
- **User Experience:** Noticeable delay

### With Prediction (2 branches)
- **Response Time:** 0-100ms for predicted choices (~60% hit rate)
- **API Calls:** ~1.5-2x (50-100% increase)
- **User Experience:** Feels instant for common choices
- **Cost:** +50-100% API usage

### Example Session (20 interactions)

| Metric | Without | With (Conservative) | With (Aggressive) |
|--------|---------|---------------------|-------------------|
| API Calls | 20 | ~30 | ~45 |
| Avg Response | 3.5s | 1.2s | 0.8s |
| Cache Hit Rate | 0% | 55% | 70% |
| User Wait Time | 70s total | 24s total | 16s total |
| Cost Multiplier | 1x | 1.5x | 2.25x |

## Debugging

### Console Logging

All services log to console with prefixes:
- `[BehaviorTracker]` - Player behavior events
- `[BranchCache]` - Cache hits/misses
- `[BranchPredictor]` - Prediction queue and generation

### Export Data

```javascript
// In browser console:

// Export behavior profile
console.log(window.playerBehaviorTracker.exportProfile());

// Export cache state
console.log(window.branchCache.export());

// Get prediction status
console.log(window.branchPredictor.getStatus());
```

### Common Issues

**Issue:** Predictions not triggering
- Check `enabled: true` in config
- Verify `availableChoices` has valid structure
- Check console for errors

**Issue:** Low cache hit rate (<30%)
- Increase `stateDriftThreshold` (try 0.25)
- Reduce `maxConcurrentPredictions` to 1-2
- Check if player state is too granular

**Issue:** High API costs
- Use `conservative` config preset
- Reduce `maxConcurrentPredictions` to 1
- Increase `debounceMs` to 1000+

## Best Practices

1. **Start Conservative:** Use `conservative` or `prod` config initially, scale up based on metrics

2. **Monitor Hit Rate:** Aim for 50-70% cache hit rate. Lower = wasted predictions, higher = excellent

3. **Coarse-Grain State:** Round HP to nearest 10, minimize inventory granularity to increase cache hits

4. **Scene-Specific Prediction:** Disable for trivial scenes (lore text), enable for combat/important choices

5. **User Feedback:** Consider adding a subtle indicator when using cached predictions (e.g., lightning bolt icon)

6. **A/B Testing:** Run 50% users with/without prediction to measure actual UX improvement

## Future Enhancements

- **2-Level Prediction:** Pre-gen choice outcome + its follow-up choices
- **ML-Based Ranking:** Train neural net on event logs to predict player choices
- **Cross-Player Cache:** Redis-backed cache for common story paths
- **Adaptive Config:** Auto-adjust `maxConcurrentPredictions` based on hit rate

## Support

For questions or issues:
1. Check console logs for detailed error messages
2. Verify configuration matches your use case
3. Export debug data using the console commands above
4. File an issue with reproduction steps
