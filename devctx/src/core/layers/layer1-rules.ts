/**
 * Layer 1: Deterministic Rules Engine
 * 
 * From PRD Section 13.1:
 * "These rules run synchronously on every signal. They are always applied, 
 *  always correct, and never call any external service."
 * 
 * Rules are stateless transformations based on file patterns, diff analysis,
 * and git metadata.
 */

import { Signal, ModuleState } from "../types";

/**
 * Apply all Layer 1 rules to current state based on signal.
 * Rules are applied in priority order; first match wins unless rule is additive.
 */
export function applyLayer1Rules(state: ModuleState, signal: Signal): void {
  // Rule 1: File naming patterns indicate task type
  inferTaskFromFileName(state, signal);

  // Rule 2: Import patterns indicate library focus
  inferTaskFromImports(state, signal);

  // Rule 3: Test file edits indicate testing/debugging
  detectTestFileActivity(state, signal);

  // Rule 4: Config file edits + imports suggest dependency change
  detectDependencyUpgrade(state, signal);

  // Rule 5: Comment patterns suggest decision or abandon
  detectCommentPatterns(state, signal);

  // Rule 6: Git commit message provides explicit task signal
  useCommitMessageAsSignal(state, signal);
}

/**
 * Rule 1: Analyze file name patterns to infer task focus.
 * E.g., "auth/login.ts" → focus on "login flow"
 *       "payments/stripe.ts" → focus on "Stripe integration"
 */
function inferTaskFromFileName(state: ModuleState, signal: Signal): void {
  if (signal.type !== "file_save" && signal.type !== "file_edit") return;

  const parts = signal.filePath.toLowerCase().split("/");
  const fileName = parts[parts.length - 1];
  const dirName = parts[Math.max(0, parts.length - 2)];

  const keywords: Record<string, string> = {
    // Auth patterns
    login: "authentication - login flow",
    auth: "authentication",
    signup: "user signup",
    session: "session management",
    token: "token/JWT handling",
    permission: "permissions/access control",

    // Data patterns
    migration: "database migration",
    schema: "database schema",
    seed: "data seeding",
    query: "query optimization",
    cache: "caching",
    database: "database work",

    // Payment patterns
    payment: "payment processing",
    stripe: "Stripe payment integration",
    invoice: "invoice generation",
    billing: "billing logic",
    checkout: "checkout flow",

    // API patterns
    route: "API routing",
    api: "API endpoints",
    client: "API client",
    endpoint: "API endpoint",

    // Test patterns (handled separately)
    test: "testing",
    spec: "test specifications",

    // Config patterns
    config: "configuration",
    env: "environment setup",

    // Email patterns
    email: "email handling",
    mail: "email delivery",
    notification: "notifications",

    // UI patterns
    component: "UI component",
    button: "UI component - button",
    form: "form handling",
    modal: "modal dialog",
    page: "page component",
  };

  // Check file and dir names
  // Check file and dir names - prioritize filename over directory
  // First pass: check filename (most specific)
  for (const [keyword, description] of Object.entries(keywords)) {
    if (fileName.includes(keyword)) {
      state.currentTask = description || "Working on " + keyword;
      return;
    }
  }
  // Second pass: check directory name (less specific)
  for (const [keyword, description] of Object.entries(keywords)) {
    if (dirName.includes(keyword)) {
      state.currentTask = description || "Working on " + keyword;
      return;
    }
  }
}

/**
 * Rule 2: Analyze import changes to infer technology focus.
 * E.g., "import { Client } from '@elastic/elasticsearch'" → Elasticsearch work
 */
function inferTaskFromImports(state: ModuleState, signal: Signal): void {
  if (!signal.imports || signal.imports.length === 0) return;

  const importPatterns: Record<string, string> = {
    // Database libraries
    prisma: "Prisma ORM implementation",
    orm: "ORM work",
    typeorm: "TypeORM migration",
    mongoose: "MongoDB implementation",
    sequelize: "SQL database work",
    knex: "SQL query builder",

    // Testing
    jest: "Jest testing setup",
    vitest: "Vitest setup",
    mocha: "Mocha testing",
    chai: "Assertion library",

    // HTTP/API
    axios: "HTTP client integration",
    fetch: "Fetch API work",
    express: "Express middleware",
    fastify: "Fastify routes",

    // Security
    bcrypt: "password hashing",
    jsonwebtoken: "JWT implementation",
    helmet: "security headers",
    cors: "CORS setup",

    // External API
    stripe: "Stripe payment integration",
    twilio: "Twilio messaging",
    sendgrid: "SendGrid email",
    auth0: "Auth0 integration",

    // UI libraries
    react: "React component",
    vue: "Vue implementation",
    svelte: "Svelte component",

    // Utilities
    lodash: "utility functions",
    moment: "date/time handling",
    uuid: "ID generation",
  };

  for (const imp of signal.imports) {
    for (const [lib, description] of Object.entries(importPatterns)) {
      if (imp.toLowerCase().includes(lib)) {
        if (!state.currentTask || !state.currentTask.includes("integration")) {
          state.currentTask = description;
        }
        return;
      }
    }
  }
}

