# Scaledown Claude Code Plugin

Optimize your Claude Code sessions with [Scaledown](https://scaledown.ai) — automatic context compression, conversation summarization, intent-aware tool routing, and named entity extraction.

## What it does

Every time you submit a prompt, the plugin:

1. **Classifies your intent** and prepends a one-line hint (e.g. `[Scaledown intent: file_read (87%)]`) so Claude picks the right tool without guessing
2. **Compresses large contexts** automatically when you paste in a big codebase and ask a retrieval-style question — reducing token usage by 50–70% before the prompt reaches Claude

On top of that, Claude gains four new tools it can call on demand:

| Tool | What it does |
|---|---|
| `sd_compress` | Compress a large context block before a needle-in-a-haystack query |
| `sd_summarize` | Abstractively summarize text — useful for compacting long conversations |
| `sd_classify` | Classify text against custom labels (e.g. bug vs. feature vs. question) |
| `sd_extract` | Extract named entities or structured data from any text |

---

## Requirements

- Node.js 18 or later
- [Claude Code](https://claude.ai/code) CLI installed
- A Scaledown API key — get one free at [scaledown.ai/api-keys](https://scaledown.ai/api-keys)

---

## Installation

### Option A: npm (recommended)

```bash
npm install -g @scaledown/claude-plugin
scaledown-claude setup
```

The setup wizard will:
1. Open your browser to get an API key
2. Ask you to paste the key
3. Save it to your shell config (`~/.zshrc`, `~/.bashrc`, etc.)
4. Register the MCP server with Claude Code
5. Add the `UserPromptSubmit` hook to your project's `.claude/settings.json`

Restart Claude Code and you're done.

### Option B: manual

**1. Clone and build**
```bash
git clone https://github.com/scaledown-team/scaledown-claude-plugin
cd scaledown-claude-plugin
npm install && npm run build
```

**2. Set your API key**
```bash
export SCALEDOWN_API_KEY="your-key-here"
# Add the above line to ~/.zshrc or ~/.bashrc to persist it
```

**3. Register the MCP server**

For personal use (stored in `~/.claude.json`):
```bash
claude mcp add scaledown --transport stdio \
  -- node /path/to/scaledown-claude-plugin/dist/src/index.js
```

To share with your team (stored in `.mcp.json`, commit this file):
```bash
claude mcp add scaledown --transport stdio --scope project \
  -- npx -y @scaledown/claude-plugin
```

**4. Add the hook**

In `.claude/settings.json` at your project root (create if it doesn't exist):
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "scaledown-claude-hook"
          }
        ]
      }
    ]
  }
}
```

If you cloned the repo instead of installing globally, use the full path:
```json
"command": "node /path/to/scaledown-claude-plugin/dist/hooks/user-prompt-submit.js"
```

---

## Usage

### Automatic (hook)

Nothing to do — the hook fires on every prompt. You'll see the intent hint in Claude's context, and large retrieval queries are silently compressed before they reach the model.

```
[Scaledown intent: search (82%)]
Find all places where we call the payments API
```

### On-demand tools

Ask Claude to use any of the four tools directly:

**Compress a large context**
```
Use sd_compress to compress this before searching through it: [paste large codebase]
```

**Summarize a long conversation**
```
Use sd_summarize to condense this thread so we can keep working without hitting the context limit
```

**Classify text**
```
Use sd_classify to categorize these GitHub issues as bug, feature, or question
```

**Extract structured data**
```
Use sd_extract to pull out all function names, file paths, and error codes from this stack trace
```

---

## Configuration

### Changing your API key

Re-run setup to replace the key automatically:
```bash
scaledown-claude setup
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
| `SCALEDOWN_COMPRESS_THRESHOLD` | `10000` | Token estimate above which auto-compression fires |
| `SCALEDOWN_COMPRESS_RATE` | `0.3` | How aggressively to compress (0.3 = keep 30% of tokens) |
| `SCALEDOWN_NIAH_DISABLE` | `false` | Set to `true` to compress all large prompts, not just retrieval-style ones |

Example — compress more aggressively, lower threshold:
```bash
export SCALEDOWN_COMPRESS_THRESHOLD=5000
export SCALEDOWN_COMPRESS_RATE=0.2
```

---

## How compression works

The plugin uses a local heuristic to detect "needle-in-a-haystack" queries — prompts that are both large *and* retrieval-intent (containing keywords like `find`, `search`, `where`, `what does ... do`, etc.).

When detected, the full prompt is sent to Scaledown's `/compress/raw/` endpoint, which rewrites it into a semantically equivalent but much shorter form. The compressed version replaces the original before Claude sees it.

Conversational messages that happen to be long (e.g. a big code block you're asking Claude to write from scratch) are left alone.

---

## Development

```bash
git clone https://github.com/scaledown-team/scaledown-claude-plugin
cd scaledown-claude-plugin
npm install

npm test          # run unit tests
npm run build     # compile TypeScript
```

**Test the hook manually:**
```bash
npm run build
echo '{"prompt":"find the function that handles auth"}' \
  | SCALEDOWN_API_KEY=your-key node dist/hooks/user-prompt-submit.js
```

**Test the MCP server starts:**
```bash
SCALEDOWN_API_KEY=test echo '{}' | node dist/src/index.js
```

---

## License

MIT
