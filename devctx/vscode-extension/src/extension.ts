import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel("DevContext");

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.command = "devctx.resume";
    statusBarItem.tooltip = "Click to resume DevContext";
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand("devctx.save", saveContext),
        vscode.commands.registerCommand("devctx.resume", resumeContext),
        vscode.commands.registerCommand("devctx.log", showLog),
        vscode.commands.registerCommand("devctx.diff", showDiff)
    );

    // Auto-resume on workspace open
    autoResume();

    // Update status bar
    updateStatusBar();
}

export function deactivate() {
    statusBarItem?.dispose();
    outputChannel?.dispose();
}

async function runDevCtx(
    args: string,
    cwd?: string
): Promise<{ stdout: string; stderr: string }> {
    const workspaceFolder = cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceFolder) {
        throw new Error("No workspace folder open");
    }

    return execAsync(`npx devctx ${args}`, { cwd: workspaceFolder });
}

async function autoResume() {
    try {
        const { stdout } = await runDevCtx("resume --stdout");
        if (stdout.trim() && !stdout.includes("not initialized") && !stdout.includes("No context")) {
            outputChannel.clear();
            outputChannel.appendLine("═══ DevContext Auto-Resume ═══\n");
            outputChannel.appendLine(stdout);
            outputChannel.show(true); // true = preserve focus
        }
    } catch {
        // Silently fail — devctx may not be initialized
    }
}

async function saveContext() {
    const message = await vscode.window.showInputBox({
        prompt: "What were you working on?",
        placeHolder: "e.g., Refactoring payment service to use event sourcing",
    });

    if (!message) return;

    try {
        await runDevCtx(`save "${message.replace(/"/g, '\\"')}"`);
        vscode.window.showInformationMessage(`DevContext: Context saved ✓`);
        updateStatusBar();
    } catch (err: any) {
        vscode.window.showErrorMessage(`DevContext: ${err.message}`);
    }
}

async function resumeContext() {
    try {
        const { stdout } = await runDevCtx("resume --stdout");
        outputChannel.clear();
        outputChannel.appendLine("═══ DevContext Resume ═══\n");
        outputChannel.appendLine(stdout);
        outputChannel.show();
    } catch (err: any) {
        vscode.window.showErrorMessage(`DevContext: ${err.message}`);
    }
}

async function showLog() {
    try {
        const { stdout } = await runDevCtx("log");
        outputChannel.clear();
        outputChannel.appendLine("═══ DevContext Log ═══\n");
        outputChannel.appendLine(stdout);
        outputChannel.show();
    } catch (err: any) {
        vscode.window.showErrorMessage(`DevContext: ${err.message}`);
    }
}

async function showDiff() {
    try {
        const { stdout } = await runDevCtx("diff");
        outputChannel.clear();
        outputChannel.appendLine("═══ DevContext Diff ═══\n");
        outputChannel.appendLine(stdout);
        outputChannel.show();
    } catch (err: any) {
        vscode.window.showErrorMessage(`DevContext: ${err.message}`);
    }
}

async function updateStatusBar() {
    try {
        const { stdout } = await runDevCtx("log -n 1");
        if (stdout.includes("[")) {
            // Extract timestamp from log output
            const match = stdout.match(/\[([^\]]+)\]/);
            if (match) {
                statusBarItem.text = `$(history) DevCtx: ${match[1]}`;
                statusBarItem.show();
                return;
            }
        }
        statusBarItem.text = "$(history) DevCtx";
        statusBarItem.show();
    } catch {
        statusBarItem.text = "$(history) DevCtx: No context";
        statusBarItem.show();
    }
}
