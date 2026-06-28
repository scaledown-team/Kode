/**
 * In-process MCP integration tests using InMemoryTransport.
 * Tests that all 4 tools are registered and respond correctly to MCP protocol calls.
 * Does NOT import src/index.ts (loadConfig runs at module-load time).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ScaledownClient } from "./client.js";
import { registerCompressTool } from "./tools/compress.js";
import { registerSummarizeTool } from "./tools/summarize.js";
import { registerClassifyTool } from "./tools/classify.js";
import { registerExtractTool } from "./tools/extract.js";

jest.mock("./stats.js", () => ({
  addSaving: jest.fn(),
  addRequest: jest.fn(),
  setContextWindow: jest.fn(),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

function mockOk(body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function mockHttpError(status: number, text = "") {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: String(status),
    text: () => Promise.resolve(text),
  });
}

// Mirrors the real /compress/raw/ wire shape: per-prompt fields nested under
// `results`, aggregate totals duplicated at the top level.
const COMPRESS_FIXTURE = {
  results: {
    success: true,
    compressed_prompt: "compressed text",
    original_prompt_tokens: 200,
    compressed_prompt_tokens: 60,
    compression_ratio: 0.3,
  },
  total_original_tokens: 200,
  total_compressed_tokens: 60,
  successful: true,
  latency_ms: 80,
  request_metadata: {
    compression_time_ms: 80,
    compression_rate: 0.3,
    prompt_length: 800,
    compressed_prompt_length: 240,
  },
};

const SUMMARIZE_FIXTURE = {
  summary: "A brief summary.",
  input_chars: 500,
  output_chars: 50,
  latency_ms: 120,
};

const CLASSIFY_FIXTURE = {
  top_label: "file_read",
  scores: { file_read: 0.85, web_search: 0.15 },
  labels: [
    { label: "file_read", score: 0.85, rubric: "Does this request involve reading a file?" },
    { label: "web_search", score: 0.15, rubric: "Does this request involve searching the web?" },
  ],
};

const EXTRACT_FIXTURE = {
  entities: [
    { text: "Alice", type: "Name", confidence: 0.97, start: 0, end: 5, context: "Alice is a developer" },
    { text: "alice@example.com", type: "Email", confidence: 0.99, start: 15, end: 33, context: "email: alice@example.com" },
  ],
};

async function buildConnectedPair() {
  const server = new McpServer({ name: "scaledown-test", version: "0.0.0" });
  const client = new ScaledownClient("test-key");
  const config = {
    apiKey: "test-key",
    compressThreshold: 10000,
    compressRate: "auto" as const,
    niahDisable: false,
    postToolDisable: false,
    postToolThreshold: 4000,
    compactThreshold: 50,
    showProgress: false,
    maxContextTokens: 200000,
  };

  registerCompressTool(server, client, config);
  registerSummarizeTool(server, client);
  registerClassifyTool(server, client);
  registerExtractTool(server, client);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test-client", version: "0.0.0" });

  await server.connect(serverTransport);
  await mcpClient.connect(clientTransport);

  return { mcpClient, server };
}

beforeEach(() => mockFetch.mockClear());

describe("tools/list", () => {
  it("returns exactly sd_compress, sd_summarize, sd_classify, sd_extract", async () => {
    const { mcpClient } = await buildConnectedPair();
    const result = await mcpClient.listTools();
    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["sd_classify", "sd_compress", "sd_extract", "sd_summarize"]);
  });

  it("each tool has a non-empty description", async () => {
    const { mcpClient } = await buildConnectedPair();
    const result = await mcpClient.listTools();
    for (const tool of result.tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.description!.length).toBeGreaterThan(10);
    }
  });
});

describe("sd_compress", () => {
  it("returns compressed_prompt and tokens_saved", async () => {
    const { mcpClient } = await buildConnectedPair();
    mockOk(COMPRESS_FIXTURE);

    const result = await mcpClient.callTool({
      name: "sd_compress",
      arguments: { context: "long context text here", prompt: "what is X?" },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.compressed_prompt).toBe("compressed text");
    expect(parsed.original_prompt_tokens).toBe(200);
    expect(parsed.compressed_prompt_tokens).toBe(60);
    expect(parsed.tokens_saved).toBe(140);
  });
});

describe("sd_summarize", () => {
  it("returns summary field", async () => {
    const { mcpClient } = await buildConnectedPair();
    mockOk(SUMMARIZE_FIXTURE);

    const result = await mcpClient.callTool({
      name: "sd_summarize",
      arguments: { text: "A very long document that needs summarizing." },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.summary).toBe("A brief summary.");
    expect(parsed.input_chars).toBe(500);
    expect(parsed.output_chars).toBe(50);
  });
});

describe("sd_classify", () => {
  it("returns top_label and scores", async () => {
    const { mcpClient } = await buildConnectedPair();
    mockOk(CLASSIFY_FIXTURE);

    const result = await mcpClient.callTool({
      name: "sd_classify",
      arguments: {
        text: "Please read the file config.json",
        labels: [
          { name: "file_read", rubric: "Does this request involve reading a file?" },
          { name: "web_search", rubric: "Does this request involve searching the web?" },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0].text;
    const parsed = JSON.parse(text);
    expect(parsed.top_label).toBe("file_read");
    expect(parsed.scores).toEqual({ file_read: 0.85, web_search: 0.15 });
    expect(Array.isArray(parsed.labels)).toBe(true);
  });
});

describe("sd_extract", () => {
  it("returns entities array", async () => {
    const { mcpClient } = await buildConnectedPair();
    mockOk(EXTRACT_FIXTURE);

    const result = await mcpClient.callTool({
      name: "sd_extract",
      arguments: {
        text: "Alice is a developer, email: alice@example.com",
        entities: { Name: "Full name of a person", Email: "Email address" },
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as { type: string; text: string }[])[0].text;
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed.entities)).toBe(true);
    expect(parsed.entities).toHaveLength(2);
    expect(parsed.entities[0].text).toBe("Alice");
    expect(parsed.entities[1].type).toBe("Email");
  });
});

describe("error handling", () => {
  it("propagates ScaledownError (401) as MCP error response", async () => {
    const { mcpClient } = await buildConnectedPair();
    mockHttpError(401, "unauthorized");

    const result = await mcpClient.callTool({
      name: "sd_compress",
      arguments: { context: "ctx", prompt: "query" },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0].text;
    expect(text).toMatch(/401/);
  });
});
