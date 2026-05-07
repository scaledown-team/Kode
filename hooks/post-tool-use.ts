#!/usr/bin/env node
import { ScaledownClient } from "../src/client.js";
import { loadConfig } from "../src/config.js";
import { estimateTokens } from "../src/niah.js";

interface HookInput {
  tool_name?: string;
  tool_input?: unknown;
  tool_response?: unknown;
  [key: string]: unknown;
}

// Extracts the primary text content from a tool response.
// Handles Bash {output}, Read/MCP {content}, and plain strings.
export function extractText(toolResponse: unknown): string | null {
  if (typeof toolResponse === "string") return toolResponse;
  if (toolResponse !== null && typeof toolResponse === "object") {
    const r = toolResponse as Record<string, unknown>;
    if (typeof r.output === "string") return r.output;
    if (typeof r.content === "string") return r.content;
    if (typeof r.text === "string") return r.text;
  }
  return null;
}

// Returns a new tool_response with the text field replaced by newText.
export function replaceText(toolResponse: unknown, newText: string): unknown {
  if (typeof toolResponse === "string") return newText;
  if (toolResponse !== null && typeof toolResponse === "object") {
    const r = toolResponse as Record<string, unknown>;
    if (typeof r.output === "string") return { ...r, output: newText };
    if (typeof r.content === "string") return { ...r, content: newText };
    if (typeof r.text === "string") return { ...r, text: newText };
  }
  return toolResponse;
}

async function main(): Promise<void> {
  const raw = await readStdin();
  const input: HookInput = JSON.parse(raw || "{}");
  const { tool_response } = input;

  if (tool_response === undefined) {
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

  if (config.postToolDisable) {
    process.stdout.write("{}");
    return;
  }

  const text = extractText(tool_response);
  if (text === null || estimateTokens(text) < config.postToolThreshold) {
    process.stdout.write("{}");
    return;
  }

  const client = new ScaledownClient(config.apiKey);
  try {
    const result = await client.compress(text, "", config.compressRate);
    const saved = result.original_prompt_tokens - result.compressed_prompt_tokens;
    process.stderr.write(
      `scaledown: compressed tool output (${result.original_prompt_tokens} → ${result.compressed_prompt_tokens} tokens, saved ${saved})\n`
    );
    const modified = replaceText(tool_response, result.compressed_prompt);
    process.stdout.write(JSON.stringify({ tool_response: modified }));
  } catch (err) {
    process.stderr.write(
      `scaledown: post-tool compression failed, using original: ${String(err)}\n`
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
  process.stderr.write(`scaledown post-tool hook error: ${String(err)}\n`);
  process.stdout.write("{}");
});