/**
 * Rule 3: Test file activity (*.test.ts, *.spec.ts, /tests/) indicates testing/debugging
 */
function detectTestFileActivity(state: ModuleState, signal: Signal): void {
  const isTestFile =
    signal.filePath.includes(".test.") ||
    signal.filePath.includes(".spec.") ||
    signal.filePath.includes("/tests/") ||
    signal.filePath.includes("\\tests\\");

  if (!isTestFile) return;

  // Different signals imply different activities
  if (signal.type === "file_save") {
    // Might be fixing tests or adding new ones
    const task = state.currentTask.toLowerCase();
    if (!task.includes("test") && !task.includes("fix")) {
      state.currentTask = "Writing or fixing tests";
    }
  }

  // Test files in touchedFiles is a signal of recent testing activity
  if (!state.currentState.includes("test")) {
    state.currentState = "Testing/debugging " + (state.currentState || "implementation");
  }
}

/**
 * Rule 4: Config file edits + import changes = dependency upgrade/change
 * Patterns: package.json, tsconfig.json, .env* + import statements
 */
function detectDependencyUpgrade(state: ModuleState, signal: Signal): void {
  const isConfigFile =
    signal.filePath.includes("package.json") ||
    signal.filePath.includes("tsconfig.json") ||
    signal.filePath.includes(".env") ||
    signal.filePath.includes("requirements.txt") ||
    signal.filePath.includes("Gemfile") ||
    signal.filePath.includes("Cargo.toml");

  if (!isConfigFile) return;

  if (signal.imports && signal.imports.length > 0) {
    // Config change + new imports = likely dependency upgrade
    const firstImport = signal.imports[0];
    state.currentTask = `Upgrading/integrating ${firstImport}`;
    return;
  }

  // Just config change
  if (signal.filePath.includes("package.json")) {
    state.currentTask = "Managing dependencies";
  } else if (signal.filePath.includes("tsconfig")) {
    state.currentTask = "TypeScript configuration";
  } else if (signal.filePath.includes(".env")) {
    state.currentTask = "Environment setup";
  }
}

/**
 * Rule 5: Comment patterns in diffs suggest decision or plan change.
 * E.g., "// TODO: refactor", "// DEPRECATED:", "// NOTE: this might break"
 */
function detectCommentPatterns(state: ModuleState, signal: Signal): void {
  // This would require diff content, which we don't always have in Signal.
  // For now, use file path as proxy.
  // In full implementation, parse diff for comment patterns.
  // TODO: expand once Signal includes diff content
}

/**
 * Rule 6: Use git commit message as explicit task signal.
 * Takes precedence over file-based inference.
 */
function useCommitMessageAsSignal(state: ModuleState, signal: Signal): void {
  if (signal.type !== "git_commit" || !signal.commitMessage) return;

  const msg = signal.commitMessage.toLowerCase();

  // Skip generic messages
  if (msg.length < 5 || msg === "merge" || msg === "update") return;

  // Commit message overrides inferred task (human explicit signal)
  state.currentTask = signal.commitMessage;

  // Extract next-steps from commit message patterns
  if (msg.includes("wip") || msg.includes("work in progress")) {
    state.currentState = "In progress - work not yet complete";
  }

  if (msg.includes("fix") || msg.includes("bug")) {
    if (!state.failedAttempts.some((a) => a.toLowerCase().includes("fix"))) {
      state.failedAttempts.push("Previous implementation had issues, now fixing");
    }
  }

  if (msg.includes("refactor") || msg.includes("cleanup")) {
    state.decisions.push("Refactoring for clarity/maintainability");
  }
}

/**
 * Helper: Extract library name from import string
 * E.g., "import stripe from 'stripe'" → "stripe"
 */
function extractLibraryName(importStr: string): string {
  const match = importStr.match(/(?:from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"])/);
  if (match) {
    return (match[1] || match[2]).split("/")[0];
  }
  return importStr;
}
