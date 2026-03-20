import clipboardy from "clipboardy";
import chalk from "chalk";

/**
 * Copy text to the system clipboard.
 * Falls back gracefully in headless / CI environments.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await clipboardy.write(text);
        return true;
    } catch {
        // Headless environment — clipboard not available
        console.log(chalk.yellow("⚠ Clipboard not available (headless environment?). Use --stdout instead."));
        return false;
    }
}
