/**
 * StateReducer: Deterministic state machine
 * Given a Signal and previous ModuleState, produces new ModuleState.
 * 
 * This is the pure, testable core from PRD Section 14.
 * Never has side effects. Never calls external services.
 * Input → Logic → Output. Testable inputs and outputs.
 */

import { Signal, ModuleState } from "./types";
import { applyLayer1Rules } from "./layers/layer1-rules";
import { applyLayer2Patterns } from "./layers/layer2-patterns";

/**
 * Process a signal through all layers and return new state.
 * Layers run in sequence: Layer 1 always, Layer 2 always, Layer 3 async (not here).
 */
export function reduceState(
  signal: Signal,
  previousState: ModuleState | null
): ModuleState {
  // Initialize or carry forward
  const state: ModuleState = previousState || initializeModuleState(signal);

  // Calculate time since last signal BEFORE updating lastSignalTime
  const timeSinceLastSignal = new Date(signal.timestamp).getTime() - new Date(state.lastSignalTime).getTime();
  const hoursSinceLastSignal = timeSinceLastSignal / (1000 * 60 * 60);

  // Track that we received a signal
  state.lastSignalTime = signal.timestamp;
  state.lastUpdated = signal.timestamp;

  // Add the file to touchedFiles (with dedup and size cap)
  addTouchedFile(state, signal.filePath);

  // Layer 1: Deterministic rules (always applied)
  applyLayer1Rules(state, signal);
  state.lastRuleLayerRun = signal.timestamp;

  // Layer 2: Pattern matching (always applied)
  applyLayer2Patterns(state, signal);
  state.lastPatternLayerRun = signal.timestamp;

  // Update confidence based on freshness
  // Confidence stays high if recent signals, decays if silent
  // (Layer 3 LLM refinement happens async, not here)
  updateConfidence(state, hoursSinceLastSignal);

  // Convergence check: ensure state doesn't grow unbounded
  pruneState(state);

  return state;
}

/**
 * Create fresh ModuleState from first signal
 */
function initializeModuleState(signal: Signal): ModuleState {
  return {
    module: signal.module,
    repo: signal.module, // Will be set by context manager
    branch: "unknown", // Will be set by context manager
    currentTask: "",
    currentState: "",
    decisions: [],
    failedAttempts: [],
    nextSteps: [],
    touchedFiles: [signal.filePath],
    lastUpdated: signal.timestamp,
    confidence: 0.3, // Start low until we have more signals
    confidenceDecay: 0.0,
    lastSignalTime: signal.timestamp,
    author: signal.author,
  };
}

/**
 * Add file to touchedFiles, maintaining LIFO order and size limit.
 * Cap at 20 recently-touched files per module.
 */
function addTouchedFile(state: ModuleState, filePath: string): void {
  const MAX_TOUCHED_FILES = 20;

  // Remove if already present (move to end)
  const idx = state.touchedFiles.indexOf(filePath);
  if (idx >= 0) {
    state.touchedFiles.splice(idx, 1);
  }

  // Add to end (most recent)
  state.touchedFiles.push(filePath);

  // Trim if too large
  if (state.touchedFiles.length > MAX_TOUCHED_FILES) {
    state.touchedFiles = state.touchedFiles.slice(-MAX_TOUCHED_FILES);
  }
}

/**
 * Confidence updates: boost on recent signals, decay on silence.
 * From PRD Section 13.3 — confidence rules for merge behavior.
 * 
 * @param state The module state to update
 * @param hoursSinceLastSignal Hours elapsed since the previous signal
 */
function updateConfidence(state: ModuleState, hoursSinceLastSignal: number): void {
  // If human corrected field, confidence stays high until it decays naturally
  if (state.humanCorrected) {
    // Decay slowly: drops below 0.3 after ~14 days of inactivity
    state.confidence = Math.max(0.3, 1.0 - hoursSinceLastSignal / (14 * 24 * 0.7));
    return;
  }

  // Normal signal-based confidence based on time gap
  if (hoursSinceLastSignal < 1) {
    // Recent signal within an hour: boost confidence
    state.confidence = Math.min(1.0, state.confidence + 0.15);
  } else if (hoursSinceLastSignal < 6) {
    // More than 1 hour but within session: maintain or slight boost
    state.confidence = Math.max(0.5, state.confidence + 0.05);
  } else if (hoursSinceLastSignal < 24) {
    // Yesterday: start decaying
    state.confidence = Math.max(0.4, state.confidence - 0.1);
  } else if (hoursSinceLastSignal < 24 * 3) {
    // A few days ago: decay more
    state.confidence = Math.max(0.2, state.confidence - 0.15);
  } else {
    // Stale: confidence decays to minimum
    state.confidence = Math.max(0.0, state.confidence - 0.25);
  }

  // Cap between 0 and 1
  state.confidence = Math.max(0.0, Math.min(1.0, state.confidence));
}

