import fs from "fs";
import path from "path";
import { getDevCtxDir } from "../core/context";

export interface UserConfig {
    /** Default output mode for resume: "clipboard" | "stdout" */
    defaultOutput: "clipboard" | "stdout";
    /** Whether to auto-detect and include git info */
    autoGitCapture: boolean;
    /** Number of recent commits to capture */
    recentCommitCount: number;
    /** Default number of log entries to show */
    defaultLogCount: number;
    /** Watch mode auto-save interval in minutes */
    watchInterval: number;
    /** Whether git hook is auto-installed on init */
    autoHook: boolean;
    /** AI provider base URL (OpenAI-compatible) */
    aiProvider: string;
    /** AI model name */
    aiModel: string;
    /** AI API key (prefer DEVCTX_AI_KEY env var) */
    aiApiKey?: string;
}

const DEFAULT_CONFIG: UserConfig = {
    defaultOutput: "clipboard",
    autoGitCapture: true,
    recentCommitCount: 5,
    defaultLogCount: 10,
    watchInterval: 5,
    autoHook: false,
    aiProvider: "https://api.openai.com/v1",
    aiModel: "gpt-4o-mini",
};

/**
 * Load user preferences from `.devctx/config.json`.
 * Returns defaults if the file doesn't exist or is malformed.
 */
export async function loadConfig(): Promise<UserConfig> {
    try {
        const dir = await getDevCtxDir();
        const configPath = path.join(dir, "config.json");

        if (!fs.existsSync(configPath)) return { ...DEFAULT_CONFIG };

        const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return { ...DEFAULT_CONFIG, ...raw };
    } catch {
        return { ...DEFAULT_CONFIG };
    }
}

/**
 * Save user preferences to `.devctx/config.json`.
 * Merges with existing config so partial updates work.
 */
export async function saveConfig(partial: Partial<UserConfig>): Promise<void> {
    const dir = await getDevCtxDir();
    const configPath = path.join(dir, "config.json");

    const existing = await loadConfig();
    const merged = { ...existing, ...partial };
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2));
}
