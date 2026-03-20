import fs from "fs";
import path from "path";
import chalk from "chalk";
import { getRepoRoot } from "../core/git";

export async function hookCommand(action?: string) {
    try {
        const root = await getRepoRoot();
        const hooksDir = path.join(root, ".git", "hooks");
        const hookPath = path.join(hooksDir, "post-commit");

        if (action === "remove") {
            if (!fs.existsSync(hookPath)) {
                console.log(chalk.yellow("⚠ No DevContext git hook found."));
                return;
            }

            const content = fs.readFileSync(hookPath, "utf-8");
            if (!content.includes("devctx")) {
                console.log(chalk.yellow("⚠ post-commit hook exists but was not created by DevContext."));
                return;
            }

            // Remove only the devctx line, preserve other hooks
            const lines = content.split("\n").filter((l) => !l.includes("devctx"));
            if (lines.filter((l) => l.trim() && !l.startsWith("#!")).length === 0) {
                fs.unlinkSync(hookPath);
            } else {
                fs.writeFileSync(hookPath, lines.join("\n"));
                fs.chmodSync(hookPath, "755");
            }

            console.log(chalk.green("✓ Removed DevContext post-commit hook"));
            return;
        }

        // Default: install
        fs.mkdirSync(hooksDir, { recursive: true });

        let hookContent = "#!/bin/sh\n";

        if (fs.existsSync(hookPath)) {
            const existing = fs.readFileSync(hookPath, "utf-8");
            if (existing.includes("devctx")) {
                console.log(chalk.yellow("⚠ DevContext post-commit hook already installed."));
                return;
            }
            // Append to existing hook
            hookContent = existing.trimEnd() + "\n";
        }

        hookContent += `\n# DevContext auto-snapshot on commit\ndevctx save "Auto-saved on commit: $(git log -1 --pretty=%B | head -1)" 2>/dev/null || true\n`;

        fs.writeFileSync(hookPath, hookContent);
        fs.chmodSync(hookPath, "755");

        console.log(chalk.green("✓ Installed DevContext post-commit hook"));
        console.log(chalk.gray("  Context will be auto-saved on every commit."));
        console.log(chalk.gray("  Remove with: devctx hook remove"));
    } catch (err: any) {
        console.log(chalk.red(`✗ Error: ${err.message}`));
    }
}
