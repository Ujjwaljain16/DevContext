import fs from "fs";
import path from "path";
import { ContextEntry, DevCtxConfig } from "./types";
import { getRepoRoot } from "./git";
import { callAI } from "./ai";

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

  return sessionFile;
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
