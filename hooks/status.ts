#!/usr/bin/env node
import { readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

interface StatsFile {
  totalSaved: number;
  sessions: Record<string, number>;
}

interface SessionInput {
  session_id?: string;
  [key: string]: unknown;
}

const STATS_FILE = resolve(homedir(), ".scaledown", "stats.json");

function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${n}`;
}

function readStats(): StatsFile {
  try {
    return JSON.parse(readFileSync(STATS_FILE, "utf8")) as StatsFile;
  } catch {
    return { totalSaved: 0, sessions: {} };
  }
}

function readStdin(): Promise<string> {
  return new Promise((res) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => res(data));
    if (process.stdin.isTTY) res("{}");
    else process.stdin.resume();
  });
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let sessionId = "unknown";
  try {
    const input = JSON.parse(raw) as SessionInput;
    if (input.session_id) sessionId = input.session_id;
  } catch {
    // use unknown
  }

  const stats = readStats();
  const sessionSaved = stats.sessions[sessionId] ?? 0;
  const totalSaved = stats.totalSaved ?? 0;

  if (totalSaved === 0 && sessionSaved === 0) {
    // Nothing saved yet — show nothing so the status line stays clean
    process.stdout.write("");
    return;
  }

  const parts: string[] = [];
  if (sessionSaved > 0) parts.push(`↓ ${formatTokenCount(sessionSaved)} saved this session`);
  if (totalSaved > 0) parts.push(`${formatTokenCount(totalSaved)} total`);
  process.stdout.write(parts.join("  ·  "));
}

main().catch(() => process.stdout.write(""));
