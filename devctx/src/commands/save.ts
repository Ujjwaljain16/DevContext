import chalk from "chalk";
import inquirer from "inquirer";
import { v4 as uuid } from "uuid";
import { isInitialized, saveContext, loadBranchContext } from "../core/context";
import {
  getCurrentBranch,
  getRepoName,
  getChangedFiles,
  getStagedFiles,
  getRecentCommits,
  getAuthor,
  getUncommittedDiff,
  getChangesSummary,
  detectStuckState,
} from "../core/git";
import { ContextEntry } from "../core/types";
import { extractFromEditorSessions, extractFromUncommittedChanges } from "../core/parser";

interface SaveOptions {
  goal?: string;
  approaches?: string;
  decisions?: string;
  state?: string;
  nextSteps?: string;
  blockers?: string;
  assignee?: string;
  handoffNote?: string;
  auto?: boolean;
  smart?: boolean;
}

export async function saveCommand(message?: string, options?: SaveOptions) {
  if (!(await isInitialized())) {
    console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
    return;
  }

  try {
    const [branch, repo, filesChanged, filesStaged, recentCommits, author] = await Promise.all([
      getCurrentBranch(),
      getRepoName(),
      getChangedFiles(),
      getStagedFiles(),
      getRecentCommits(),
      getAuthor(),
    ]);

    let task = message || "";
    let approaches: string[] = [];
    let decisions: string[] = [];
    let currentState = "";
    let nextSteps: string[] = [];
    let blockers: string[] = [];

    // Check if structured flags were provided (AI agent mode)
    const hasStructuredInput =
      options?.approaches || options?.decisions || options?.state || options?.nextSteps;

    if (options?.smart) {
      // Smart mode: analyze uncommitted changes + file activity
      console.log(chalk.gray("  Analyzing uncommitted changes..."));
      const diff = await getUncommittedDiff();
      const changesSummary = await getChangesSummary();
      const smartContext = await extractFromUncommittedChanges({
        files: filesChanged,
        diff,
        changesSummary,
      });

      task = message || smartContext.task || "Smart capture: uncommitted changes";
      approaches = smartContext.approaches || [];
      decisions = smartContext.decisions || [];
      currentState = smartContext.currentState || "";
      nextSteps = smartContext.nextSteps || [];
      blockers = smartContext.blockers || [];

      // Check if stuck
      try {
        const prevEntries = await loadBranchContext(branch);
        const isStuck = await detectStuckState(prevEntries);
        if (isStuck) {
          blockers.push("⚠️ Possible stuck state: same files edited repeatedly");
          console.log(chalk.yellow("  ⚠️  Detected possible stuck state"));
        }
      } catch (err) {
        // Ignore errors in stuck detection
      }

      console.log(chalk.gray(`  Smart capture: ${filesChanged.length} files, auto-inferred task`));
    } else if (options?.auto) {
      // Auto-extract mode — read from editor session data
      console.log(chalk.gray("  Scanning editor sessions for context..."));
      const cwd = process.cwd();
      const extracted = await extractFromEditorSessions(cwd);

      if (extracted) {
        task = message || extracted.task;
        approaches = extracted.approaches;
        decisions = extracted.decisions;
        currentState = extracted.currentState;
        nextSteps = extracted.nextSteps;
        blockers = extracted.blockers;
        console.log(chalk.gray(`  Found context from: ${extracted.source}`));
      } else {
        console.log(chalk.yellow("⚠ No editor session data found. Using message only."));
        task = message || "Session (auto-extract found nothing)";
        currentState = message || "";
      }
    } else if (hasStructuredInput && message) {
      // Programmatic mode — AI agent is passing structured context
      task = message;
      approaches = options?.approaches
        ? options.approaches.split(";;").map((s) => s.trim()).filter(Boolean)
        : [];
      decisions = options?.decisions
        ? options.decisions.split(";;").map((s) => s.trim()).filter(Boolean)
        : [];
      currentState = options?.state || message;
      nextSteps = options?.nextSteps
        ? options.nextSteps.split(";;").map((s) => s.trim()).filter(Boolean)
        : [];
      blockers = options?.blockers
        ? options.blockers.split(";;").map((s) => s.trim()).filter(Boolean)
        : [];
    } else if (!message) {
      // Interactive mode
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "task",
          message: "What were you working on?",
          validate: (input: string) => input.length > 0 || "Task description is required",
        },
        {
          type: "input",
          name: "approaches",
          message: "What approaches did you try? (comma-separated, or skip)",
          default: "",
        },
        {
          type: "input",
          name: "decisions",
          message: "Key decisions made? (comma-separated, or skip)",
          default: "",
        },
        {
          type: "input",
          name: "currentState",
          message: "Where did you leave off?",
          validate: (input: string) => input.length > 0 || "Current state is required",
        },
        {
          type: "input",
          name: "nextSteps",
          message: "What comes next? (comma-separated, or skip)",
          default: "",
        },
        {
          type: "input",
          name: "blockers",
          message: "Any blockers? (comma-separated, or skip)",
          default: "",
        },
      ]);

      task = answers.task;
      approaches = answers.approaches
        ? answers.approaches.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      decisions = answers.decisions
        ? answers.decisions.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      currentState = answers.currentState;
      nextSteps = answers.nextSteps
        ? answers.nextSteps.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
      blockers = answers.blockers
        ? answers.blockers.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
    } else {
      // Simple message mode
      currentState = message;
    }

    const entry: ContextEntry = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      branch,
      repo,
      author,
      task,
      goal: options?.goal,
      approaches,
      decisions,
      currentState,
      nextSteps,
      blockers: blockers.length > 0 ? blockers : undefined,
      filesChanged,
      filesStaged,
      recentCommits,
      assignee: options?.assignee,
      handoffNote: options?.handoffNote,
    };

    const savedTo = await saveContext(entry);
    console.log(chalk.green(`✓ Context saved for branch: ${chalk.bold(branch)}`));
    console.log(
      chalk.gray(
        `  ${filesChanged.length} files changed, ${recentCommits.length} recent commits captured`
      )
    );
    if (approaches.length > 0) {
      console.log(chalk.gray(`  ${approaches.length} approaches, ${decisions.length} decisions recorded`));
    }
  } catch (err: any) {
    console.log(chalk.red(`✗ Error: ${err.message}`));
  }
}
