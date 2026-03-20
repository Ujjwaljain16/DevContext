/**
 * Layer 1 Rules Tests
 * 
 * Tests deterministic file-based and import-based inference rules.
 */

import { applyLayer1Rules } from "./layer1-rules";
import { Signal, ModuleState } from "../types";

describe("Layer 1: Deterministic Rules", () => {
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

  describe("Rule 1: Task inference from file names", () => {
    it("should infer 'authentication - login flow' from login.ts", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/auth/login.ts",
        author: "user@example.com",
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.currentTask).toContain("login");
    });

    it("should infer task from directory and file name", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/payments",
        filePath: "src/payments/stripe.ts",
        author: "user@example.com",
      };

      const state = { ...baseState, module: "src/payments" };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("stripe");
    });

    it("should infer migration task from migration.ts", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/db",
        filePath: "src/db/migrations/20240101_add_users.ts",
        author: "user@example.com",
      };

      const state = { ...baseState, module: "src/db" };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("migration");
    });

    it("should infer schema task from schema.ts", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/db",
        filePath: "src/db/schema.ts",
        author: "user@example.com",
      };

      const state = { ...baseState, module: "src/db" };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("schema");
    });
  });

  describe("Rule 2: Task inference from imports", () => {
    it("should infer Prisma ORM from prisma import", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/auth/user.ts",
        author: "user@example.com",
        imports: ["@prisma/client"],
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("prisma");
    });

    it("should infer Stripe integration from stripe import", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/payments",
        filePath: "src/payments/processor.ts",
        author: "user@example.com",
        imports: ["stripe"],
      };

      const state = { ...baseState, module: "src/payments" };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("stripe");
    });

    it("should infer Express middleware from express import", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/api",
        filePath: "src/api/server.ts",
        author: "user@example.com",
        imports: ["express"],
      };

      const state = { ...baseState, module: "src/api" };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("express");
    });

    it("should infer JWT implementation from jsonwebtoken import", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/auth/tokens.ts",
        author: "user@example.com",
        imports: ["jsonwebtoken"],
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("jwt");
    });
  });

  describe("Rule 3: Test file detection", () => {
    it("should detect testing activity from .test.ts file", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/auth/login.test.ts",
        author: "user@example.com",
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("test");
    });

    it("should detect testing from .spec.ts file", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/auth/login.spec.ts",
        author: "user@example.com",
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("test");
    });

    it("should mark state as testing when test files touched", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src/auth",
        filePath: "src/__tests__/auth.test.ts",
        author: "user@example.com",
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.currentState.toLowerCase()).toContain("test");
    });
  });

  describe("Rule 4: Dependency upgrade detection", () => {
    it("should detect dependency upgrade from package.json + new import", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "package.json",
        author: "user@example.com",
        imports: ["axios"],
      };

      const state = { ...baseState, module: "src" };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("axios");
    });

    it("should detect TypeScript config changes", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "tsconfig.json",
        author: "user@example.com",
      };

      const state = { ...baseState, module: "src" };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("typescript");
    });

    it("should detect environment setup from .env changes", () => {
      const signal: Signal = {
        type: "file_save",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: ".env.local",
        author: "user@example.com",
      };

      const state = { ...baseState, module: "src" };
      applyLayer1Rules(state, signal);

      expect(state.currentTask.toLowerCase()).toContain("environment");
    });
  });

  describe("Rule 6: Commit message signals", () => {
    it("should use commit message as explicit task signal", () => {
      const signal: Signal = {
        type: "git_commit",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "src",
        author: "user@example.com",
        commitMessage: "feat: implement OAuth 2.0 login flow",
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.currentTask).toContain("OAuth");
    });

    it("should add failed attempt for bug fix commits", () => {
      const signal: Signal = {
        type: "git_commit",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "src",
        author: "user@example.com",
        commitMessage: "fix: resolve session timeout issue",
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.failedAttempts.some((a: string) => a.toLowerCase().includes("fix"))).toBe(true);
    });

    it("should mark refactoring decisions", () => {
      const signal: Signal = {
        type: "git_commit",
        timestamp: new Date().toISOString(),
        module: "src",
        filePath: "src",
        author: "user@example.com",
        commitMessage: "refactor: extract auth logic to service",
      };

      const state = { ...baseState };
      applyLayer1Rules(state, signal);

      expect(state.decisions.some((d: string) => d.toLowerCase().includes("refactor"))).toBe(true);
    });
  });
});
