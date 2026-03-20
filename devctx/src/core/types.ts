/**
 * Signal from capture engine (file save, edit, commit, etc.)
 * Represents a single discrete event that updates module state.
 */
export interface Signal {
  type: "file_save" | "file_edit" | "git_commit" | "import_change" | "manual";
  timestamp: string;
  module: string;
  filePath: string;
  author: string;
  diffLines?: number; // Number of lines changed
  imports?: string[];
  commitMessage?: string;
  userNote?: string; // From devctx save --message
}

/**
 * ModuleState: The living, minimal truth about what developer is doing in one module.
 * This is what gets persisted and updated continuously.
 * From PRD Section 12.2
 */
export interface ModuleState {
  // Identity
  module: string; // Key: e.g., "src/auth", "lib/payments"
  repo: string;
  branch: string;

  // Core inference — the actual focus
  currentTask: string; // What dev is working on NOW
  currentState: string; // Where the work left off
  decisions: string[]; // Design/refactoring choices made
  failedAttempts: string[]; // Approaches tried and abandoned
  nextSteps: string[]; // What comes next
  
  // Tracking
  touchedFiles: string[]; // Files modified in this module (recent)
  lastUpdated: string; // Timestamp of last signal processed
  
  // Confidence — critical for safety
  confidence: number; // 0.0–1.0, only serve context if >= 0.5
  confidenceDecay: number; // Passive decay rate per day of inactivity
  lastSignalTime: string; // For decay calculation
  
  // Authoring — for multi-dev merge
  author: string; // Who last modified currentTask / currentState
  humanCorrected?: boolean; // Developer manually overrode inference
  humanCorrectionTime?: string; // When the manual override happened

  // Layer tracking
  lastRuleLayerRun?: string; // When Layer 1 last ran
  lastPatternLayerRun?: string; // When Layer 2 last ran
  lastLLMLayerRun?: string; // When Layer 3 last ran
  lastLLMResult?: {
    confidence: number;
    source: string;
    timestamp: string;
  };
}

/**
 * ContextEntry: User-facing API for save/resume operations.
 * Translates ModuleState[] for CLI and clipboard delivery.
 */
export interface ContextEntry {
  id: string;
  timestamp: string;
  branch: string;
  repo: string;
  author: string;

  // Core context
  task: string;
  goal?: string;
  approaches: string[];
  decisions: string[];
  currentState: string;
  nextSteps: string[];
  blockers?: string[];

  // Auto-captured
  filesChanged: string[];
  filesStaged: string[];
  recentCommits: string[];

  // Team
  assignee?: string;
  handoffNote?: string;

  // Summarization
  isSummary?: boolean;
  summarizesEntries?: string[]; // IDs of entries this summary covers
}

export interface DevCtxConfig {
  version: string;
  createdAt: string;
  repo: string;
}
