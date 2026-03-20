import chalk from "chalk";
import { isInitialized, loadBranchContext } from "../core/context";
import {
    getCurrentBranch,
    getChangedFiles,
    getRecentCommits,
} from "../core/git";
import { callAI } from "../core/ai";

export async function suggestCommand() {
    if (!(await isInitialized())) {
        console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
        return;
    }

    try {
        const branch = await getCurrentBranch();
        const entries = await loadBranchContext(branch);
        const [filesChanged, recentCommits] = await Promise.all([
            getChangedFiles(),
            getRecentCommits(10),
        ]);

        if (entries.length === 0 && filesChanged.length === 0) {
            console.log(chalk.yellow("⚠ No context or changes found. Nothing to analyze."));
            return;
        }

        console.log(chalk.gray("  Analyzing codebase and context..."));

        const latest = entries[entries.length - 1];
        const contextSummary = latest
            ? `Current task: ${latest.task}
Current state: ${latest.currentState}
Previous approaches: ${latest.approaches.join(", ") || "none"}
Previous decisions: ${latest.decisions.join(", ") || "none"}
Known blockers: ${latest.blockers?.join(", ") || "none"}
Previous next steps: ${latest.nextSteps.join(", ") || "none"}`
            : "No previous context available.";

        const prompt = `You are a senior developer mentor. Based on the following project context, suggest concrete next steps.

Branch: ${branch}

${contextSummary}

Recent commits:
${recentCommits.map((c) => `- ${c}`).join("\n")}

Currently changed files: ${filesChanged.join(", ") || "none"}

Provide 3-5 specific, actionable next steps. For each step, briefly explain WHY it's important. Format as a numbered list.`;

        const result = await callAI([
            {
                role: "system",
                content: "You are a helpful senior developer. Be concise and actionable.",
            },
            { role: "user", content: prompt },
        ]);

        if (result.error) {
            console.log(chalk.red(`✗ ${result.error}`));
            return;
        }

        console.log(chalk.bold.cyan("\n💡 Suggested Next Steps\n"));
        console.log(result.content);
        console.log();
    } catch (err: any) {
        console.log(chalk.red(`✗ Error: ${err.message}`));
    }
}
