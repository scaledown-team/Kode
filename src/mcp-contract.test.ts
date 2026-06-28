/**
 * MCP tool schema contract tests — verifies input schema shapes without making HTTP calls.
 * Ensures tool parameter shapes match what clients (Claude Code, Cursor, Codex) expect.
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

// No fetch calls needed — these are schema-only tests
global.fetch = jest.fn();

async function getToolSchemas() {
  const server = new McpServer({ name: "scaledown-test", version: "0.0.0" });
  const sdClient = new ScaledownClient("test-key");
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

  registerCompressTool(server, sdClient, config);
  registerSummarizeTool(server, sdClient);
  registerClassifyTool(server, sdClient);
  registerExtractTool(server, sdClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const mcpClient = new Client({ name: "test-client", version: "0.0.0" });
  await server.connect(serverTransport);
  await mcpClient.connect(clientTransport);

  const { tools } = await mcpClient.listTools();
  return Object.fromEntries(tools.map((t) => [t.name, t]));
}

let tools: Awaited<ReturnType<typeof getToolSchemas>>;

beforeAll(async () => {
  tools = await getToolSchemas();
});

describe("sd_compress schema", () => {
  it("has context as required string", () => {
    const schema = tools["sd_compress"].inputSchema as { properties: Record<string, { type: string }>; required?: string[] };
    expect(schema.properties["context"].type).toBe("string");
    expect(schema.required).toContain("context");
  });

  it("has prompt as required string", () => {
    const schema = tools["sd_compress"].inputSchema as { properties: Record<string, { type: string }>; required?: string[] };
    expect(schema.properties["prompt"].type).toBe("string");
    expect(schema.required).toContain("prompt");
  });

  it("has rate as optional (not in required array)", () => {
    const schema = tools["sd_compress"].inputSchema as { required?: string[] };
    expect(schema.required ?? []).not.toContain("rate");
  });
});

describe("sd_summarize schema", () => {
  it("has text as required string", () => {
    const schema = tools["sd_summarize"].inputSchema as { properties: Record<string, { type: string }>; required?: string[] };
    expect(schema.properties["text"].type).toBe("string");
    expect(schema.required).toContain("text");
  });

  it("has instructions as optional string", () => {
    const schema = tools["sd_summarize"].inputSchema as { properties: Record<string, unknown>; required?: string[] };
    expect(schema.properties["instructions"]).toBeDefined();
    expect(schema.required ?? []).not.toContain("instructions");
  });

  it("has max_tokens as optional integer", () => {
    const schema = tools["sd_summarize"].inputSchema as { properties: Record<string, unknown>; required?: string[] };
    expect(schema.properties["max_tokens"]).toBeDefined();
    expect(schema.required ?? []).not.toContain("max_tokens");
  });
});

describe("sd_classify schema", () => {
  it("has text as required string", () => {
    const schema = tools["sd_classify"].inputSchema as { properties: Record<string, { type: string }>; required?: string[] };
    expect(schema.properties["text"].type).toBe("string");
    expect(schema.required).toContain("text");
  });

  it("has labels as required array with name and rubric string items", () => {
    const schema = tools["sd_classify"].inputSchema as {
      properties: Record<string, { type: string; items?: { properties?: Record<string, { type: string }> } }>;
      required?: string[];
    };
    expect(schema.properties["labels"].type).toBe("array");
    expect(schema.required).toContain("labels");
    const itemProps = schema.properties["labels"].items?.properties;
    expect(itemProps?.["name"].type).toBe("string");
    expect(itemProps?.["rubric"].type).toBe("string");
  });
});

describe("sd_extract schema", () => {
  it("has text as required string", () => {
    const schema = tools["sd_extract"].inputSchema as { properties: Record<string, { type: string }>; required?: string[] };
    expect(schema.properties["text"].type).toBe("string");
    expect(schema.required).toContain("text");
  });

  it("has entities as object type", () => {
    const schema = tools["sd_extract"].inputSchema as { properties: Record<string, { type: string }>; required?: string[] };
    expect(schema.properties["entities"].type).toBe("object");
    expect(schema.required).toContain("entities");
  });

  it("has threshold and top_n as optional", () => {
    const schema = tools["sd_extract"].inputSchema as { properties: Record<string, unknown>; required?: string[] };
    expect(schema.properties["threshold"]).toBeDefined();
    expect(schema.properties["top_n"]).toBeDefined();
    expect(schema.required ?? []).not.toContain("threshold");
    expect(schema.required ?? []).not.toContain("top_n");
  });
});

describe("tool descriptions", () => {
  it("all 4 tools have descriptions mentioning Scaledown", () => {
    for (const toolName of ["sd_compress", "sd_summarize", "sd_classify", "sd_extract"]) {
      const tool = tools[toolName];
      expect(tool.description).toMatch(/scaledown/i);
    }
  });
});
