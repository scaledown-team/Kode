# DietCode

Optimize your coding-agent sessions with **DietCode** — automatic context compression, conversation summarization, intent-aware tool routing, and named entity extraction, powered by [Scaledown](https://scaledown.ai).

## What it does

Every time you submit a prompt, the plugin (via hooks in Claude Code and Codex CLI, or via rules guidance in Cursor):

1. **Classifies your intent** and prepends a one-line hint (e.g. `[DietCode intent: file_read (87%)]`) so the agent picks the right tool without guessing
2. **Compresses large contexts** automatically when you paste in a big codebase and ask a retrieval-style question — reducing token usage by 50–70% before the prompt reaches the model
3. **Compresses large tool outputs** (`PostToolUse`) — `ls`, `grep`, `git diff/log/status` are structurally compacted with zero latency, and anything still large is run through Scaledown before it enters context
4. **Summarizes on compaction** (`PreCompact`) — when the context window fills, the conversation is summarized by **Scaledown's summarize model** instead of Claude's default summarizer
5. **Tracks token savings** — every compression/summarization is counted, shown live in the Claude Code status line (`↓ 125.4K saved · 747 reqs`)

On top of that, your agent gains four tools it can call on demand in **all three clients**:

| Tool | What it does |
|---|---|
| `sd_compress` | Compress a large context block before a needle-in-a-haystack query |
| `sd_summarize` | Abstractively summarize text to compact long conversations |
| `sd_classify` | Classify text against custom labels (bug vs. feature vs. question) |
| `sd_extract` | Extract named entities or structured data from any text |

> **Status line / savings display is Claude Code only.** Cursor and Codex CLI have no status-line API, so token savings still happen there but aren't displayed. This is an npm CLI plugin — there is no VS Code/IDE extension; the "status line" refers to Claude Code's terminal status line.

---

## How it works (30 seconds)

```
your prompt ──▶ [intent classify] ──▶ [needle-in-haystack?] ──▶ compress ──▶ agent
                     │                        │
                 one-line hint          /compress/raw/  (50-70% smaller)
```

- **Intent hints** route the agent to the right tool, cheaply, on every prompt.
- **Auto-compression** only fires on prompts that are both *large* and
  *retrieval-intent*. Conversational prompts and code you're asking it to write
  are left untouched.
- **On-demand tools** give you manual control in any client.

---

## Get started (60 seconds)

> **Supported clients:** Claude Code · Cursor · OpenAI Codex CLI
>
> The MCP tools (`sd_compress`, `sd_summarize`, `sd_classify`, `sd_extract`) work in all three clients. Automatic hooks (`UserPromptSubmit`, `PostToolUse`, `PreCompact`) work in Claude Code and Codex CLI. Cursor has no hook system — use the [Cursor rules](#cursor) to drive proactive tool use instead.

- Node.js 18 or later
- A Scaledown API key, free at [scaledown.ai/dashboard](https://scaledown.ai/dashboard)
- One of: [Claude Code](https://claude.ai/code) · [Cursor](https://cursor.com) · [Codex CLI](https://github.com/openai/codex)

### Claude Code (recommended)

```bash
npm install -g dietcode
dietcode setup
```

The setup wizard will:
1. Open your browser to get an API key
2. Ask you to paste the key (validated against the API before continuing)
3. Save it to your shell config (`~/.zshrc`, `~/.bashrc`, etc.) and to `~/.scaledown/config.json`
4. Register the MCP server with Claude Code (`claude mcp add --scope user`)
5. Write the `UserPromptSubmit`, `PostToolUse`, and `PreCompact` hooks, the **status line**, and the auto-compact threshold to `~/.claude/settings.json`
6. Optionally configure Codex CLI and/or Cursor if you answer **y** when prompted

Restart Claude Code and you're done.

<details>
<summary>Manual setup</summary>

**1. Clone and build**
```bash
git clone https://github.com/scaledown-team/DietCode
cd DietCode
npm install && npm run build
```

**2. Set your API key**
```bash
export SCALEDOWN_API_KEY="your-key-here"   # add to ~/.zshrc or ~/.bashrc to persist
```

**3. Register the MCP server**

Personal use (`~/.claude.json`):
```bash
claude mcp add dietcode --transport stdio \
  -- node /path/to/DietCode/dist/src/index.js
```

Team use (`.mcp.json`, commit this file):
```bash
claude mcp add dietcode --transport stdio --scope project \
  -- npx -y dietcode
```

**4. Add the hook** to `.claude/settings.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "dietcode-hook"
          }
        ]
      }
    ]
  }
}
```
If you cloned instead of installing globally, use the full path:
```json
"command": "node /path/to/DietCode/dist/hooks/user-prompt-submit.js"
```
</details>

### Cursor

```bash
npm install -g dietcode
```

**2. Set your API key**
```bash
export SCALEDOWN_API_KEY="your-key-here"
```

Create `.cursor/mcp.json` (or `~/.cursor/mcp.json` for global use):
```json
{
  "mcpServers": {
    "dietcode": {
      "command": "npx",
      "args": ["-y", "dietcode"],
      "env": {
        "SCALEDOWN_API_KEY": "your-key-here"
      }
    }
  }
}
```
Restart Cursor. The four tools appear in Agent mode.

**4. Restart Cursor.** The four DietCode tools will be available in Agent mode.

**5. (Recommended) Add Cursor rules**

Cursor has no hooks system, but you can give the agent behavioral guidance via `.cursor/rules/`:

```bash
# Global (applies to all projects)
mkdir -p ~/.cursor/rules
cp node_modules/dietcode/cursor-rules/dietcode.mdc ~/.cursor/rules/

# Or project-level
mkdir -p .cursor/rules
cp node_modules/dietcode/cursor-rules/dietcode.mdc .cursor/rules/
```

Or run `dietcode setup` and answer **y** when asked about Cursor — it writes the file for you.

This instructs the agent to call `sd_compress` before large file reads, `sd_summarize` after web fetches, and `sd_classify` at the start of ambiguous tasks.

---

### OpenAI Codex CLI

```bash
npm install -g dietcode
```

**2. Add the MCP server**
```bash
codex mcp add dietcode --env SCALEDOWN_API_KEY=your-key-here -- npx -y dietcode
```
This writes to `~/.codex/config.toml`:
```toml
[mcp_servers.dietcode]
command = "npx"
args = ["-y", "dietcode"]

[mcp_servers.dietcode.env]
SCALEDOWN_API_KEY = "your-key-here"
```

**3. Register automatic hooks**

Codex CLI supports the same hook events as Claude Code. Run the setup wizard and answer **y** when asked about Codex CLI — it appends the following to `~/.codex/config.toml` automatically:

```toml
# DietCode hooks — added by dietcode setup
[[hooks.UserPromptSubmit]]
[[hooks.UserPromptSubmit.hooks]]
type = "command"
command = "node \"/path/to/hooks/user-prompt-submit.js\""
timeout = 30
statusMessage = "DietCode: classifying intent..."

[[hooks.PostToolUse]]
[[hooks.PostToolUse.hooks]]
type = "command"
command = "node \"/path/to/hooks/post-tool-use.js\""
timeout = 30

[[hooks.PreCompact]]
[[hooks.PreCompact.hooks]]
type = "command"
command = "node \"/path/to/hooks/pre-compact.js\""
timeout = 60
```

> Note: Codex CLI's `PostToolUse` fires only for Bash tool events. File read and MCP tool outputs are not intercepted — those use the on-demand MCP tools instead.

**4. (Optional) Add AGENTS.md**

Copy the provided template to your project root so Codex knows to use DietCode tools proactively:

```bash
cp node_modules/dietcode/agents-md/AGENTS.md ./AGENTS.md
```

---

## Feature comparison

| Feature | Claude Code | Cursor | Codex CLI |
|---|---|---|---|
| `sd_compress` tool | ✅ | ✅ | ✅ |
| `sd_summarize` tool | ✅ | ✅ | ✅ |
| `sd_classify` tool | ✅ | ✅ | ✅ |
| `sd_extract` tool | ✅ | ✅ | ✅ |
| Auto intent hints on every prompt | ✅ hook | ✅ via rules¹ | ✅ hook |
| Auto compression (large prompts) | ✅ hook | ✅ via rules¹ | ✅ hook |
| Auto tool output compression | ✅ hook | ✅ via rules¹ | ✅ hook (Bash only)² |
| Auto summarization on compaction (Scaledown summarize model) | ✅ hook | ❌ | ✅ hook |
| Token-savings status line | ✅ | ❌³ | ❌³ |
| Context progress bar | ✅ | ❌³ | ❌³ |
| Auto config re-sync on update | ✅ | ✅ | ✅ |

¹ Cursor rules instruct the agent to call DietCode tools proactively — not a true hook, but effective in Agent mode.
² Codex CLI's `PostToolUse` fires only for Bash tool events, not file reads or MCP calls.
³ Cursor and Codex CLI expose no status-line API. Savings still accrue (tracked in `~/.scaledown/stats.json`) but there is no place to display them.

---

## Usage

**Automatic (Claude Code hook):** nothing to do; the hook fires on every prompt:
```
[DietCode intent: search (82%)]
Find all places where we call the payments API
```

**On-demand tools:** ask the agent directly:
```
Use sd_compress to compress this before searching through it: [paste large codebase]
Use sd_summarize to condense this thread so we can keep working
Use sd_classify to categorize these GitHub issues as bug, feature, or question
Use sd_extract to pull function names, file paths, and error codes from this stack trace
```

---

## Configuration

### Changing your API key

Re-run setup to replace the key automatically:
```bash
dietcode setup
```

Or edit your shell config directly:
```bash
# Open ~/.zshrc (or ~/.bashrc)
# Find and update:
export SCALEDOWN_API_KEY="sk-your-new-key"

# Reload
source ~/.zshrc
```

### Environment variables

Set these environment variables to tune behavior:

| Variable | Default | Description |
|---|---|---|
| `SCALEDOWN_API_KEY` | — | **Required.** Your Scaledown API key |
| `SCALEDOWN_COMPRESS_THRESHOLD` | `10000` | Token estimate above which prompt auto-compression fires |
| `SCALEDOWN_COMPRESS_RATE` | `0.3` | How aggressively to compress (`0.3` = keep ~30% of tokens; `auto` lets the API decide) |
| `SCALEDOWN_NIAH_DISABLE` | `false` | Set to `true` to compress all large prompts, not just retrieval-style ones |
| `SCALEDOWN_POST_TOOL_DISABLE` | `false` | Set to `true` to disable `PostToolUse` tool-output compression |
| `SCALEDOWN_POST_TOOL_THRESHOLD` | `4000` | Token threshold above which tool output is sent to the API (after structural filtering) |
| `SCALEDOWN_COMPACT_THRESHOLD` | `50` | Context-usage % that triggers compaction (also sets `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) |
| `SCALEDOWN_SHOW_PROGRESS` | `true` | Set to `false` to hide the per-prompt context progress bar |
| `SCALEDOWN_MAX_CONTEXT_TOKENS` | `200000` | Context-window size used for the progress bar / compaction math |

```bash
export SCALEDOWN_COMPRESS_THRESHOLD=5000
export SCALEDOWN_COMPRESS_RATE=0.2
```

---

## Updating

```bash
npm update -g dietcode
# or
npm install -g dietcode@latest
```

Your harness config (hooks, status line, Cursor/Codex blocks) is **automatically re-synced on update** for every harness you've already set up — you do not need to re-run setup. This happens two ways:

- A **postinstall** step runs right after `npm install`.
- A **once-a-day self-heal** runs from the Claude Code status line as a safety net (e.g. if `npm install --ignore-scripts` skipped postinstall, or your Node version changed and moved the global install path).

Reconcile only touches harnesses you've already configured — it never adds a harness you didn't opt into, and it preserves your own keys/sections. To force a re-sync immediately:

```bash
dietcode-reconcile
```

> The status line also shows when a new version is available and auto-updates minor versions in the background; major versions print the upgrade command.

---

## Uninstalling

Remove all DietCode integration from every configured harness with one command:

```bash
dietcode uninstall
```

This strips the hooks, status line, and auto-compact env var from `~/.claude/settings.json`, removes the managed block from `~/.codex/config.toml`, deletes `~/.cursor/rules/dietcode.mdc`, and unregisters the MCP server from Claude Code — all while preserving any of your own config in those files.

Then remove the package and (optionally) your data:

```bash
npm uninstall -g dietcode
rm -rf ~/.scaledown          # API key + saved-token stats (optional)
```

Finally, delete the two lines the installer added to your shell config (`~/.zshrc` / `~/.bashrc`):

```bash
export SCALEDOWN_API_KEY="..."
export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=50
```

**Per-harness manual removal** (if you prefer to do it by hand, or set up MCP manually):

| Harness | What to remove |
|---|---|
| Claude Code | `hooks` (UserPromptSubmit/PostToolUse/PreCompact) + `statusLine` + `env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` from `~/.claude/settings.json`; `claude mcp remove --scope user dietcode` |
| Cursor | Delete `~/.cursor/rules/dietcode.mdc` (or `.cursor/rules/dietcode.mdc`); remove the `dietcode` entry from `.cursor/mcp.json` |
| Codex CLI | Remove the `# DietCode hooks` block and `[mcp_servers.dietcode]` from `~/.codex/config.toml` |

---

## How compression works

Kode uses a local heuristic to detect "needle-in-a-haystack" queries: prompts
that are both large *and* retrieval-intent (`find`, `search`, `where`,
`what does ... do`, etc.). When detected, the prompt is sent to Scaledown's
`/compress/raw/` endpoint, which rewrites it into a semantically equivalent but
much shorter form before the agent sees it. Long conversational prompts (e.g. code
you're asking it to write from scratch) are left alone.

---

## Development

```bash
git clone https://github.com/scaledown-team/DietCode
cd DietCode
npm install
npm test          # unit tests
npm run build     # compile TypeScript
```

Test the hook:
```bash
echo '{"prompt":"find the function that handles auth"}' \
  | SCALEDOWN_API_KEY=your-key node dist/hooks/user-prompt-submit.js
```

Test the MCP server starts:
```bash
SCALEDOWN_API_KEY=test echo '{}' | node dist/src/index.js
```

---

## License

MIT
