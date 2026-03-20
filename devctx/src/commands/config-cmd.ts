import chalk from "chalk";
import { isInitialized } from "../core/context";
import { loadConfig, saveConfig, UserConfig } from "../utils/config";

const VALID_KEYS: (keyof UserConfig)[] = [
    "defaultOutput",
    "autoGitCapture",
    "recentCommitCount",
    "defaultLogCount",
    "watchInterval",
    "autoHook",
    "aiProvider",
    "aiModel",
    "aiApiKey",
];

export async function configCommand(action?: string, key?: string, value?: string) {
    if (!(await isInitialized())) {
        console.log(chalk.red("✗ DevContext not initialized. Run `devctx init` first."));
        return;
    }

    try {
        const config = await loadConfig();

        if (!action || action === "list") {
            console.log(chalk.bold("\nDevContext Configuration:\n"));
            for (const [k, v] of Object.entries(config)) {
                if (k === "aiApiKey" && v) {
                    console.log(`  ${chalk.cyan(k)}: ${chalk.gray("****" + String(v).slice(-4))}`);
                } else {
                    console.log(`  ${chalk.cyan(k)}: ${chalk.white(String(v))}`);
                }
            }
            console.log();
            return;
        }

        if (action === "get") {
            if (!key) {
                console.log(chalk.red("✗ Usage: devctx config get <key>"));
                return;
            }
            if (!VALID_KEYS.includes(key as keyof UserConfig)) {
                console.log(chalk.red(`✗ Unknown config key: ${key}`));
                console.log(chalk.gray(`  Valid keys: ${VALID_KEYS.join(", ")}`));
                return;
            }
            const val = config[key as keyof UserConfig];
            console.log(`${chalk.cyan(key)}: ${chalk.white(String(val ?? "(not set)"))}`);
            return;
        }

        if (action === "set") {
            if (!key || value === undefined) {
                console.log(chalk.red("✗ Usage: devctx config set <key> <value>"));
                return;
            }
            if (!VALID_KEYS.includes(key as keyof UserConfig)) {
                console.log(chalk.red(`✗ Unknown config key: ${key}`));
                console.log(chalk.gray(`  Valid keys: ${VALID_KEYS.join(", ")}`));
                return;
            }

            // Type coercion
            let typedValue: any = value;
            if (value === "true") typedValue = true;
            else if (value === "false") typedValue = false;
            else if (!isNaN(Number(value)) && key !== "aiApiKey" && key !== "aiProvider" && key !== "aiModel") {
                typedValue = Number(value);
            }

            await saveConfig({ [key]: typedValue });
            console.log(chalk.green(`✓ Set ${chalk.bold(key)} = ${typedValue}`));
            return;
        }

        console.log(chalk.red(`✗ Unknown action: ${action}`));
        console.log(chalk.gray("  Usage: devctx config [list|get|set] [key] [value]"));
    } catch (err: any) {
        console.log(chalk.red(`✗ Error: ${err.message}`));
    }
}
