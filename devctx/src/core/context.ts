import fs from "fs";
import path from "path";
import { ContextEntry, DevCtxConfig, ModuleState, Signal } from "./types";
import { getRepoRoot } from "./git";
import { callAI } from "./ai";
import { reduceState } from "./state-reducer";

export async function getDevCtxDir(): Promise<string> {
  const root = await getRepoRoot();
  return path.join(root, ".devctx");
}

export async function isInitialized(): Promise<boolean> {
  const dir = await getDevCtxDir();
  return fs.existsSync(dir);
}

export async function saveContext(entry: ContextEntry): Promise<string> {
  const dir = await getDevCtxDir();
  const sessionsDir = path.join(dir, "sessions");
  const branchesDir = path.join(dir, "branches");

  fs.mkdirSync(sessionsDir, { recursive: true });
  fs.mkdirSync(branchesDir, { recursive: true });

  // Save session
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 16);
  const sessionFile = path.join(sessionsDir, `${timestamp}.json`);
  fs.writeFileSync(sessionFile, JSON.stringify(entry, null, 2));

  // Update per-user branch context (prevents merge conflicts)
  const safeBranchName = entry.branch.replace(/\//g, "__");
  const userBranchDir = path.join(branchesDir, safeBranchName, entry.author);
  fs.mkdirSync(userBranchDir, { recursive: true });
  
  const userBranchFile = path.join(userBranchDir, "context.json");

  // Load existing entries for this user or start fresh
  let branchEntries: ContextEntry[] = [];
  if (fs.existsSync(userBranchFile)) {
    branchEntries = JSON.parse(fs.readFileSync(userBranchFile, "utf-8"));
  }
  branchEntries.push(entry);
  
  // Auto-summarize to prevent noise
  branchEntries = await autoSummarizeEntries(branchEntries);
  
  fs.writeFileSync(userBranchFile, JSON.stringify(branchEntries, null, 2));

  // Update index for fast lookups
  await updateIndex();

  // Phase 2: update module-level state machine snapshots for this save event
  await updateModuleStatesFromEntry(entry);

  return sessionFile;
}

/**
 * Load module states for a branch by merging per-user snapshots conservatively.
 */
