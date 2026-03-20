/**
 * StateReducer Tests
 * 
 * Tests the core deterministic state machine logic.
 * From PRD Section 14: "Pure, testable core. Input → Logic → Output."
 */

import { reduceState, mergeModuleStates } from "./state-reducer";
import { Signal, ModuleState } from "./types";

describe("StateReducer", () => {
  const baseSignal: Signal = {
    type: "file_save",
    timestamp: new Date().toISOString(),
    module: "src/auth",
    filePath: "src/auth/login.ts",
    author: "user@example.com",
  };

  describe("reduceState", () => {
    it("should initialize new ModuleState from first signal", () => {
      const state = reduceState(baseSignal, null);

      expect(state.module).toBe("src/auth");
      expect(state.author).toBe("user@example.com");
      expect(state.touchedFiles).toContain("src/auth/login.ts");
      expect(state.confidence).toBeGreaterThan(0);
    });

    it("should add file to touchedFiles in LIFO order", () => {
      let state = reduceState(baseSignal, null);

      const signal2: Signal = {
        ...baseSignal,
        filePath: "src/auth/signup.ts",
        timestamp: new Date(Date.now() + 1000).toISOString(),
      };
      state = reduceState(signal2, state);

      expect(state.touchedFiles[state.touchedFiles.length - 1]).toBe("src/auth/signup.ts");
      expect(state.touchedFiles).toContain("src/auth/login.ts");
    });

    it("should move file to end of touchedFiles if already present", () => {
      let state = reduceState(baseSignal, null);

      const signal2: Signal = {
        ...baseSignal,
        filePath: "src/auth/signup.ts",
        timestamp: new Date(Date.now() + 1000).toISOString(),
      };
      state = reduceState(signal2, state);

      // Now touch the first file again
      const signal3: Signal = {
        ...baseSignal,
        filePath: "src/auth/login.ts",
        timestamp: new Date(Date.now() + 2000).toISOString(),
      };
      state = reduceState(signal3, state);

      // login.ts should now be at the end
      expect(state.touchedFiles[state.touchedFiles.length - 1]).toBe("src/auth/login.ts");
    });

    it("should cap touchedFiles at 20 items", () => {
      let state = reduceState(baseSignal, null);

      // Add 25 more files
      for (let i = 0; i < 25; i++) {
        const signal: Signal = {
          ...baseSignal,
          filePath: `src/auth/file${i}.ts`,
          timestamp: new Date(Date.now() + i * 1000).toISOString(),
        };
        state = reduceState(signal, state);
      }

      expect(state.touchedFiles.length).toBeLessThanOrEqual(20);
    });

    it("should increase confidence on recent signals", () => {
      let state = reduceState(baseSignal, null);
      const initialConfidence = state.confidence;

      const recentSignal: Signal = {
        ...baseSignal,
        timestamp: new Date(Date.now() + 5000).toISOString(),
      };
      state = reduceState(recentSignal, state);

      expect(state.confidence).toBeGreaterThan(initialConfidence);
    });

    it("should decay confidence over time without signals", () => {
      let state = reduceState(baseSignal, null);
      state.confidence = 0.8; // Start high

      // Simulate signal after 1 day
      const oldSignal: Signal = {
        ...baseSignal,
        timestamp: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
      state = reduceState(oldSignal, state);

      expect(state.confidence).toBeLessThan(0.8);
    });

    it("should cap confidence between 0 and 1", () => {
      const state = reduceState(baseSignal, null);

      expect(state.confidence).toBeGreaterThanOrEqual(0);
      expect(state.confidence).toBeLessThanOrEqual(1);
    });

    it("should prune decisions to keep max 8 items", () => {
      let state = reduceState(baseSignal, null);

      // Add 10 decisions manually
      for (let i = 0; i < 10; i++) {
        state.decisions.push(`Decision ${i}`);
      }

      // Trigger pruning by reducing state
      const signal: Signal = {
        ...baseSignal,
        timestamp: new Date(Date.now() + 1000).toISOString(),
      };
      state = reduceState(signal, state);

      expect(state.decisions.length).toBeLessThanOrEqual(8);
    });

    it("should prune failed attempts to keep max 5 items", () => {
      let state = reduceState(baseSignal, null);

      for (let i = 0; i < 10; i++) {
        state.failedAttempts.push(`Attempt ${i}`);
      }

      const signal: Signal = {
        ...baseSignal,
        timestamp: new Date(Date.now() + 1000).toISOString(),
      };
      state = reduceState(signal, state);

      expect(state.failedAttempts.length).toBeLessThanOrEqual(5);
    });

    it("should truncate long currentTask and currentState", () => {
      let state = reduceState(baseSignal, null);
      state.currentTask = "x".repeat(300);
      state.currentState = "y".repeat(400);

      const signal: Signal = {
        ...baseSignal,
        timestamp: new Date(Date.now() + 1000).toISOString(),
      };
      state = reduceState(signal, state);

      expect(state.currentTask.length).toBeLessThanOrEqual(200);
      expect(state.currentState.length).toBeLessThanOrEqual(300);
    });
  });

  describe("mergeModuleStates", () => {
    const stateA: ModuleState = {
      module: "src/auth",
      repo: "myrepo",
      branch: "main",
      currentTask: "Login flow",
      currentState: "Testing",
      decisions: ["Use OAuth", "Database: PostgreSQL"],
      failedAttempts: ["Custom JWT"],
      nextSteps: ["Deploy"],
      touchedFiles: ["src/auth/login.ts"],
      lastUpdated: new Date().toISOString(),
      confidence: 0.8,
      confidenceDecay: 0,
      lastSignalTime: new Date().toISOString(),
      author: "alice",
    };

    const stateB: ModuleState = {
      ...stateA,
      currentTask: "Fixing logout",
      lastUpdated: new Date(Date.now() + 1000).toISOString(),
      decisions: ["Add refresh token handling"],
      author: "bob",
    };

    it("should prefer more recent state as base", () => {
      const merged = mergeModuleStates(stateA, stateB);
      expect(merged.currentTask).toBe("Fixing logout");
    });

    it("should merge decisions from both states", () => {
      const merged = mergeModuleStates(stateA, stateB);
      expect(merged.decisions).toContain("Use OAuth");
      expect(merged.decisions).toContain("Database: PostgreSQL");
      expect(merged.decisions).toContain("Add refresh token handling");
    });

    it("should deduplicate decisions", () => {
      const stateBWithDupe = { ...stateB, decisions: ["Use OAuth"] };
      const merged = mergeModuleStates(stateA, stateBWithDupe);

      const oauthCount = merged.decisions.filter((d: string) => d === "Use OAuth").length;
      expect(oauthCount).toBe(1);
    });

    it("should keep higher confidence from either state", () => {
      const stateALow = { ...stateA, confidence: 0.3 };
      const stateBHigh = { ...stateB, confidence: 0.9 };

      const merged = mergeModuleStates(stateALow, stateBHigh);
      expect(merged.confidence).toBeGreaterThanOrEqual(0.9);
    });

    it("should respect human corrections", () => {
      const stateWithCorrection = {
        ...stateA,
        currentTask: "Corrected: User signup flow",
        humanCorrected: true,
      };
      const stateNew = { ...stateB, lastUpdated: new Date(Date.now() + 10000).toISOString() };

      const merged = mergeModuleStates(stateWithCorrection, stateNew);
      expect(merged.currentTask).toBe("Corrected: User signup flow");
    });
  });
});
