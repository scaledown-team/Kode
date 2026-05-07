#!/usr/bin/env node
import { ScaledownClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { isNiahQuery } from "../src/niah.js";

interface HookInput {
  prompt?: string;
  [key: string]: unknown;
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

  const client = new ScaledownClient(config.apiKey);
  let modifiedPrompt = prompt;

  // Step 1: Intent classification — always runs, fail-open
  try {
    const classification = await client.classify(prompt, INTENT_LABELS);
    const topScore = classification.scores[classification.top_label];
    const hint = `[Scaledown intent: ${classification.top_label} (${Math.round(topScore * 100)}%)]`;
    modifiedPrompt = `${hint}\n${modifiedPrompt}`;
    process.stderr.write(
      `scaledown: intent=${classification.top_label} (${Math.round(topScore * 100)}%)\n`
    );
  } catch (err) {
    process.stderr.write(
      `scaledown: classify failed, skipping hint: ${String(err)}\n`
    );
  }

  // Step 2: NIAH compression — only for large retrieval-style prompts
  const shouldCompress =
    config.niahDisable || isNiahQuery(prompt, config.compressThreshold);

  if (!shouldCompress) {
    process.stderr.write(`scaledown: compression skipped (prompt below threshold or not retrieval-style)\n`);
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
        `scaledown: compressed prompt (${result.original_prompt_tokens} → ${result.compressed_prompt_tokens} tokens, -${pct}%)\n`
      );

      // Re-apply the intent hint on top of the compressed output
      const classifyHintMatch = modifiedPrompt.match(
        /^\[Scaledown intent: .+?\]\n/
      );
      const hint = classifyHintMatch ? classifyHintMatch[0] : "";
      modifiedPrompt = `${hint}${result.compressed_prompt}`;
    } catch (err) {
      process.stderr.write(
        `scaledown: compression failed, using original: ${String(err)}\n`
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
  process.stderr.write(`scaledown hook error: ${String(err)}\n`);
  process.stdout.write("{}");
});
