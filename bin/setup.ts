#!/usr/bin/env node
import { createInterface } from "readline";
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { ScaledownClient } from "../src/client.js";

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

  // Make available in the current process immediately
  process.env.SCALEDOWN_API_KEY = apiKey;
  console.log(`  ✓ API key saved to ${rcFile}`);
}

function registerMcp(): void {
  const entryPoint = resolve(DIST_ROOT, "src", "index.js");
  try {
    execSync(`claude mcp add scaledown -- node "${entryPoint}"`, {
      stdio: "inherit",
    });
    console.log("  ✓ MCP server registered with Claude Code");
  } catch {
    console.warn(
      "  ⚠ Could not register MCP server automatically.\n" +
        `    Run manually: claude mcp add scaledown -- node "${entryPoint}"`
    );
  }
}

function writeAgent(): void {
  const agentsDir = resolve(process.cwd(), ".claude", "agents");
  const agentPath = resolve(agentsDir, "scaledown.md");

  if (!existsSync(agentsDir)) {
    execSync(`mkdir -p "${agentsDir}"`);
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
  const settingsPath = resolve(process.cwd(), ".claude", "settings.json");

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    try {
      settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    } catch {
      // Malformed settings.json — start fresh
    }
  }

  const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
  hooks.UserPromptSubmit = [{ type: "command", command: promptHookCommand }];
  hooks.PostToolUse = [{ type: "command", command: postToolHookCommand }];
  settings.hooks = hooks;
  settings.agent = "scaledown";

  const settingsDir = resolve(process.cwd(), ".claude");
  if (!existsSync(settingsDir)) {
    execSync(`mkdir -p "${settingsDir}"`);
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf8");
  console.log(`  ✓ Hooks and agent written to ${settingsPath}`);
}

async function main(): Promise<void> {
  console.log("\n🔧 Scaledown Claude Code Plugin Setup\n");

  // Step 1: Open browser for API key
  console.log("Opening scaledown.ai to get your API key...");
  try {
    const { default: open } = await import("open");
    await open("https://scaledown.ai/api-keys");
  } catch {
    console.log("  Visit https://scaledown.ai/api-keys to get your API key.");
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
        "  ✗ Invalid API key. Check your key at https://scaledown.ai/api-keys"
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
  console.log(`
✅ Scaledown is ready!

Active features:
  • "scaledown" badge shown in the Claude Code text input
  • Intent hint prepended to every prompt (helps Claude pick the right tool)
  • Auto-compression for large NIAH-style queries (threshold: ${process.env.SCALEDOWN_COMPRESS_THRESHOLD ?? "10000"} tokens, rate: ${process.env.SCALEDOWN_COMPRESS_RATE ?? "0.3"})
  • Post-tool output compression — large tool results are compressed before entering context (threshold: ${process.env.SCALEDOWN_POST_TOOL_THRESHOLD ?? "4000"} tokens)

Environment variables:
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
