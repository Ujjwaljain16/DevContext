/**
 * Layer 2: Pattern Matching Engine
 * 
 * From PRD Section 13.2:
 * "Applied after Layer 1 on every signal. Uses regex and diff analysis. 
 *  No external calls."
 * 
 * These patterns look for more complex behavioral signals:
 * - Symbol renames (indicates refactoring intent)
 * - Dead code removal (indicates code cleanup)
 * - Import restructuring (indicates architecture change)
 * - Repeated edits to same lines (indicates debugging loop)
 */

import { Signal, ModuleState } from "../types";

/**
 * Apply all Layer 2 patterns to current state based on signal.
 */
export function applyLayer2Patterns(state: ModuleState, signal: Signal): void {
  // Pattern 1: High edit frequency on same file = debugging loop
  detectDebuggingLoop(state, signal);

  // Pattern 2: Multiple file edits across related modules = refactoring
  detectRefactoringActivity(state, signal);

  // Pattern 3: Large diff with new function/class = feature implementation
  detectFeatureAddition(state, signal);

  // Pattern 4: Diff shows lots of deletions = cleanup/removal
  detectCodeCleanup(state, signal);

  // Pattern 5: Related files touched together suggest architectural feature
  detectFeatureSpan(state, signal);
}

/**
 * Pattern 1: If same file touched multiple times in short period,
 * likely in a debugging/iteration loop.
 */
function detectDebuggingLoop(state: ModuleState, signal: Signal): void {
  const recentTouches = state.touchedFiles.filter((f) => f === signal.filePath);

  // If same file appears multiple times in recent history, we're iterating
  if (recentTouches.length >= 3) {
    if (!state.currentState.includes("debugging") && !state.currentState.includes("iterating")) {
      state.currentState = `Iterating/debugging on ${signal.filePath.split("/").pop()}`;
    }

    // Add to failed attempts if we keep trying same thing
    if (!state.failedAttempts.some((a) => a.includes("multiple attempts"))) {
      state.failedAttempts.push("Multiple attempts on same file - may be in debug loop");
    }
  }
}

/**
 * Pattern 2: If touched files form a coherent module/feature (e.g., auth/*),
 * this indicates refactoring or feature work across a subsystem.
 */
function detectRefactoringActivity(state: ModuleState, signal: Signal): void {
  // Collect directory prefixes of recent touches (first meaningful directory)
  const dirs = new Set<string>();
  for (const file of state.touchedFiles.slice(-10)) {
    const parts = file.split("/");
    // Get first directory after 'src' (e.g., "auth" from "src/auth/login.ts")
    if (parts.length > 1) {
      const dir = parts[1] || parts[0]; // Take second part if exists, else first
      if (dir && !dir.includes(".")) {
        dirs.add(dir);
      }
    }
  }

  // If files span multiple dirs, likely refactoring that touches many parts
  if (dirs.size >= 3) {
    if (!state.decisions.some((d) => d.toLowerCase().includes("refactor"))) {
      state.decisions.push("refactoring: Touching multiple modules");
    }
  }

  // If multiple files changed in one signal, likely focused work
  if (state.touchedFiles.length >= 3 && !state.currentState.includes("large refactor")) {
    const uniqueDirs = new Set(
      state.touchedFiles.map((f) => {
        const parts = f.split("/");
        return parts.slice(0, 2).join("/");
      })
    );

    if (uniqueDirs.size >= 2) {
      state.currentState = `Large refactor across ${uniqueDirs.size} subsystems`;
    }
  }
}

/**
 * Pattern 3: New functions, classes, or significant additions = feature work
 * Heuristic: diff with many additions (50+ lines) in new file or major growth
 */
function detectFeatureAddition(state: ModuleState, signal: Signal): void {
  // Heuristic: if diffLines > 50 and file is new or grew significantly
  if (signal.diffLines && signal.diffLines > 50) {
    if (!state.currentTask.includes("implement") && !state.currentTask.includes("add")) {
      state.currentTask = `Implementing new feature in ${signal.filePath.split("/").pop()}`;
    }

    if (!state.currentState.includes("feature")) {
      state.currentState = "Feature implementation in progress";
    }

    if (!state.nextSteps.some((s) => s.includes("test"))) {
      state.nextSteps.push("Write tests for new feature");
    }
  }
}

