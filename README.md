# Kode by Scaledown

**The context optimization layer for AI coding agents.**

50-70% fewer tokens · intent-aware routing · MCP server · 4 tools · works in Claude Code, Cursor & Codex CLI

Kode compresses and routes everything your coding agent reads (large contexts,
long conversations, pasted codebases) before it reaches the model. Same answers,
a fraction of the tokens.

---

## What it does

On every prompt (Claude Code), Kode:

1. **Classifies your intent** and prepends a one-line hint
   (e.g. `[Scaledown intent: file_read (87%)]`) so the agent picks the right tool
   without guessing.
2. **Compresses large contexts** automatically when you paste a big codebase and
   ask a retrieval-style question, cutting token usage 50-70% before the prompt
   reaches the model.

On top of that, your agent gains four tools it can call on demand in **all three clients**:

| Tool | What it does |
|---|---|
| `sd_compress` | Compress a large context block before a needle-in-a-haystack query |
| `sd_summarize` | Abstractively summarize text to compact long conversations |
| `sd_classify` | Classify text against custom labels (bug vs. feature vs. question) |
| `sd_extract` | Extract named entities or structured data from any text |

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
> The four MCP tools work everywhere. Automatic prompt hooks
> (`UserPromptSubmit`, `PreCompact`) are **Claude Code-only**. See the
> [feature comparison](#feature-comparison).

**Requirements**

- Node.js 18 or later
- A Scaledown API key, free at [scaledown.ai/dashboard](https://scaledown.ai/dashboard)
- One of: [Claude Code](https://claude.ai/code) · [Cursor](https://cursor.com) · [Codex CLI](https://github.com/openai/codex)

### Claude Code (recommended)

```bash
npm install -g @scaledown/claude-plugin
scaledown-claude setup
```

The wizard opens your browser for a key, saves it to your shell config, registers
the MCP server, and adds the `UserPromptSubmit` hook. Restart Claude Code and
you're done.

<details>
<summary>Manual setup</summary>

**1. Clone and build**
```bash
git clone https://github.com/scaledown-team/scaledown-claude-plugin
cd scaledown-claude-plugin
npm install && npm run build
```

**2. Set your API key**
```bash
export SCALEDOWN_API_KEY="your-key-here"   # add to ~/.zshrc or ~/.bashrc to persist
```

**3. Register the MCP server**

Personal use (`~/.claude.json`):
```bash
claude mcp add scaledown --transport stdio \
  -- node /path/to/scaledown-claude-plugin/dist/src/index.js
```

Team use (`.mcp.json`, commit this file):
```bash
claude mcp add scaledown --transport stdio --scope project \
  -- npx -y @scaledown/claude-plugin
```

**4. Add the hook** to `.claude/settings.json`:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "scaledown-claude-hook" } ] }
    ]
  }
}
```
If you cloned instead of installing globally, use the full path:
```json
"command": "node /path/to/scaledown-claude-plugin/dist/hooks/user-prompt-submit.js"
```
</details>

### Cursor

```bash
npm install -g @scaledown/claude-plugin
export SCALEDOWN_API_KEY="your-key-here"
```

Create `.cursor/mcp.json` (or `~/.cursor/mcp.json` for global use):
```json
{
  "mcpServers": {
    "scaledown": {
      "command": "npx",
      "args": ["-y", "@scaledown/claude-plugin"],
      "env": { "SCALEDOWN_API_KEY": "your-key-here" }
    }
  }
}
```
Restart Cursor. The four tools appear in Agent mode.

> Cursor doesn't support hooks, so auto-compression and intent hints won't fire.
> Use the tools on demand.

### OpenAI Codex CLI

```bash
npm install -g @scaledown/claude-plugin
codex mcp add scaledown --env SCALEDOWN_API_KEY=your-key-here -- npx -y @scaledown/claude-plugin
```
This writes to `~/.codex/config.toml`:
```toml
[mcp_servers.scaledown]
command = "npx"
args = ["-y", "@scaledown/claude-plugin"]

[mcp_servers.scaledown.env]
SCALEDOWN_API_KEY = "your-key-here"
```

> Codex CLI doesn't support `UserPromptSubmit` / `PreCompact` hooks. Use the tools on demand.

---

## Feature comparison

| Feature | Claude Code | Cursor | Codex CLI |
|---|---|---|---|
| `sd_compress` / `sd_summarize` / `sd_classify` / `sd_extract` | ✅ | ✅ | ✅ |
| Auto intent hints on every prompt | ✅ | ❌ | ❌ |
| Auto compression (large prompts) | ✅ | ❌ | ❌ |
| Auto summarization on compaction | ✅ | ❌ | ❌ |

---

## Usage

**Automatic (Claude Code hook):** nothing to do; the hook fires on every prompt:
```
[Scaledown intent: search (82%)]
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

Re-run `scaledown-claude setup` to swap your key, or edit your shell config directly.

| Variable | Default | Description |
|---|---|---|
| `SCALEDOWN_API_KEY` | (none) | **Required.** Your Scaledown API key |
| `SCALEDOWN_COMPRESS_THRESHOLD` | `10000` | Token estimate above which auto-compression fires |
| `SCALEDOWN_COMPRESS_RATE` | `0.3` | How aggressively to compress (0.3 = keep 30% of tokens) |
| `SCALEDOWN_NIAH_DISABLE` | `false` | `true` compresses all large prompts, not just retrieval-style |

```bash
export SCALEDOWN_COMPRESS_THRESHOLD=5000
export SCALEDOWN_COMPRESS_RATE=0.2
```

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
git clone https://github.com/scaledown-team/scaledown-claude-plugin
cd scaledown-claude-plugin
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
