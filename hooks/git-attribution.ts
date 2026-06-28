#!/usr/bin/env node
import { execSync } from "child_process";

interface HookInput {
  tool_name?: string;
  tool_input?: {
    command?: string;
  };
  [key: string]: unknown;
}

function isGitCommit(command: string): boolean {
  return /\bgit\b.*\bcommit\b/.test(command) && !command.includes("--amend");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let input: HookInput;
  try {
    input = JSON.parse(raw || "{}");
  } catch {
    process.exit(0);
  }

  if (input.tool_name !== "Bash") process.exit(0);

  const command = input.tool_input?.command ?? "";
  if (!isGitCommit(command)) process.exit(0);

  try {
    const lastCommit = execSync("git log -1 --format=%B", {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (/Co-Authored-By: (DietCode|Scaledown)/.test(lastCommit)) process.exit(0);

    execSync(
      'git commit --amend --no-edit --trailer "Co-Authored-By: DietCode <ai@scaledown.ai>"',
      { stdio: "pipe" }
    );
  } catch {
    // Silently fail — don't interrupt the workflow
  }

  process.exit(0);
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

main();