/**
 * Pattern 4: Many deletions + few additions = code cleanup or refactoring away.
 * Heuristic: if diffLines are negative (more removed than added)
 */
function detectCodeCleanup(state: ModuleState, signal: Signal): void {
  // If diff shows net removal of lines
  if (signal.diffLines && signal.diffLines < -10) {
    if (!state.currentTask.includes("cleanup") && !state.currentTask.includes("remove")) {
      state.currentTask = "Code cleanup and removal";
    }

    if (!state.decisions.some((d) => d.includes("code cleanup"))) {
      state.decisions.push("Removing dead code or deprecated patterns");
    }
  }
}

/**
 * Pattern 5: Detect related files touched together.
 * E.g., utils/db.ts + services/user.ts + controllers/user.ts = user feature
 *
 * This is a heuristic that looks for common prefixes in touched files:
 * If you're editing entity files + service files + controller files together,
 * you're likely working on a coherent feature.
 */
function detectFeatureSpan(state: ModuleState, signal: Signal): void {
  const recent = state.touchedFiles.slice(-8);

  // Extract entity names from file paths
  // E.g., ["users.ts", "user.service.ts", "user.controller.ts"] all relate to "user"
  const entities = extractEntitiesFromPaths(recent);

  if (entities.size >= 2) {
    // Multiple related entity names touched = coherent feature work
    const entitiesStr = Array.from(entities).join(", ");
    if (!state.currentTask.includes("user")) {
      state.currentTask = `Implementing features for: ${entitiesStr}`;
    }
  }

  // Check for common architectural layers (model → service → controller pattern)
  const layers = detectLayerSpan(recent);
  if (layers.size >= 3) {
    state.currentState = "Working through full stack - model to controller";
  }
}

/**
 * Extract entity names from file paths.
 * E.g., ["src/users.ts", "src/user.service.ts"] → ["user", "users"]
 */
function extractEntitiesFromPaths(paths: string[]): Set<string> {
  const entities = new Set<string>();

  for (const path of paths) {
    const fileName = path.split("/").pop() || "";
    const baseName = fileName.replace(/\.(ts|js|tsx|jsx)$/, "").replace(/\.(service|controller|model|dto|test|spec)/, "");

    // Singular and plural forms
    for (const part of baseName.split(/[._-]/)) {
      if (part.length > 2 && part !== "src" && part !== "lib") {
        entities.add(part);
      }
    }
  }

  return entities;
}

/**
 * Detect if files span multiple architectural layers.
 * Layers: model/entity, service/logic, controller/route, dto/schema
 */
function detectLayerSpan(paths: string[]): Set<string> {
  const layerKeywords: Record<string, string[]> = {
    model: ["model", "entity", "schema", "domain"],
    service: ["service", "business", "logic"],
    controller: ["controller", "route", "handler", "endpoint"],
    dto: ["dto", "request", "response", "view"],
  };

  const foundLayers = new Set<string>();

  for (const path of paths) {
    for (const [layer, keywords] of Object.entries(layerKeywords)) {
      if (keywords.some((kw) => path.toLowerCase().includes(kw))) {
        foundLayers.add(layer);
      }
    }
  }

  return foundLayers;
}

/**
 * Helper: Count additions/deletions in diff
 * Simple heuristic: count +/- lines (not used in Signal yet, but available)
 */
export function parseDiffStats(diff: string): { additions: number; deletions: number } {
  const addLines = (diff.match(/^\+/gm) || []).length;
  const delLines = (diff.match(/^-/gm) || []).length;
  return {
    additions: addLines,
    deletions: delLines,
  };
}

/**
 * Detect if developer pattern suggests "stuck" or "loop" behavior.
 * Heuristic: same file edited N times without clear progress.
 */
export function detectStuckPattern(state: ModuleState, windowSize: number = 10): boolean {
  const recent = state.touchedFiles.slice(-windowSize);
  
  // Use actual window size (might be less than requested if not enough files)
  const actualWindow = recent.length;
  if (actualWindow === 0) return false;
  
  const fileFrequency = new Map<string, number>();

  for (const file of recent) {
    fileFrequency.set(file, (fileFrequency.get(file) || 0) + 1);
  }

  // If one file appears 50% or more of the time, likely stuck
  const maxFreq = Math.max(...fileFrequency.values());
  return maxFreq / actualWindow > 0.5;
}
