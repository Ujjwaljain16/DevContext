import simpleGit from "simple-git";

const git = simpleGit();

export async function getCurrentBranch(): Promise<string> {
  const branch = await git.revparse(["--abbrev-ref", "HEAD"]);
  return branch.trim();
}

export async function getRepoName(): Promise<string> {
  const remote = await git.remote(["get-url", "origin"]).catch(() => null);
  if (remote) {
    const name = remote.trim().split("/").pop()?.replace(".git", "") || "unknown";
    return name;
  }
  const root = await git.revparse(["--show-toplevel"]);
  return root.trim().split("/").pop() || "unknown";
}

export async function getChangedFiles(): Promise<string[]> {
  const status = await git.status();
  return [...status.modified, ...status.created, ...status.not_added];
}

export async function getStagedFiles(): Promise<string[]> {
  const status = await git.status();
  return status.staged;
}

export async function getRecentCommits(count: number = 5): Promise<string[]> {
  const log = await git.log({ maxCount: count });
  return log.all.map((c) => `${c.hash.slice(0, 7)} ${c.message}`);
}

export async function getAuthor(): Promise<string> {
  const name = await git.raw(["config", "user.name"]).catch(() => "unknown");
  return name.trim();
}

export async function getRepoRoot(): Promise<string> {
  const root = await git.revparse(["--show-toplevel"]);
  return root.trim();
}

/**
 * Get uncommitted diff (both staged and unstaged)
 */
export async function getUncommittedDiff(): Promise<string> {
  try {
    const diff = await git.diff(["HEAD", "--"]);
    const stagedDiff = await git.diff(["--cached", "-"]);
    return (diff + "\n" + stagedDiff).trim();
  } catch (err) {
    return "";
  }
}

/**
 * Get a summary of what was changed (counts by file)
 */
export async function getChangesSummary(): Promise<Record<string, number>> {
  try {
    const diff = await git.diff(["HEAD", "--stat"]);
    const lines = diff.split("\n");
    const summary: Record<string, number> = {};

    for (const line of lines) {
      const match = line.match(/^(.+?)\s+\|\s+(\d+).*/);
      if (match) {
        summary[match[1]] = parseInt(match[2], 10);
      }
    }
    return summary;
  } catch (err) {
    return {};
  }
}

/**
 * Detect if currently stuck (same files edited repeatedly without progress)
 */
export async function detectStuckState(entries: any[]): Promise<boolean> {
  if (entries.length < 3) return false;

  const lastThree = entries.slice(-3);
  const filesEdited = lastThree.flatMap((e) => e.filesChanged);
  const uniqueFiles = new Set(filesEdited);

  // Stuck if: more than 70% files overlap in last 3 sessions
  const fileFreq = filesEdited.reduce((acc: Record<string, number>, f) => {
    acc[f] = (acc[f] || 0) + 1;
    return acc;
  }, {});

  const repeatedFiles = Object.values(fileFreq).filter((freq) => freq >= 2).length;
  return repeatedFiles / uniqueFiles.size > 0.7;
}
