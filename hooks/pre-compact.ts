#!/usr/bin/env node
// PreCompact hook — intentionally a no-op.
//
// Claude Code's PreCompact hook CANNOT replace the compaction summary: it never
// receives the messages and has no output field to override Claude's summary
// (see anthropics/claude-code#24965). An earlier version of this hook assumed a
// `messages_to_compact` input and returned `{ summary }`; neither exists, so it
// never actually ran and mis-credited ScaleDown with Claude's own savings.
//
// Real, savings-positive compaction is now done by the DietCode proxy
// (`dietcode claude` / `dietcode proxy`), which rewrites the OUTGOING request so
// ScaleDown's summary genuinely replaces stale turns and reduces tokens. The
// proxy also keeps Claude's native auto-compaction from firing, so in practice
// this hook is rarely invoked. We keep it registered as a harmless, fail-open
// no-op for installs that run hooks without the proxy.

async function main(): Promise<void> {
  await drainStdin();
  process.stdout.write("{}");
}

function drainStdin(): Promise<void> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve();
    process.stdin.on("data", () => {});
    process.stdin.on("end", () => resolve());
    process.stdin.on("error", () => resolve());
    process.stdin.resume();
  });
}

main().catch(() => {
  process.stdout.write("{}");
});
