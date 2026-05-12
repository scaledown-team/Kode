#!/usr/bin/env node
import { createInterface } from "readline";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ScaledownClient } from "../src/client.js";
import { CONFIG_FILE } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_ROOT = resolve(__dirname, "..");

function prompt(question: string): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res) => {
    rl.question(question, (answer) => {
      rl.close();
      res(answer.trim());
    });
  });
}

function detectRcFile(): string {
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh")) return `${homedir()}/.zshrc`;
  if (shell.includes("bash")) return `${homedir()}/.bashrc`;
  if (shell.includes("fish")) return `${homedir()}/.config/fish/config.fish`;
  return `${homedir()}/.profile`;
}

function storeApiKey(apiKey: string): void {
  const rcFile = detectRcFile();
  const exportLine = `\nexport SCALEDOWN_API_KEY="${apiKey}"\n`;

  const existing = existsSync(rcFile) ? readFileSync(rcFile, "utf8") : "";
  if (existing.includes("SCALEDOWN_API_KEY")) {
    // Replace the existing line
    const updated = existing.replace(
      /\nexport SCALEDOWN_API_KEY="[^"]*"\n/,
      exportLine
    );
    writeFileSync(rcFile, updated, "utf8");
  } else {
    writeFileSync(rcFile, existing + exportLine, "utf8");
  }

  // Write to config file so hooks can read it without a sourced shell
  const configDir = resolve(CONFIG_FILE, "..");
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify({ apiKey }, null, 2) + "\n", "utf8");

  // Make available in the current process immediately
  process.env.SCALEDOWN_API_KEY = apiKey;
  console.log(`  ✓ API key saved to ${rcFile} and ${CONFIG_FILE}`);
}

function registerMcp(): void {
  const entryPoint = resolve(DIST_ROOT, "src", "index.js");
  try {
    execSync(`claude mcp add --scope user scaledown -- node "${entryPoint}"`, {
      stdio: "inherit",
    });
    console.log("  ✓ MCP server registered globally with Claude Code");
  } catch {
    console.warn(
      "  ⚠ Could not register MCP server automatically.\n" +
        `    Run manually: claude mcp add --scope user scaledown -- node "${entryPoint}"`
    );
  }
}

function writeAgent(): void {
  const agentsDir = resolve(homedir(), ".claude", "agents");
  const agentPath = resolve(agentsDir, "scaledown.md");

  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }

  writeFileSync(
    agentPath,
    `---
name: scaledown
description: Scaledown-enhanced agent — context compression and intent routing active
model: inherit
---
`,
    "utf8"
  );
  console.log(`  ✓ Agent definition written to ${agentPath}`);
}

function writeHooks(): void {
  const promptHookCommand = `node "${resolve(DIST_ROOT, "hooks", "user-prompt-submit.js")}"`;
  const postToolHookCommand = `node "${resolve(DIST_ROOT, "hooks", "post-tool-use.js")}"`;
  const preCompactHookCommand = `node "${resolve(DIST_ROOT, "hooks", "pre-compact.js")}"`;
  const statusCommand = `node "${resolve(DIST_ROOT, "hooks", "status.js")}"`;
  const settingsPath = resolve(homedir(), ".claude", "settings.json");

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      // Malformed settings.json — start fresh
    }
  }

  const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
  hooks.UserPromptSubmit = [
    { matcher: "", hooks: [{ type: "command", command: promptHookCommand }] },
  ];
  hooks.PostToolUse = [
    { matcher: "", hooks: [{ type: "command", command: postToolHookCommand }] },
  ];
  hooks.PreCompact = [
    { matcher: "", hooks: [{ type: "command", command: preCompactHookCommand }] },
  ];
  settings.hooks = hooks;

  // Status line: shows token savings below the Claude Code text input bar
  settings.statusLine = {
    type: "command",
    command: statusCommand,
    refreshInterval: 5000,
  };

  // Set Claude Code's auto-compact threshold to match SCALEDOWN_COMPACT_THRESHOLD
  const compactThreshold = process.env.SCALEDOWN_COMPACT_THRESHOLD ?? "50";
  const env = (settings.env as Record<string, string>) ?? {};
  env.CLAUDE_AUTOCOMPACT_PCT_OVERRIDE = compactThreshold;
  settings.env = env;

  const settingsDir = resolve(homedir(), ".claude");
  if (!existsSync(settingsDir)) {
    mkdirSync(settingsDir, { recursive: true });
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  console.log(`  ✓ Hooks written to ${settingsPath}`);
}

