import chalk from "chalk";
import { isInitialized, loadBranchContext } from "../core/context";
import { getCurrentBranch } from "../core/git";
import { generatePrompt } from "../core/prompt";
import { copyToClipboard } from "../utils/clipboard";

export async function resumeCommand(options?: { branch?: string; stdout?: boolean }) {
  if (!(await isInitialized())) {
    console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
    return;
  }

  try {
    const branch = options?.branch || (await getCurrentBranch());
    const entries = await loadBranchContext(branch);

    if (entries.length === 0) {
      console.log(chalk.yellow(`⚠ No context found for branch: ${branch}`));
      console.log(chalk.gray("  Run `devctx save` to capture context first."));
      return;
    }

    const prompt = generatePrompt(entries);

    if (options?.stdout) {
      console.log(prompt);
    } else {
      const copied = await copyToClipboard(prompt);
      if (copied) {
        console.log(chalk.green("📋 Context copied to clipboard!"));
        console.log(
          chalk.gray(`  Branch: ${branch} | ${entries.length} sessions | Paste into any AI tool`)
        );
      } else {
        // Fallback: print to stdout if clipboard failed
        console.log(prompt);
      }
    }
  } catch (err: any) {
    console.log(chalk.red(`✗ Error: ${err.message}`));
  }
}