/**
 * Prune old data to prevent unbounded growth.
 * From PRD Section 6.2.3 — hard rule: never grow unbounded.
 */
function pruneState(state: ModuleState): void {
  const MAX_DECISIONS = 8;
  const MAX_FAILED_ATTEMPTS = 5;
  const MAX_NEXT_STEPS = 5;

  // Keep most recent decisions only
  if (state.decisions.length > MAX_DECISIONS) {
    state.decisions = state.decisions.slice(-MAX_DECISIONS);
  }

  // Keep most recent failed attempts (learning points)
  if (state.failedAttempts.length > MAX_FAILED_ATTEMPTS) {
    state.failedAttempts = state.failedAttempts.slice(-MAX_FAILED_ATTEMPTS);
  }

  // Keep 3-5 next steps max
  if (state.nextSteps.length > MAX_NEXT_STEPS) {
    state.nextSteps = state.nextSteps.slice(0, MAX_NEXT_STEPS);
  }

  // Truncate long strings to prevent noise
  if (state.currentTask.length > 200) {
    state.currentTask = state.currentTask.substring(0, 200);
  }
  if (state.currentState.length > 300) {
    state.currentState = state.currentState.substring(0, 300);
  }
}

/**
 * Merge two ModuleState objects (for concurrent edits, multi-author).
 * Conservative: when in doubt, choose less.
 * From PRD Section 9 — multi-developer merge.
 */
export function mergeModuleStates(
  stateA: ModuleState,
  stateB: ModuleState
): ModuleState {
  // Take the more recent version as base
  const baseState = new Date(stateA.lastUpdated) > new Date(stateB.lastUpdated) ? stateA : stateB;
  const otherState = baseState === stateA ? stateB : stateA;

  // If either was human-corrected, respect it
  if (baseState.humanCorrected && otherState.humanCorrected) {
    // Both human corrected: only merge if from same person and within 1 minute
    const baseTime = new Date(baseState.humanCorrectionTime || baseState.lastUpdated).getTime();
    const otherTime = new Date(otherState.humanCorrectionTime || otherState.lastUpdated).getTime();
    const timeDiff = Math.abs(baseTime - otherTime);

    if (
      baseState.author === otherState.author &&
      timeDiff < 60000
    ) {
      // Same person, same edit window — merge
      return {
        ...baseState,
        decisions: mergeLists(baseState.decisions, otherState.decisions),
        touchedFiles: mergeLists(baseState.touchedFiles, otherState.touchedFiles),
      };
    }
    // Different people or times: take most recent human edit
    return baseState;
  }

  if (baseState.humanCorrected) {
    // Only update non-human-authored fields
    return {
      ...baseState,
      touchedFiles: mergeLists(baseState.touchedFiles, otherState.touchedFiles),
      lastUpdated: new Date().toISOString(),
    };
  }

  if (otherState.humanCorrected) {
    // Only update non-human-authored fields
    return {
      ...otherState,
      touchedFiles: mergeLists(baseState.touchedFiles, otherState.touchedFiles),
      lastUpdated: new Date().toISOString(),
    };
  }

  // Neither human corrected: merge conservatively
  // Union decisions and failed attempts, prefer confidence from more recent
  return {
    ...baseState,
    decisions: mergeLists(baseState.decisions, otherState.decisions),
    failedAttempts: mergeLists(baseState.failedAttempts, otherState.failedAttempts),
    touchedFiles: mergeLists(baseState.touchedFiles, otherState.touchedFiles),
    // Keep higher confidence (more recent work was more certain)
    confidence: Math.max(baseState.confidence, otherState.confidence),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Deduplicate and merge two lists, keeping order and recent items.
 */
function mergeLists(listA: string[], listB: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // Add from A first (newer), then B
  for (const item of [...listA, ...listB]) {
    if (!seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }

  return result;
}
