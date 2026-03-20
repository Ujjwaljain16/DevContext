/**
 * Layer 2 Patterns Tests
 * 
 * Tests pattern matching logic: debugging loops, refactoring detection, etc.
 */

import { applyLayer2Patterns, detectStuckPattern } from "./layer2-patterns";
import { Signal, ModuleState } from "../types";

describe("Layer 2: Pattern Matching", () => {
  const baseState: ModuleState = {
    module: "src/auth",
    repo: "myrepo",
    branch: "main",
    currentTask: "",
    currentState: "",
    decisions: [],
    failedAttempts: [],
    nextSteps: [],
    touchedFiles: [],
    lastUpdated: new Date().toISOString(),
    confidence: 0.5,
    confidenceDecay: 0,
    lastSignalTime: new Date().toISOString(),
    author: "user@example.com",
  };

  describe("Pattern 1: Debugging loop detection", () => {
    it("should detect debugging loop when same file touched 3+ times", () => {
      let state = { ...baseState };
      state.touchedFiles = ["file.ts", "file.ts", "file.ts"];

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "file.ts",
        author: "user@example.com",
      };

      applyLayer2Patterns(state, signal);

      expect(state.currentState.toLowerCase()).toContain("iterating");
    });

    it("should add failed attempt note when in debug loop", () => {
      let state = { ...baseState };
      state.touchedFiles = ["file.ts", "file.ts", "file.ts"];

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "file.ts",
        author: "user@example.com",
      };

      applyLayer2Patterns(state, signal);

      expect(state.failedAttempts.some((a: string) => a.includes("debug"))).toBe(true);
    });

    it("should not detect loop if file only appears once or twice", () => {
      let state = { ...baseState };
      state.touchedFiles = ["file.ts", "other.ts"];

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "file.ts",
        author: "user@example.com",
      };

      applyLayer2Patterns(state, signal);

      expect(state.currentState.toLowerCase()).not.toContain("iterating");
    });
  });

  describe("Pattern 2: Refactoring detection", () => {
    it("should detect refactoring when touching 3+ different directories", () => {
      let state = { ...baseState };
      state.touchedFiles = [
        "src/auth/login.ts",
        "src/utils/helpers.ts",
        "src/services/user.ts",
        "src/api/routes.ts",
      ];

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "src/middleware/auth.ts",
        author: "user@example.com",
      };

      applyLayer2Patterns(state, signal);

      expect(state.decisions.some((d: string) => d.includes("refactor"))).toBe(true);
    });

    it("should note full-stack work when touching model + service + controller", () => {
      let state = { ...baseState };
      state.touchedFiles = [
        "src/models/User.ts",
        "src/services/UserService.ts",
        "src/controllers/UserController.ts",
      ];

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "src/routes/user.ts",
        author: "user@example.com",
      };

      applyLayer2Patterns(state, signal);

      expect(state.currentState.toLowerCase()).toContain("stack");
    });
  });

  describe("Pattern 3: Feature addition detection", () => {
    it("should detect feature implementation with 50+ line diff", () => {
      let state = { ...baseState };

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/auth/mfa.ts",
        author: "user@example.com",
        diffLines: 75,
      };

      applyLayer2Patterns(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("implement");
    });

    it("should suggest writing tests for new feature", () => {
      let state = { ...baseState };

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/auth/mfa.ts",
        author: "user@example.com",
        diffLines: 60,
      };

      applyLayer2Patterns(state, signal);

      expect(state.nextSteps.some((s: string) => s.toLowerCase().includes("test"))).toBe(true);
    });
  });

  describe("Pattern 4: Code cleanup detection", () => {
    it("should detect cleanup when net removing 10+ lines", () => {
      let state = { ...baseState };

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/auth/old-api.ts",
        author: "user@example.com",
        diffLines: -15,
      };

      applyLayer2Patterns(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("cleanup");
    });

    it("should note code removal decision", () => {
      let state = { ...baseState };

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "src/old.ts",
        author: "user@example.com",
        diffLines: -20,
      };

      applyLayer2Patterns(state, signal);

      expect(state.decisions.some((d: string) => d.includes("dead code"))).toBe(true);
    });
  });

  describe("Pattern 5: Feature span detection", () => {
    it("should detect related entity work (user feature)", () => {
      let state = { ...baseState };
      state.touchedFiles = [
        "src/models/user.ts",
        "src/services/userService.ts",
        "src/controllers/userController.ts",
      ];

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "src/routes/user.ts",
        author: "user@example.com",
      };

      applyLayer2Patterns(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("user");
    });

    it("should detect multiple entities being worked on", () => {
      let state = { ...baseState };
      state.touchedFiles = [
        "src/user.ts",
        "src/product.ts",
        "src/order.ts",
        "src/payment.ts",
      ];

      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "src/inventory.ts",
        author: "user@example.com",
      };

      applyLayer2Patterns(state, signal);

      expect(state.currentTask).toBeTruthy();
    });
  });

  describe("detectStuckPattern", () => {
    it("should return true when same file appears 50%+ of the time", () => {
      const files = ["debug.ts", "debug.ts", "debug.ts", "debug.ts", "other.ts", "other.ts"];
      const stuck = detectStuckPattern({ ...baseState, touchedFiles: files });

      expect(stuck).toBe(true);
    });

    it("should return false when files are varied", () => {
      const files = [
        "file1.ts",
        "file2.ts",
        "file3.ts",
        "file4.ts",
        "file5.ts",
      ];
      const stuck = detectStuckPattern({ ...baseState, touchedFiles: files });

      expect(stuck).toBe(false);
    });

    it("should use window size parameter", () => {
      const files = ["debug.ts", "debug.ts", "debug.ts", "other.ts"];
      const stuckSmall = detectStuckPattern({ ...baseState, touchedFiles: files }, 4);
      const stuckLarge = detectStuckPattern({ ...baseState, touchedFiles: files }, 10);

      // With window=4: 3/4 = 75% (stuck)
      // With window=10: uses only last 4, still 3/4 (stuck)
      expect(stuckSmall).toBe(true);
    });
  });
});
