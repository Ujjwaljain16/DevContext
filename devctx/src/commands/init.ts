import fs from "fs";
import path from "path";
import chalk from "chalk";
import { getRepoRoot, getRepoName } from "../core/git";
import { DevCtxConfig } from "../core/types";

export async function initCommand() {
  try {
    const root = await getRepoRoot();
    const devctxDir = path.join(root, ".devctx");

    if (fs.existsSync(devctxDir)) {
      console.log(chalk.yellow("⚠ DevContext already initialized in this repo."));
      return;
    }

    // Create directory structure
    fs.mkdirSync(path.join(devctxDir, "sessions"), { recursive: true });
    fs.mkdirSync(path.join(devctxDir, "branches"), { recursive: true });

    // Write config
    const config: DevCtxConfig = {
      version: "0.1.0",
      createdAt: new Date().toISOString(),
      repo: await getRepoName(),
    };
    fs.writeFileSync(path.join(devctxDir, "config.json"), JSON.stringify(config, null, 2));

    // Add to .gitignore
    const gitignorePath = path.join(root, ".gitignore");
    const gitignoreContent = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, "utf-8")
      : "";

    if (!gitignoreContent.includes(".devctx/")) {
      fs.appendFileSync(gitignorePath, "\n# DevContext - AI coding context\n.devctx/\n");
      console.log(chalk.gray("  Added .devctx/ to .gitignore"));
    }

    console.log(chalk.green(`✓ Initialized DevContext in ${root}`));
    console.log(chalk.gray("  Run `devctx save` to capture your first context."));
  } catch (err: any) {
    if (err.message?.includes("not a git repository")) {
      console.log(chalk.red("✗ Not a git repository. Run `git init` first."));
    } else {
      console.log(chalk.red(`✗ Error: ${err.message}`));
    }
  }
}
