import chalk from "chalk";
import path from "path";
import { isInitialized, loadBranchContext, loadBranchModuleStates } from "../core/context";
import { getCurrentBranch, getRepoRoot } from "../core/git";
import { generateModulePrompt, generatePrompt } from "../core/prompt";
import { copyToClipboard } from "../utils/clipboard";

export async function resumeCommand(options?: { branch?: string; stdout?: boolean }) {
  if (!(await isInitialized())) {
    console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
    return;
  }

  try {
    const branch = options?.branch || (await getCurrentBranch());
    const [states, entries, repoRoot] = await Promise.all([
      loadBranchModuleStates(branch),
      loadBranchContext(branch),
      getRepoRoot(),
    ]);

    if (states.length === 0 && entries.length === 0) {
      console.log(chalk.yellow(`⚠ No context found for branch: ${branch}`));
      console.log(chalk.gray("  Run `devctx save` to capture context first."));
      return;
    }

    const pathHint = toRepoRelativePath(process.cwd(), repoRoot);
    const prompt = states.length > 0
      ? generateModulePrompt(states, {
        branch,
        currentPathHint: pathHint,
      })
      : generatePrompt(entries);

    if (options?.stdout) {
      console.log(prompt);
    } else {
      const copied = await copyToClipboard(prompt);
      if (copied) {
        console.log(chalk.green("📋 Context copied to clipboard!"));
        if (states.length > 0) {
          console.log(chalk.gray(`  Branch: ${branch} | ${states.length} modules ranked | Paste into any AI tool`));
        } else {
          console.log(chalk.gray(`  Branch: ${branch} | ${entries.length} sessions | Paste into any AI tool`));
        }
      } else {
        // Fallback: print to stdout if clipboard failed
        console.log(prompt);
      }
    }
  } catch (err: any) {
    console.log(chalk.red(`✗ Error: ${err.message}`));
  }
}

function toRepoRelativePath(cwd: string, repoRoot: string): string {
  const rel = path.relative(repoRoot, cwd).replace(/\\/g, "/");
  return rel === "" ? "." : rel;
}
