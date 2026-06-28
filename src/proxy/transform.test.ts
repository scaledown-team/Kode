import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import { transformRequest, type MessagesBody } from "./transform.js";
import type { SessionState } from "./store.js";
import type { ProxyConfig } from "../config.js";

// putOriginal/saveSessionState touch ~/.scaledown — sandbox HOME.
let home: string;
let prevHome: string | undefined;
beforeEach(() => {
  prevHome = process.env.HOME;
  home = mkdtempSync(resolve(tmpdir(), "dietcode-transform-"));
  process.env.HOME = home;
});
afterEach(() => {
  if (prevHome === undefined) delete process.env.HOME;
  else process.env.HOME = prevHome;
  rmSync(home, { recursive: true, force: true });
});

const baseConfig: ProxyConfig = {
  port: 8788,
  upstream: "https://api.anthropic.com",
  recentTurns: 2,
  blockThreshold: 2000,
  compactThreshold: 90000,
  disable: false,
  blockCompress: false,
};

const EMPTY: SessionState = { runningSummary: "", agedThrough: 0, updatedAt: "" };

// 4 user prompts (idx 0,2,4,6) + assistants between.
function sampleMessages(): MessagesBody["messages"] {
  return [
    { role: "user", content: "u0 please do the first thing" },
    { role: "assistant", content: "a0 did the first thing" },
    { role: "user", content: "u1 now the second thing" },
    { role: "assistant", content: "a1 second done" },
    { role: "user", content: "u2 third thing" },
    { role: "assistant", content: "a2 third done" },
    { role: "user", content: "u3 latest request" },
  ];
}

function body(): MessagesBody {
  return {
    model: "claude-x",
    system: [{ type: "text", text: "SYSTEM PROMPT" }],
    tools: [{ name: "Bash" }],
    messages: sampleMessages(),
  };
}

describe("under the compaction threshold", () => {
  it("makes zero ScaleDown calls and leaves messages untouched when no summary exists", async () => {
    const summarize = jest.fn();
    const res = await transformRequest(body(), { ...EMPTY }, { ...baseConfig, compactThreshold: 1e9 }, {
      summarize,
    });
    expect(summarize).not.toHaveBeenCalled();
    expect(res.compacted).toBe(false);
    expect(res.body.messages).toEqual(sampleMessages());
    expect(res.savedTokens).toBe(0);
  });

  it("reuses an existing running summary byte-for-byte (no ScaleDown call)", async () => {
    const summarize = jest.fn();
    const state: SessionState = { runningSummary: "EARLIER SUMMARY", agedThrough: 4, updatedAt: "" };
    const cfg = { ...baseConfig, compactThreshold: 1e9 };

    const r1 = await transformRequest(body(), state, cfg, { summarize });
    const r2 = await transformRequest(body(), state, cfg, { summarize });

    expect(summarize).not.toHaveBeenCalled();
    // Deterministic output across turns → prompt-cache stays warm.
    expect(JSON.stringify(r1.body)).toBe(JSON.stringify(r2.body));
    // Summary folded into the first kept message (the user prompt at idx 4).
    const first = r1.body.messages![0];
    expect(first.role).toBe("user");
    const text = (first.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("EARLIER SUMMARY");
    expect(text).toContain("sd_retrieve");
    // Tail preserved: folded msg + a2 + u3 == 3 messages.
    expect(r1.body.messages!.length).toBe(3);
  });
});

describe("at a compaction step (over threshold)", () => {
  it("calls summarize exactly once, folds the summary in, and advances state", async () => {
    const summarize = jest.fn().mockResolvedValue("FRESH SUMMARY");
    const res = await transformRequest(body(), { ...EMPTY }, { ...baseConfig, compactThreshold: 1 }, {
      summarize,
    });

    expect(summarize).toHaveBeenCalledTimes(1);
    expect(res.compacted).toBe(true);
    expect(res.state.agedThrough).toBe(4); // keeps last 2 user prompts (idx 4,6)
    expect(res.state.runningSummary).toBe("FRESH SUMMARY");

    const first = res.body.messages![0];
    const text = (first.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("FRESH SUMMARY");
  });

  it("reports positive savings when the aged content is large", async () => {
    const summarize = jest.fn().mockResolvedValue("TINY SUMMARY");
    const big = "lorem ipsum ".repeat(500); // ~6k chars per message
    const heavy: MessagesBody = {
      messages: [
        { role: "user", content: `u0 ${big}` },
        { role: "assistant", content: `a0 ${big}` },
        { role: "user", content: `u1 ${big}` },
        { role: "assistant", content: `a1 ${big}` },
        { role: "user", content: "u2 short" },
        { role: "assistant", content: "a2 short" },
        { role: "user", content: "u3 short" },
      ],
    };
    const res = await transformRequest(heavy, { ...EMPTY }, { ...baseConfig, compactThreshold: 1 }, {
      summarize,
    });
    expect(res.compacted).toBe(true);
    expect(res.savedTokens).toBeGreaterThan(0);
  });

  it("extends the prior summary rather than starting over", async () => {
    const summarize = jest.fn().mockResolvedValue("MERGED");
    const state: SessionState = { runningSummary: "PRIOR", agedThrough: 2, updatedAt: "" };
    await transformRequest(body(), state, { ...baseConfig, compactThreshold: 1 }, { summarize });
    const input = summarize.mock.calls[0][0] as string;
    expect(input).toContain("PRIOR"); // existing summary fed back in
  });

  it("never touches system or tools", async () => {
    const summarize = jest.fn().mockResolvedValue("S");
    const b = body();
    const res = await transformRequest(b, { ...EMPTY }, { ...baseConfig, compactThreshold: 1 }, {
      summarize,
    });
    expect(res.body.system).toBe(b.system);
    expect(res.body.tools).toBe(b.tools);
  });
});

describe("fail-open", () => {
  it("forwards the original messages when summarize throws", async () => {
    const summarize = jest.fn().mockRejectedValue(new Error("scaledown down"));
    const res = await transformRequest(body(), { ...EMPTY }, { ...baseConfig, compactThreshold: 1 }, {
      summarize,
    });
    expect(res.compacted).toBe(false);
    expect(res.body.messages).toEqual(sampleMessages());
  });
});

describe("too few turns to compact", () => {
  it("does nothing when there aren't more than recentTurns user prompts", async () => {
    const summarize = jest.fn();
    const small: MessagesBody = {
      messages: [
        { role: "user", content: "only one" },
        { role: "assistant", content: "reply" },
      ],
    };
    const res = await transformRequest(small, { ...EMPTY }, { ...baseConfig, compactThreshold: 1 }, {
      summarize,
    });
    expect(summarize).not.toHaveBeenCalled();
    expect(res.compacted).toBe(false);
  });
});
