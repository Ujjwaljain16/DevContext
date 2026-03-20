import chalk from "chalk";
import fs from "fs";
import path from "path";
import {
    isInitialized,
    loadBranchContext,
    getDevCtxDir,
} from "../core/context";
import { getCurrentBranch } from "../core/git";
import { callAI } from "../core/ai";
import { ContextEntry } from "../core/types";

export async function compressCommand(options?: { force?: boolean }) {
    if (!(await isInitialized())) {
        console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
        return;
    }

    try {
        const branch = await getCurrentBranch();
        const entries = await loadBranchContext(branch);

        if (entries.length <= 2) {
            console.log(chalk.yellow("⚠ Not enough context to compress (need at least 3 entries)."));
            return;
        }

        console.log(
            chalk.gray(`  Compressing ${entries.length} entries for branch: ${branch}...`)
        );

        // Keep the most recent entry intact, compress older ones
        const toCompress = entries.slice(0, -1);
        const latest = entries[entries.length - 1];

        const prompt = `You are a developer assistant. Compress the following ${toCompress.length} coding session entries into a single summary entry. Keep only the most important information: key decisions, approaches that worked or failed, and overall progress.

Sessions to compress:
${toCompress
                .map(
                    (e, i) => `
Session ${i + 1} (${e.timestamp}):
- Task: ${e.task}
- Approaches: ${e.approaches.join(", ") || "none"}
- Decisions: ${e.decisions.join(", ") || "none"}
- State: ${e.currentState}
- Next steps: ${e.nextSteps.join(", ") || "none"}
`
                )
                .join("\n")}

Generate a JSON response:
{
  "task": "overall task description covering all sessions",
  "approaches": ["significant approaches tried"],
  "decisions": ["key decisions made across all sessions"],
  "currentState": "where things stood after these sessions",
  "nextSteps": ["remaining next steps"]
}

Be concise but preserve important decisions and learnings.`;

        const result = await callAI([
            {
                role: "system",
                content: "You are a helpful assistant. Always respond with valid JSON.",
            },
            { role: "user", content: prompt },
        ]);

        if (result.error) {
            console.log(chalk.red(`✗ ${result.error}`));
            return;
        }

        let parsed: any;
        try {
            const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                [null, result.content];
            parsed = JSON.parse(jsonMatch[1]!.trim());
        } catch {
            console.log(chalk.red("✗ Could not parse AI compression result."));
            return;
        }

        // Create compressed entry from the oldest entry's metadata
        const compressed: ContextEntry = {
            ...toCompress[0],
            task: parsed.task || toCompress[0].task,
            approaches: parsed.approaches || [],
            decisions: parsed.decisions || [],
            currentState: parsed.currentState || "",
            nextSteps: parsed.nextSteps || [],
            timestamp: toCompress[0].timestamp, // keep oldest timestamp
        };

        // Replace branch file with compressed + latest
        const dir = await getDevCtxDir();
        const branchFile = path.join(
            dir,
            "branches",
            `${branch.replace(/\//g, "__")}.json`
        );

        const newEntries = [compressed, latest];
        fs.writeFileSync(branchFile, JSON.stringify(newEntries, null, 2));

        console.log(
            chalk.green(
                `✓ Compressed ${entries.length} entries → 2 entries for branch: ${chalk.bold(branch)}`
            )
        );
        console.log(chalk.gray(`  Kept: 1 compressed summary + latest entry`));
        console.log(chalk.cyan(`  Summary: ${parsed.task}`));
        console.log();
    } catch (err: any) {
        console.log(chalk.red(`✗ Error: ${err.message}`));
    }
}