export async function loadBranchModuleStates(branch: string): Promise<ModuleState[]> {
  const dir = await getDevCtxDir();
  const safeBranchName = branch.replace(/\//g, "__");
  const modulesDir = path.join(dir, "modules", safeBranchName);

  if (!fs.existsSync(modulesDir)) return [];

  const userFiles = fs
    .readdirSync(modulesDir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(modulesDir, f));

  const merged = new Map<string, ModuleState>();

  for (const userFile of userFiles) {
    let states: ModuleState[] = [];
    try {
      states = JSON.parse(fs.readFileSync(userFile, "utf-8"));
    } catch {
      continue;
    }

    for (const state of states) {
      const existing = merged.get(state.module);
      if (!existing) {
        merged.set(state.module, state);
        continue;
      }

      const existingTime = new Date(existing.lastUpdated).getTime();
      const incomingTime = new Date(state.lastUpdated).getTime();
      if (incomingTime >= existingTime) {
        merged.set(state.module, state);
      }
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );
}

/**
 * Apply reducer signals from a ContextEntry into per-user module snapshots.
 */
async function updateModuleStatesFromEntry(entry: ContextEntry): Promise<void> {
  const dir = await getDevCtxDir();
  const safeBranchName = entry.branch.replace(/\//g, "__");
  const safeAuthor = sanitizePathSegment(entry.author || "unknown");
  const branchModulesDir = path.join(dir, "modules", safeBranchName);
  const userModulesFile = path.join(branchModulesDir, `${safeAuthor}.json`);

  fs.mkdirSync(branchModulesDir, { recursive: true });

  let states: ModuleState[] = [];
  if (fs.existsSync(userModulesFile)) {
    try {
      states = JSON.parse(fs.readFileSync(userModulesFile, "utf-8"));
    } catch {
      states = [];
    }
  }

  const stateByModule = new Map<string, ModuleState>();
  for (const state of states) {
    stateByModule.set(state.module, state);
  }

  const touchedFiles = [...new Set([...(entry.filesChanged || []), ...(entry.filesStaged || [])])];
  if (touchedFiles.length === 0) {
    return;
  }

  for (const filePath of touchedFiles) {
    const module = inferModuleFromPath(filePath);
    const previous = stateByModule.get(module) || null;

    const signal: Signal = {
      type: "file_save",
      timestamp: entry.timestamp,
      module,
      filePath,
      author: entry.author,
      commitMessage: entry.recentCommits && entry.recentCommits.length > 0 ? entry.recentCommits[0] : undefined,
      userNote: entry.task,
    };

    const next = reduceState(signal, previous);
    next.repo = entry.repo;
    next.branch = entry.branch;

    // Carry explicit user intent into state while preserving inferred results.
    if (entry.currentState && entry.currentState.length > 0) {
      next.currentState = entry.currentState;
    }

    if (entry.decisions && entry.decisions.length > 0) {
      next.decisions = [...new Set([...next.decisions, ...entry.decisions])].slice(-8);
    }

    if (entry.nextSteps && entry.nextSteps.length > 0) {
      next.nextSteps = [...new Set([...entry.nextSteps, ...next.nextSteps])].slice(0, 5);
    }

    stateByModule.set(module, next);
  }

  const nextStates = Array.from(stateByModule.values()).sort(
    (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );

  fs.writeFileSync(userModulesFile, JSON.stringify(nextStates, null, 2));
}

function inferModuleFromPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length <= 1) return normalized || "root";

  if (segments[0] === "src" && segments.length >= 3) {
    return `${segments[0]}/${segments[1]}`;
  }

  if (segments.length >= 2) {
    return `${segments[0]}/${segments[1]}`;
  }

  return segments[0] || "root";
}

function sanitizePathSegment(input: string): string {
  return input.replace(/[\\/:*?"<>|]/g, "_");
}

export async function loadBranchContext(branch: string): Promise<ContextEntry[]> {
  const dir = await getDevCtxDir();
  const safeBranchName = branch.replace(/\//g, "__");
  const branchDir = path.join(dir, "branches", safeBranchName);

  if (!fs.existsSync(branchDir)) return [];

  // Load entries from all users for this branch
  const userDirs = fs.readdirSync(branchDir).filter((f) => {
    return fs.statSync(path.join(branchDir, f)).isDirectory();
  });

  const allEntries: ContextEntry[] = [];
  for (const userDir of userDirs) {
    const contextFile = path.join(branchDir, userDir, "context.json");
    if (fs.existsSync(contextFile)) {
      const entries = JSON.parse(fs.readFileSync(contextFile, "utf-8"));
      allEntries.push(...entries);
    }
  }

  // Sort by timestamp (newest last, so latest is at end)
  return allEntries.sort((a, b) => 
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

export async function loadAllSessions(): Promise<ContextEntry[]> {
  const dir = await getDevCtxDir();
  const sessionsDir = path.join(dir, "sessions");

  if (!fs.existsSync(sessionsDir)) return [];

  const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json")).sort().reverse();
  return files.map((f) => JSON.parse(fs.readFileSync(path.join(sessionsDir, f), "utf-8")));
}

/**
 * Merge context entries from multiple sources (e.g., after git pull).
 * Deduplicates by ID and sorts by timestamp.
 */
export function mergeContexts(
  local: ContextEntry[],
  remote: ContextEntry[]
): ContextEntry[] {
  const merged = new Map<string, ContextEntry>();

  for (const entry of [...local, ...remote]) {
    const existing = merged.get(entry.id);
    if (!existing || new Date(entry.timestamp) > new Date(existing.timestamp)) {
      merged.set(entry.id, entry);
    }
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
}

/**
 * Sync branch context file after pulling shared context.
 * With per-user storage, this deduplicates entries within each user's file.
 */
export async function syncBranchContext(branch: string): Promise<ContextEntry[]> {
  const dir = await getDevCtxDir();
  const safeBranchName = branch.replace(/\//g, "__");
  const branchDir = path.join(dir, "branches", safeBranchName);

  if (!fs.existsSync(branchDir)) return [];

  const userDirs = fs.readdirSync(branchDir).filter((f) => {
    return fs.statSync(path.join(branchDir, f)).isDirectory();
  });

  // Deduplicate within each user's context file
  for (const userDir of userDirs) {
    const contextFile = path.join(branchDir, userDir, "context.json");
    if (fs.existsSync(contextFile)) {
      const diskEntries: ContextEntry[] = JSON.parse(fs.readFileSync(contextFile, "utf-8"));
      const deduped = mergeContexts([], diskEntries);
      fs.writeFileSync(contextFile, JSON.stringify(deduped, null, 2));
    }
  }

  // Return merged context from all users
  return loadBranchContext(branch);
}

/**
 * Auto-summarize old entries to prevent noise.
 * Keeps last 3 raw entries + 1 rolling summary.
 * Only runs if count > 4 and AI is available.
 */
export async function autoSummarizeEntries(entries: ContextEntry[]): Promise<ContextEntry[]> {
  if (entries.length <= 4) {
    return entries; // Not enough to summarize
  }

  // Find existing summary
  const lastSummaryIdx = entries.findIndex((e) => e.isSummary);
  
  // Keep last 3 raw (non-summary) entries
  const rawEntries = entries.filter((e) => !e.isSummary);
  const entriesToKeep = rawEntries.slice(-3);
  
  // Entries to summarize: everything except last 3 raw
  const entriesToSummarize = rawEntries.slice(0, -3);
  
  if (entriesToSummarize.length === 0) {
    return entries;
  }

  // Try to generate summary using AI (fails gracefully if no AI available)
  let summaryText = "";
  try {
    const prompt = `Summarize the following development work into a concise narrative (2-3 sentences). Include progress made and any unresolved blockers:\n\n${entriesToSummarize
      .map((e) => `Task: ${e.task}\nState: ${e.currentState}`)
      .join("\n---\n")}`;

    const response = await callAI([{ role: "user", content: prompt }], { maxTokens: 150 });
    if (response.content && !response.error) {
      summaryText = response.content;
    }
  } catch (err) {
    // AI not available, create basic summary instead
    const tasks = entriesToSummarize.map((e) => e.task).join("; ");
    summaryText = `Earlier work: ${tasks}. Keep using 'devctx log' for full history.`;
  }

  // Create summary entry
  const summaryEntry: ContextEntry = {
    id: `summary-${Date.now()}`,
    timestamp: new Date(entriesToSummarize[entriesToSummarize.length - 1].timestamp).toISOString(),
    branch: entriesToSummarize[0].branch,
    repo: entriesToSummarize[0].repo,
    author: entriesToSummarize[0].author,
    task: `[SUMMARY] ${entriesToSummarize.length} sessions consolidated`,
    approaches: [],
    decisions: [],
    currentState: summaryText,
    nextSteps: [],
    filesChanged: [],
    filesStaged: [],
    recentCommits: [],
    isSummary: true,
    summarizesEntries: entriesToSummarize.map((e) => e.id),
  };

  // Return: old summary (if exists) + new summary + last 3 raw
  const result = [];
  if (lastSummaryIdx !== -1) {
    result.push(entries[lastSummaryIdx]);
  }
  result.push(summaryEntry);
  result.push(...entriesToKeep);

  return result;
}

/**
 * Build/update index for fast lookups
 * Index stores: timestamps, branch metadata, file references
 */
export async function updateIndex(): Promise<void> {
  const dir = await getDevCtxDir();
  const sessionDir = path.join(dir, "sessions");
  const indexFile = path.join(dir, "index.json");

  if (!fs.existsSync(sessionDir)) {
    fs.writeFileSync(indexFile, JSON.stringify({ sessions: {}, branches: {} }, null, 2));
    return;
  }

  const files = fs.readdirSync(sessionDir).filter((f) => f.endsWith(".json"));
  
  const index = {
    sessions: {} as Record<string, { timestamp: string; branch: string; author: string; filesChanged: string[] }>,
    branches: {} as Record<string, { latestTimestamp: string; entryCount: number }>,
  };

  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(sessionDir, file), "utf-8")) as ContextEntry;
      const safeBranch = content.branch.replace(/\//g, "__");
      
      index.sessions[file] = {
        timestamp: content.timestamp,
        branch: safeBranch,
        author: content.author,
        filesChanged: content.filesChanged,
      };

      if (!index.branches[safeBranch]) {
        index.branches[safeBranch] = { latestTimestamp: content.timestamp, entryCount: 0 };
      }
      index.branches[safeBranch].entryCount++;
      if (new Date(content.timestamp) > new Date(index.branches[safeBranch].latestTimestamp)) {
        index.branches[safeBranch].latestTimestamp = content.timestamp;
      }
    } catch (err) {
      // Skip malformed files
    }
  }

  fs.writeFileSync(indexFile, JSON.stringify(index, null, 2));
}
