import chalk from "chalk";
import { isInitialized, loadBranchContext, loadAllSessions } from "../core/context";
import { getCurrentBranch } from "../core/git";

export async function logCommand(options?: { all?: boolean; count?: string }) {
  if (!(await isInitialized())) {
    console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
    return;
  }

  try {
    const count = parseInt(options?.count || "10", 10);

    if (options?.all) {
      const sessions = await loadAllSessions();
      if (sessions.length === 0) {
        console.log(chalk.yellow("No context entries found."));
        return;
      }

      console.log(chalk.bold("\nAll branches:\n"));
      sessions.slice(0, count).forEach((s) => {
        const date = new Date(s.timestamp).toLocaleString();
        console.log(`  ${chalk.gray(`[${date}]`)} ${chalk.cyan(s.branch)} ${s.task}`);
      });
    } else {
      const branch = await getCurrentBranch();
      const entries = await loadBranchContext(branch);

      if (entries.length === 0) {
        console.log(chalk.yellow(`No context for branch: ${branch}`));
        return;
      }

      console.log(chalk.bold(`\nBranch: ${branch}\n`));
      entries
        .slice(-count)
        .reverse()
        .forEach((e) => {
          const date = new Date(e.timestamp).toLocaleString();
          console.log(`  ${chalk.gray(`[${date}]`)} ${e.task}`);
          if (e.currentState) {
            console.log(`    ${chalk.gray("└─")} ${e.currentState}`);
          }
        });
    }
    console.log();
  } catch (err: any) {
    console.log(chalk.red(`✗ Error: ${err.message}`));
  }
}
