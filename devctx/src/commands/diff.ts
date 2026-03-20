import chalk from "chalk";
import { isInitialized, loadBranchContext } from "../core/context";
import { getCurrentBranch, getChangedFiles, getStagedFiles } from "../core/git";

function getTimeAgo(timestamp: string): string {
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hours ago`;
    const days = Math.floor(hours / 24);
    return `${days} days ago`;
}

export async function diffCommand() {
    if (!(await isInitialized())) {
        console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
        return;
    }

    try {
        const branch = await getCurrentBranch();
        const entries = await loadBranchContext(branch);

        if (entries.length === 0) {
            console.log(chalk.yellow(`⚠ No context found for branch: ${branch}`));
            console.log(chalk.gray("  Run `devctx save` to capture context first."));
            return;
        }

        const latest = entries[entries.length - 1];
        const [currentChanged, currentStaged] = await Promise.all([
            getChangedFiles(),
            getStagedFiles(),
        ]);

        const lastSaveTime = getTimeAgo(latest.timestamp);

        console.log(chalk.bold(`\nSince last save (${lastSaveTime}):\n`));

        // --- Files ---
        const previousFiles = new Set(latest.filesChanged);
        const currentFiles = new Set([...currentChanged, ...currentStaged]);

        const newFiles = [...currentFiles].filter((f) => !previousFiles.has(f));
        const removedFiles = [...previousFiles].filter((f) => !currentFiles.has(f));
        const stillChanged = [...currentFiles].filter((f) => previousFiles.has(f));

        if (newFiles.length > 0) {
            newFiles.forEach((f) => console.log(`  ${chalk.green("+")} ${f} ${chalk.green("(new)")}`));
        }
        if (stillChanged.length > 0) {
            stillChanged.forEach((f) => console.log(`  ${chalk.yellow("~")} ${f} ${chalk.gray("(still modified)")}`));
        }
        if (removedFiles.length > 0) {
            removedFiles.forEach((f) => console.log(`  ${chalk.red("-")} ${f} ${chalk.gray("(resolved)")}`));
        }
        if (newFiles.length === 0 && removedFiles.length === 0 && stillChanged.length === 0) {
            console.log(chalk.gray("  No file changes since last save."));
        }

        // --- Decisions ---
        if (entries.length >= 2) {
            const previous = entries[entries.length - 2];
            const prevDecisions = new Set(previous.decisions);
            const newDecisions = latest.decisions.filter((d) => !prevDecisions.has(d));
            if (newDecisions.length > 0) {
                console.log();
                newDecisions.forEach((d) =>
                    console.log(`  ${chalk.cyan("Decision added:")} "${d}"`)
                );
            }
        } else if (latest.decisions.length > 0) {
            console.log();
            latest.decisions.forEach((d) =>
                console.log(`  ${chalk.cyan("Decision:")} "${d}"`)
            );
        }

        // --- Next Steps Progress ---
        if (entries.length >= 2) {
            const previous = entries[entries.length - 2];
            const completedSteps = previous.nextSteps.filter(
                (step) => !latest.nextSteps.includes(step)
            );
            if (completedSteps.length > 0) {
                console.log();
                completedSteps.forEach((s) =>
                    console.log(`  ${chalk.green("✓")} Next step completed: "${s}"`)
                );
            }

            const newSteps = latest.nextSteps.filter(
                (step) => !previous.nextSteps.includes(step)
            );
            if (newSteps.length > 0) {
                newSteps.forEach((s) =>
                    console.log(`  ${chalk.blue("→")} New next step: "${s}"`)
                );
            }
        }

        // --- Summary line ---
        const totalNew = newFiles.length;
        const totalModified = stillChanged.length;
        const totalResolved = removedFiles.length;

        console.log();
        console.log(
            chalk.gray(
                `  Summary: +${totalNew} new, ~${totalModified} modified, -${totalResolved} resolved`
            )
        );
        console.log();
    } catch (err: any) {
        console.log(chalk.red(`✗ Error: ${err.message}`));
    }
}