async function main(): Promise<void> {
  console.log("\n🔧 Scaledown Claude Code Plugin Setup\n");

  // Step 1: Open browser for API key
  console.log("Opening scaledown.ai to get your API key...");
  try {
    const { default: open } = await import("open");
    await open("https://scaledown.ai/dashboard");
  } catch {
    console.log("  Visit https://scaledown.ai/dashboard to get your API key.");
  }

  // Step 2: Prompt for key
  const apiKey = await prompt("\nPaste your API key: ");
  if (!apiKey) {
    console.error("No API key provided. Exiting.");
    process.exit(1);
  }

  // Step 3: Validate
  console.log("\nValidating API key...");
  const client = new ScaledownClient(apiKey);
  try {
    await client.classify("test", [
      { name: "test", rubric: "Is this a test message?" },
    ]);
    console.log("  ✓ API key is valid");
  } catch (err: unknown) {
    const status =
      err instanceof Error && "status" in err
        ? (err as { status: number }).status
        : null;
    if (status === 401) {
      console.error(
        "  ✗ Invalid API key. Check your key at https://scaledown.ai/dashboard"
      );
      process.exit(1);
    }
    // Non-auth errors (network, 500) — warn but continue
    console.warn(
      `  ⚠ Could not validate key (${String(err)}). Continuing anyway.`
    );
  }

  // Step 4: Store key
  console.log("\nSaving API key...");
  storeApiKey(apiKey);

  // Step 5: Register MCP
  console.log("\nRegistering MCP server...");
  registerMcp();

  // Step 6: Write agent definition + hooks
  console.log("\nConfiguring agent and hooks...");
  writeAgent();
  writeHooks();

  // Step 7: Summary
  const rcFile2 = detectRcFile();
  console.log(`
✅ Scaledown is ready!

  To use the API key in your current terminal session, run:
    source ${rcFile2}
  (New terminal windows will pick it up automatically.)

Active features:
  • "scaledown" badge shown in the Claude Code text input
  • Co-Authored-By: Scaledown trailer added to every git commit
  • Intent hint prepended to every prompt (helps Claude pick the right tool)
  • Context progress bar shown on every prompt (e.g. [████░░░░░░] 42%)
  • Auto-compression for large NIAH-style queries (threshold: ${process.env.SCALEDOWN_COMPRESS_THRESHOLD ?? "10000"} tokens, rate: ${process.env.SCALEDOWN_COMPRESS_RATE ?? "0.3"})
  • Post-tool output compression — large tool results are compressed before entering context (threshold: ${process.env.SCALEDOWN_POST_TOOL_THRESHOLD ?? "4000"} tokens)
  • Context compaction via Scaledown at ${process.env.SCALEDOWN_COMPACT_THRESHOLD ?? "25"}% usage (replaces Claude's default summarization)
  • Token savings counter shown below the Claude Code text input (updates every 5s)

Environment variables:
  SCALEDOWN_COMPACT_THRESHOLD=N      — context % that triggers compaction (default: 50)
  SCALEDOWN_SHOW_PROGRESS=false      — disable the per-turn context progress bar
  SCALEDOWN_POST_TOOL_DISABLE=true   — disable post-tool compression
  SCALEDOWN_POST_TOOL_THRESHOLD=N    — token threshold for tool output compression (default: 4000)

On-demand MCP tools Claude can call:
  • sd_compress   — compress a large context block
  • sd_summarize  — abstractively summarize text
  • sd_classify   — classify text with custom labels
  • sd_extract    — extract named entities / structured data

Restart Claude Code for changes to take effect.
Docs: https://docs.scaledown.ai
`);
}

main().catch((err) => {
  console.error("Setup failed:", err);
  process.exit(1);
});
