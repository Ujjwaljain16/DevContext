import chalk from "chalk";
import { v4 as uuid } from "uuid";
import { isInitialized, saveContext } from "../core/context";
import {
    getCurrentBranch,
    getRepoName,
    getChangedFiles,
    getStagedFiles,
    getRecentCommits,
    getAuthor,
} from "../core/git";
import { callAI } from "../core/ai";
import { ContextEntry } from "../core/types";
import simpleGit from "simple-git";

const git = simpleGit();

export async function summarizeCommand() {
    if (!(await isInitialized())) {
        console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
        return;
    }

    try {
        console.log(chalk.gray("  Analyzing git changes..."));

        const [branch, repo, filesChanged, filesStaged, recentCommits, author] =
            await Promise.all([
                getCurrentBranch(),
                getRepoName(),
                getChangedFiles(),
                getStagedFiles(),
                getRecentCommits(10),
                getAuthor(),
            ]);

        // Get git diff for context
        let diffSummary = "";
        try {
            const diff = await git.diff(["--stat"]);
            diffSummary = diff.slice(0, 2000); // cap at 2k chars
        } catch {
            diffSummary = "No diff available";
        }

        const prompt = `You are a developer assistant. Based on the following git activity, generate a concise coding context summary.

Repository: ${repo}
Branch: ${branch}
Author: ${author}

Recent commits:
${recentCommits.map((c) => `- ${c}`).join("\n")}

Files changed: ${filesChanged.join(", ") || "none"}
Files staged: ${filesStaged.join(", ") || "none"}

Diff summary:
${diffSummary}

Generate a JSON response with:
{
  "task": "one-line description of what's being worked on",
  "approaches": ["approach 1", "approach 2"],
  "decisions": ["decision 1"],
  "currentState": "where things currently stand",
  "nextSteps": ["step 1", "step 2"]
}

Be concise. Only include approaches/decisions if they're clearly evident from the commits and changes.`;

        console.log(chalk.gray("  Generating AI summary..."));

        const result = await callAI([
            { role: "system", content: "You are a helpful developer assistant. Always respond with valid JSON." },
            { role: "user", content: prompt },
        ]);

        if (result.error) {
            console.log(chalk.red(`✗ ${result.error}`));
            return;
        }

        // Parse AI response
        let parsed: any;
        try {
            // Extract JSON from potential markdown code blocks
            const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                [null, result.content];
            parsed = JSON.parse(jsonMatch[1]!.trim());
        } catch {
            console.log(chalk.yellow("⚠ Could not parse AI response. Saving raw summary."));
            parsed = {
                task: result.content.slice(0, 200),
                approaches: [],
                decisions: [],
                currentState: result.content,
                nextSteps: [],
            };
        }

        const entry: ContextEntry = {
            id: uuid(),
            timestamp: new Date().toISOString(),
            branch,
            repo,
            author,
            task: parsed.task || "AI-generated summary",
            approaches: parsed.approaches || [],
            decisions: parsed.decisions || [],
            currentState: parsed.currentState || "",
            nextSteps: parsed.nextSteps || [],
            filesChanged,
            filesStaged,
            recentCommits,
        };

        await saveContext(entry);

        console.log(chalk.green(`\n✓ AI-generated context saved for branch: ${chalk.bold(branch)}`));
        console.log(chalk.cyan(`\n  Task: ${entry.task}`));
        if (entry.currentState) {
            console.log(chalk.gray(`  State: ${entry.currentState}`));
        }
        if (entry.decisions.length > 0) {
            entry.decisions.forEach((d) => console.log(chalk.gray(`  Decision: ${d}`)));
        }
        if (entry.nextSteps.length > 0) {
            console.log(chalk.gray(`  Next steps: ${entry.nextSteps.join(", ")}`));
        }
        console.log();
    } catch (err: any) {
        console.log(chalk.red(`✗ Error: ${err.message}`));
    }
}
