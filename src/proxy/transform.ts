// Progressive compaction for the DietCode proxy.
//
// The key property: we do NOT summarize on every request. We keep a per-session
// "running summary" standing in for the oldest turns, plus a verbatim "hot
// window" of everything since. Most requests just forward (summary + hot
// window) with zero ScaleDown calls. Only when (summary + hot window) exceeds
// `compactThreshold` do we make ONE ScaleDown call to fold the older part of the
// hot window into the running summary — a compaction step. This mirrors how
// often Claude would auto-compact, but the work is done by ScaleDown and on the
// outgoing payload we control, so it genuinely reduces tokens.
//
// Cache safety: `system`, `tools`, and the verbatim tail are never modified.
// The folded summary block is byte-identical between compaction steps (it is
// derived from fixed history), so Anthropic's prompt cache keeps hitting; it
// changes only at a compaction step, exactly when native compaction would have
// busted the cache too.

import { estimateTokens } from "../niah.js";
import type { ProxyConfig } from "../config.js";
import { putOriginal, type SessionState } from "./store.js";

export interface AnthropicMessage {
  role: string;
  content: unknown; // string | ContentBlock[]
}

export interface MessagesBody {
  messages?: AnthropicMessage[];
  system?: unknown;
  tools?: unknown;
  [k: string]: unknown;
}

export interface TransformDeps {
  /** Injected so tests can run without a live ScaledownClient. */
  summarize: (text: string, instructions?: string) => Promise<string>;
}

export interface TransformResult {
  body: MessagesBody;
  savedTokens: number;
  state: SessionState;
  /** True iff a ScaleDown call happened on this request (a compaction step). */
  compacted: boolean;
}

const SUMMARY_INSTRUCTIONS =
  "Summarize this software-engineering conversation concisely, preserving key " +
  "decisions, code changes, exact file paths, commands, error messages, and any " +
  "context needed to continue the work seamlessly. Merge any existing summary " +
  "and the new turns into a single cohesive summary.";

// A "user prompt" is a real user turn — role user with no tool_result block.
// These are the only safe boundaries to cut at: cutting elsewhere could orphan a
// tool_result from its tool_use and make Anthropic reject the request.
function isUserPrompt(msg: AnthropicMessage): boolean {
  if (msg.role !== "user") return false;
  if (typeof msg.content === "string") return true;
  if (Array.isArray(msg.content)) {
    return !msg.content.some(
      (b) => b && typeof b === "object" && (b as { type?: string }).type === "tool_result"
    );
  }
  return true;
}

function blockText(block: unknown): string {
  if (typeof block === "string") return block;
  if (!block || typeof block !== "object") return "";
  const b = block as Record<string, unknown>;
  if (b.type === "text" && typeof b.text === "string") return b.text;
  if (b.type === "tool_use") {
    const name = typeof b.name === "string" ? b.name : "tool";
    return `[tool_use: ${name}(${JSON.stringify(b.input ?? {})})]`;
  }
  if (b.type === "tool_result") {
    const c = b.content;
    if (typeof c === "string") return `[tool_result] ${c}`;
    if (Array.isArray(c)) return `[tool_result] ${c.map(blockText).join("\n")}`;
    return "[tool_result]";
  }
  if (typeof b.text === "string") return b.text;
  return "";
}

function messageText(msg: AnthropicMessage): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) return msg.content.map(blockText).filter(Boolean).join("\n");
  return "";
}

function serialize(messages: AnthropicMessage[]): string {
  return messages
    .map((m) => {
      const t = messageText(m).trim();
      return t ? `${m.role.toUpperCase()}:\n${t}` : "";
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function normalizeContent(content: unknown): unknown[] {
  if (Array.isArray(content)) return content;
  if (typeof content === "string") return [{ type: "text", text: content }];
  return [];
}

// Index of the message that leaves the last `recentTurns` user prompts (and
// everything after them) verbatim. Returns -1 if there aren't enough turns to
// compact anything.
function foldBoundary(messages: AnthropicMessage[], recentTurns: number): number {
  const userIdxs: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (isUserPrompt(messages[i])) userIdxs.push(i);
  }
  if (userIdxs.length <= recentTurns) return -1;
  return userIdxs[userIdxs.length - recentTurns];
}

function buildPreamble(summary: string, retrieveId: string): string {
  return (
    "[Earlier conversation — ScaleDown summary. " +
    `Call sd_retrieve("${retrieveId}") for the full earlier transcript.]\n\n` +
    summary +
    "\n\n[End of summary — recent turns continue below.]"
  );
}

// Folds the running summary into the first kept message (a user prompt) so the
// forwarded message list stays role-valid (no extra/duplicate-role messages).
function applySummary(
  messages: AnthropicMessage[],
  state: SessionState,
  retrieveId: string
): AnthropicMessage[] {
  if (!state.runningSummary || state.agedThrough <= 0) return messages;
  const anchor = messages[state.agedThrough];
  if (!anchor) return messages;
  const folded: AnthropicMessage = {
    role: "user",
    content: [
      { type: "text", text: buildPreamble(state.runningSummary, retrieveId) },
      ...normalizeContent(anchor.content),
    ],
  };
  return [folded, ...messages.slice(state.agedThrough + 1)];
}

export async function transformRequest(
  body: MessagesBody,
  state: SessionState,
  config: ProxyConfig,
  deps: TransformDeps
): Promise<TransformResult> {
  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return { body, savedTokens: 0, state, compacted: false };
  }

  // Defensive: if history shrank below where we'd aged to (new/forked
  // conversation reusing the id), reset rather than fold against a bad index.
  let working: SessionState =
    state.agedThrough > messages.length ||
    (state.agedThrough > 0 && !isUserPrompt(messages[state.agedThrough] ?? { role: "x", content: "" }))
      ? { runningSummary: "", agedThrough: 0, updatedAt: "" }
      : { ...state };

  let compacted = false;
  let retrieveId = state.runningSummary ? putOriginal(state.runningSummary, state.runningSummary) : "";

  // Decide whether this request crosses the budget and needs a compaction step.
  const liveTokens =
    estimateTokens(working.runningSummary) +
    estimateTokens(serialize(messages.slice(working.agedThrough)));

  if (liveTokens > config.compactThreshold) {
    const boundary = foldBoundary(messages, config.recentTurns);
    if (boundary > working.agedThrough) {
      const newlyAged = messages.slice(working.agedThrough, boundary);
      const input = working.runningSummary
        ? `[Existing summary]\n${working.runningSummary}\n\n[New turns]\n${serialize(newlyAged)}`
        : serialize(newlyAged);
      try {
        const summary = await deps.summarize(input, SUMMARY_INSTRUCTIONS);
        if (summary && summary.trim()) {
          // Store the full aged transcript for sd_retrieve reversibility.
          retrieveId = putOriginal(serialize(messages.slice(0, boundary)), summary);
          working = { runningSummary: summary, agedThrough: boundary, updatedAt: "" };
          compacted = true;
        }
      } catch {
        // Fail-open: keep the prior state, forward without a new summary.
      }
    }
  }

  const forwarded = applySummary(messages, working, retrieveId);
  const savedTokens = Math.max(
    0,
    estimateTokens(JSON.stringify(messages)) - estimateTokens(JSON.stringify(forwarded))
  );

  return {
    body: { ...body, messages: forwarded },
    savedTokens,
    state: working,
    compacted,
  };
}
