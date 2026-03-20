# FlowState

✨ Keep your coding context in flow.

FlowState is the product brand. The current CLI command remains `devctx` for backward compatibility.

FlowState captures what you were doing, why you made decisions, and what to do next, then restores it instantly from CLI or MCP.

## Why FlowState

- 🧠 Resume work without re-reading everything.
- 🔄 Keep context per branch and per user.
- 🤝 Make handoff and ownership visible for teams.
- 🔌 Connect directly to AI tools through MCP.

## Install

Requirements:

- Node.js 18+
- npm

Install globally:

```bash
npm install -g devctx
devctx --version
```

Run from source:

```bash
npm install
npm run build
npm run dev -- --help
```

## Windows Setup (PowerShell)

Use PowerShell 7+:

```powershell
$PSVersionTable.PSVersion
```

If needed:

```powershell
winget install Microsoft.PowerShell
```

Validate Node path:

```powershell
node --version
npm --version
where.exe node
Get-Command node | Select-Object -ExpandProperty Source
```

Note: `where` in PowerShell is not the same as `where.exe`.

## Quick Start

```bash
# In your repository root
cd your-project
devctx init

# Capture context
devctx save --smart "switched payment service to TypeORM"

# Resume context
devctx resume --stdout
```

## Commands

Core:

- `devctx init`
- `devctx save [message]`
- `devctx resume`
- `devctx log`
- `devctx diff`

Team/workflow:

- `devctx handoff [assignee] [message]`
- `devctx share`
- `devctx watch`
- `devctx hook <action>`
- `devctx timeline`
- `devctx ownership`
- `devctx recap`
- `devctx diff-thinking`

AI-assisted:

- `devctx summarize`
- `devctx suggest`
- `devctx compress`

Config/integration:

- `devctx config [action] [key] [value]`
- `devctx mcp`

Common examples:

```bash
devctx save "fixed schema mismatch"
devctx save --smart "payment module work"
devctx resume --stdout
devctx timeline --count 5
devctx ownership --top 3
devctx recap --hours 24
devctx diff-thinking --count 10
```

## MCP Integration

Start MCP server:

```bash
devctx mcp --root /absolute/path/to/project
# or
node dist/mcp.js --root /absolute/path/to/project
```

MCP tools (stable names):

- `devctx_save`
- `devctx_resume`
- `devctx_log`
- `devctx_timeline`
- `devctx_ownership`
- `devctx_recap`
- `devctx_diff_thinking`

MCP resource:

- `devctx://context`

All branch-scoped MCP tools accept `root` and derive branch from that root repository context.

## VS Code MCP Config (Windows)

File:

- `%APPDATA%\\Code\\User\\settings.json`

Add:

```json
{
  "mcp.servers": {
    "devctx": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\ujjwa\\OneDrive\\Desktop\\Hack\\devctx\\devctx\\dist\\mcp.js"
      ],
      "env": {
        "DEVCTX_ROOT": "C:\\Users\\ujjwa\\OneDrive\\Desktop\\Hack\\devctx"
      }
    }
  }
}
```

Then restart VS Code and run a tool call such as `devctx_resume` from your AI client.

## Storage

FlowState stores context under `.devctx/` in your repository.

Key paths:

- `.devctx/index.json`
- `.devctx/sessions/`
- `.devctx/branches/{branch}/{user}/context.json`
- `.devctx/modules/{branch}/{user}.json`

Branch names with `/` are path-safe in storage (for example, `feature/payments` becomes `feature__payments`).

## Security

- 🔒 Sensitive-looking tokens are redacted before persistence.
- `DEVCTX_ENCRYPTION_KEY` enables optional encryption flow for module state snapshots.
- Keep `.devctx/branches/`, `.devctx/modules/`, `.devctx/snapshots/` in `.gitignore` for private memory.

## Troubleshooting

Command not found:

```bash
npm link
```

Build MCP entrypoint:

```bash
npm run build
node dist/mcp.js --help
```

MCP tools not appearing:

1. Use absolute `node.exe` path.
2. Use absolute `dist/mcp.js` path.
3. Set `DEVCTX_ROOT` in MCP `env`.
4. Restart the client.

Wrong context via MCP:

- Pass `root` explicitly in tool-call arguments or set `DEVCTX_ROOT` in MCP config.

No context found:

1. Run `devctx init` in target repo.
2. Run at least one `devctx save`.
3. Run `devctx resume --stdout`.