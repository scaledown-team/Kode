#!/usr/bin/env node
import { readFileSync } from "fs";
import { ScaledownClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";

interface HookInput {
  trigger?: string;
  transcript_path?: string;
}

interface ContentBlock {
  type: string;
  text?: string;
}

interface Message {
  role: string;
  content: string | ContentBlock[];
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk: string) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    if (!process.stdin.isTTY) {
      process.stdin.resume();
    } else {
      resolve("{}");
    }
  });
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;
  return content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");
}

function formatTranscript(messages: Message[]): string {
  return messages
    .map((m) => `${m.role.toUpperCase()}: ${extractText(m.content)}`)
    .filter((line) => line.length > 10)
    .join("\n\n");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let input: HookInput;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.stdout.write("{}");
    return;
  }

  if (!input.transcript_path) {
    process.stdout.write("{}");
    return;
  }

  let config;
  try {
    config = loadConfig();
  } catch {
    process.stdout.write("{}");
    return;
  }

  try {
    const transcriptRaw = readFileSync(input.transcript_path, "utf8");

    // Transcript may be a JSON array or newline-delimited JSON
    let messages: Message[];
    const trimmed = transcriptRaw.trim();
    if (trimmed.startsWith("[")) {
      messages = JSON.parse(trimmed);
    } else {
      messages = trimmed
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    }

    const text = formatTranscript(messages);
    if (!text) {
      process.stdout.write("{}");
      return;
    }

    const client = new ScaledownClient(config.apiKey);
    const result = await client.summarize(
      text,
      `Structure the summary with these sections:
1. Task Overview - the user's core request, success criteria, and any clarifications or constraints
2. Current State - what has been completed, files created/modified (with full paths), key outputs or artifacts
3. Important Discoveries - technical constraints uncovered, decisions made and their rationale, errors encountered and how they were resolved, approaches that didn't work and why
4. Next Steps - specific actions needed to complete the task, blockers or open questions, priority order
5. Context to Preserve - user preferences or style requirements, domain-specific details, any promises made to the user

Include full file paths and code snippets where relevant. Be concise but complete — err on the side of including information that would prevent duplicate work or repeated mistakes.`
    );

    process.stderr.write(
      `scaledown: compacted session (${result.input_chars} → ${result.output_chars} chars)\n`
    );
    process.stdout.write(JSON.stringify({ summary: result.summary }));
  } catch (err) {
    process.stderr.write(
      `scaledown: compaction failed, using default: ${String(err)}\n`
    );
    process.stdout.write("{}");
  }
}

main().catch((err) => {
  process.stderr.write(`scaledown pre-compact error: ${String(err)}\n`);
  process.stdout.write("{}");
});
