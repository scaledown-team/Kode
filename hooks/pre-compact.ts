#!/usr/bin/env node
import { ScaledownClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { estimateTokens } from "../src/niah.js";
import { addRequest, addSaving } from "../src/stats.js";

interface Message {
  role: string;
  content: unknown;
}

interface HookInput {
  messages_to_compact?: Message[];
  current_summary?: string;
  trigger?: "auto" | "manual";
  custom_instructions?: string;
  session_id?: string;
  compactNumber?: number;
  [key: string]: unknown;
}

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object") {
          const b = block as Record<string, unknown>;
          if (b.type === "text" && typeof b.text === "string") return b.text;
          if (typeof b.text === "string") return b.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function serializeMessages(messages: Message[], existingSummary?: string): string {
  const parts: string[] = [];
  if (existingSummary) {
    parts.push(`[Previous summary]\n${existingSummary}`);
  }
  for (const msg of messages) {
    const text = extractMessageText(msg.content);
    if (text.trim()) {
      parts.push(`${msg.role.toUpperCase()}:\n${text.trim()}`);
    }
  }
  return parts.join("\n\n---\n\n");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const input: HookInput = JSON.parse(raw || "{}");
  const {
    messages_to_compact,
    current_summary,
    trigger = "auto",
    custom_instructions,
    compactNumber = 1,
  } = input;

  if (!messages_to_compact || messages_to_compact.length === 0) {
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

  const conversationText = serializeMessages(messages_to_compact, current_summary);
  const instructions = custom_instructions
    ? `Summarize this conversation. ${custom_instructions}`
    : "Summarize this conversation concisely, preserving key decisions, code changes, file paths, error details, and any context needed to continue the work seamlessly.";

  const client = new ScaledownClient(config.apiKey);
  try {
    process.stderr.write(
      `dietcode: summarizing context (${trigger}, compact #${compactNumber}, ${messages_to_compact.length} messages)...\n`
    );
    const result = await client.summarize(conversationText, instructions);
    const ratio = result.input_chars > 0
      ? Math.round((1 - result.output_chars / result.input_chars) * 100)
      : 0;
    process.stderr.write(
      `dietcode: summary complete — ${result.input_chars} → ${result.output_chars} chars (-${ratio}%)\n`
    );
    const saved = Math.max(0, estimateTokens(conversationText) - estimateTokens(result.summary));
    addSaving(input.session_id ?? "compact", saved);
    addRequest();
    process.stdout.write(JSON.stringify({ summary: result.summary }));
  } catch (err) {
    process.stderr.write(
      `dietcode: summarization failed, falling back to Claude default: ${String(err)}\n`
    );
    process.stdout.write("{}");
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    if (!process.stdin.isTTY) {
      process.stdin.resume();
    } else {
      resolve("{}");
    }
  });
}

main().catch((err) => {
  process.stderr.write(`dietcode pre-compact hook error: ${String(err)}\n`);
  process.stdout.write("{}");
});
