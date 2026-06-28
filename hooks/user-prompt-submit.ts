#!/usr/bin/env node
import { readFileSync } from "fs";
import { ScaledownClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { isNiahQuery } from "../src/niah.js";
import { addRequest, addSaving, setContextWindow } from "../src/stats.js";

interface ContextWindow {
  current_tokens: number;
  max_tokens: number;
}

interface HookInput {
  prompt?: string;
  context_window?: ContextWindow;
  session_id?: string;
  transcript_path?: string;
  [key: string]: unknown;
}

function renderProgressBar(pct: number, width = 20): string {
  const filled = Math.round((pct / 100) * width);
  const bar = "█".repeat(filled) + "░".repeat(width - filled);
  return `[${bar}] ${pct}%`;
}

function logContextProgress(contextWindow: ContextWindow, compactThreshold: number): void {
  const { current_tokens, max_tokens } = contextWindow;
  if (max_tokens === 0) return;
  const pct = Math.round((current_tokens / max_tokens) * 100);
  const bar = renderProgressBar(pct);
  const tokenStr = `${current_tokens.toLocaleString("en-US")} / ${max_tokens.toLocaleString("en-US")} tokens`;
  const suffix = pct >= compactThreshold ? " ⚡ compaction imminent" : "";
  process.stderr.write(`dietcode: ${bar}  ${tokenStr}${suffix}\n`);
}

const INTENT_LABELS = [
  {
    name: "file_read",
    rubric:
      "Does this prompt ask to read, view, or retrieve the contents of a file?",
  },
  {
    name: "file_write",
    rubric: "Does this prompt ask to create, edit, or modify a file?",
  },
  {
    name: "shell_exec",
    rubric:
      "Does this prompt ask to run a shell command, script, or terminal process?",
  },
  {
    name: "search",
    rubric:
      "Does this prompt ask to search for, grep, or find content in files or directories?",
  },
  {
    name: "web",
    rubric:
      "Does this prompt ask to fetch content from a URL or browse the web?",
  },
  {
    name: "general",
    rubric:
      "Is this a conversational message or general question not requiring a specific tool?",
  },
];

async function main(): Promise<void> {
  const raw = await readStdin();
  const input: HookInput = JSON.parse(raw || "{}");
  const prompt = input.prompt;
  const sessionId = input.session_id ?? "unknown";

  if (!prompt) {
    process.stdout.write("{}");
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch {
    // No API key configured — pass through silently
    process.stdout.write("{}");
    return;
  }

  // Read real token counts from the transcript — last assistant usage entry
  // is the most recent actual API usage before this prompt.
  const transcriptPath = input.transcript_path as string | undefined;
  if (transcriptPath) {
    try {
      const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
      type UsageEntry = { input_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number };
      let lastUsage: UsageEntry | null = null;
      for (const line of lines) {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.type === "assistant" && entry.message && typeof entry.message === "object") {
          const usage = (entry.message as Record<string, unknown>).usage as UsageEntry | undefined;
          if (usage) lastUsage = usage;
        }
      }
      if (lastUsage) {
        const current = lastUsage.input_tokens + lastUsage.cache_read_input_tokens + lastUsage.cache_creation_input_tokens;
        const max = config.maxContextTokens;
        setContextWindow(current, max);
        if (config.showProgress) logContextProgress({ current_tokens: current, max_tokens: max }, config.compactThreshold);
      }
    } catch {
      // Transcript unreadable — skip progress display
    }
  }

  const client = new ScaledownClient(config.apiKey);
  let modifiedPrompt = prompt;

  // Step 1: Intent classification — always runs, fail-open
  try {
    const classification = await client.classify(prompt, INTENT_LABELS);
    const topScore = classification.scores[classification.top_label];
    const hint = `[DietCode intent: ${classification.top_label} (${Math.round(topScore * 100)}%)]`;
    modifiedPrompt = `${hint}\n${modifiedPrompt}`;
    process.stderr.write(
      `dietcode: intent=${classification.top_label} (${Math.round(topScore * 100)}%)\n`
    );
    addRequest();
  } catch (err) {
    process.stderr.write(
      `dietcode: classify failed, skipping hint: ${String(err)}\n`
    );
  }

  // Step 2: NIAH compression — only for large retrieval-style prompts
  const shouldCompress =
    config.niahDisable || isNiahQuery(prompt, config.compressThreshold);

  if (!shouldCompress) {
    process.stderr.write(`dietcode: compression skipped (prompt below threshold or not retrieval-style)\n`);
  } else {
    try {
      const result = await client.compress(
        prompt,
        "Complete the request above.",
        config.compressRate
      );
      const saved =
        result.original_prompt_tokens - result.compressed_prompt_tokens;
      const pct = Math.round((saved / result.original_prompt_tokens) * 100);
      process.stderr.write(
        `dietcode: compressed prompt (${result.original_prompt_tokens} → ${result.compressed_prompt_tokens} tokens, -${pct}%)\n`
      );
      addSaving(sessionId, saved);
      addRequest();

      // Re-apply the intent hint on top of the compressed output
      const classifyHintMatch = modifiedPrompt.match(
        /^\[DietCode intent: .+?\]\n/
      );
      const hint = classifyHintMatch ? classifyHintMatch[0] : "";
      modifiedPrompt = `${hint}${result.compressed_prompt}`;
    } catch (err) {
      process.stderr.write(
        `dietcode: compression failed, using original: ${String(err)}\n`
      );
    }
  }

  if (modifiedPrompt === prompt) {
    process.stdout.write("{}");
  } else {
    process.stdout.write(JSON.stringify({ prompt: modifiedPrompt }));
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    // Resolve immediately if stdin is not a pipe (e.g. in tests)
    if (!process.stdin.isTTY) {
      process.stdin.resume();
    } else {
      resolve("{}");
    }
  });
}

main().catch((err) => {
  process.stderr.write(`dietcode hook error: ${String(err)}\n`);
  process.stdout.write("{}");
});
