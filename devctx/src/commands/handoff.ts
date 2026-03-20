import chalk from "chalk";
import inquirer from "inquirer";
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
import { ContextEntry } from "../core/types";

export async function handoffCommand(
    assignee?: string,
    message?: string
) {
    if (!(await isInitialized())) {
        console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
        return;
    }

    try {
        // Clean up @ prefix if present
        let targetAssignee = assignee?.replace(/^@/, "") || "";
        let handoffNote = message || "";

        if (!targetAssignee || !handoffNote) {
            const answers = await inquirer.prompt([
                ...(!targetAssignee
                    ? [
                        {
                            type: "input" as const,
                            name: "assignee",
                            message: "Who are you handing off to?",
                            validate: (input: string) =>
                                input.length > 0 || "Assignee is required",
                        },
                    ]
                    : []),
                ...(!handoffNote
                    ? [
                        {
                            type: "input" as const,
                            name: "handoffNote",
                            message: "Handoff note (what they need to know):",
                            validate: (input: string) =>
                                input.length > 0 || "Handoff note is required",
                        },
                    ]
                    : []),
                {
                    type: "input",
                    name: "task",
                    message: "What were you working on?",
                    validate: (input: string) =>
                        input.length > 0 || "Task description is required",
                },
                {
                    type: "input",
                    name: "currentState",
                    message: "Where did you leave off?",
                    validate: (input: string) =>
                        input.length > 0 || "Current state is required",
                },
                {
                    type: "input",
                    name: "nextSteps",
                    message: "What comes next? (comma-separated)",
                    default: "",
                },
                {
                    type: "input",
                    name: "blockers",
                    message: "Any blockers? (comma-separated)",
                    default: "",
                },
            ]);

            targetAssignee = targetAssignee || answers.assignee;
            handoffNote = handoffNote || answers.handoffNote;

            const [branch, repo, filesChanged, filesStaged, recentCommits, author] =
                await Promise.all([
                    getCurrentBranch(),
                    getRepoName(),
                    getChangedFiles(),
                    getStagedFiles(),
                    getRecentCommits(),
                    getAuthor(),
                ]);

            const entry: ContextEntry = {
                id: uuid(),
                timestamp: new Date().toISOString(),
                branch,
                repo,
                author,
                task: answers.task,
                approaches: [],
                decisions: [],
                currentState: answers.currentState,
                nextSteps: answers.nextSteps
                    ? answers.nextSteps
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean)
                    : [],
                blockers: answers.blockers
                    ? answers.blockers
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean)
                    : undefined,
                filesChanged,
                filesStaged,
                recentCommits,
                assignee: targetAssignee,
                handoffNote,
            };

            await saveContext(entry);

            console.log(chalk.green(`\n✓ Handoff created for ${chalk.bold("@" + targetAssignee)}`));
            console.log(chalk.gray(`  Branch: ${branch}`));
            console.log(chalk.cyan(`\n  📝 Handoff Note:`));
            console.log(chalk.white(`  ${handoffNote}\n`));
            console.log(
                chalk.gray(
                    `  They can resume with: ${chalk.white("devctx resume --branch " + branch)}`
                )
            );
        } else {
            // Quick mode — minimal context with handoff
            const [branch, repo, filesChanged, filesStaged, recentCommits, author] =
                await Promise.all([
                    getCurrentBranch(),
                    getRepoName(),
                    getChangedFiles(),
                    getStagedFiles(),
                    getRecentCommits(),
                    getAuthor(),
                ]);

            const entry: ContextEntry = {
                id: uuid(),
                timestamp: new Date().toISOString(),
                branch,
                repo,
                author,
                task: `Handoff to @${targetAssignee}`,
                approaches: [],
                decisions: [],
                currentState: handoffNote,
                nextSteps: [],
                filesChanged,
                filesStaged,
                recentCommits,
                assignee: targetAssignee,
                handoffNote,
            };

            await saveContext(entry);

            console.log(chalk.green(`\n✓ Handoff created for ${chalk.bold("@" + targetAssignee)}`));
            console.log(chalk.gray(`  Branch: ${branch}`));
            console.log(chalk.cyan(`\n  📝 Handoff Note:`));
            console.log(chalk.white(`  ${handoffNote}\n`));
            console.log(
                chalk.gray(
                    `  They can resume with: ${chalk.white("devctx resume --branch " + branch)}`
                )
            );
        }
    } catch (err: any) {
        console.log(chalk.red(`✗ Error: ${err.message}`));
    }
}
