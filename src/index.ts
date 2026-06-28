#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ScaledownClient } from "./client.js";
import { loadConfig } from "./config.js";
import { registerCompressTool } from "./tools/compress.js";
import { registerSummarizeTool } from "./tools/summarize.js";
import { registerClassifyTool } from "./tools/classify.js";
import { registerExtractTool } from "./tools/extract.js";
import { registerRetrieveTool } from "./tools/retrieve.js";

const config = loadConfig();
const client = new ScaledownClient(config.apiKey);

const server = new McpServer({
  name: "dietcode",
  version: "0.5.0",
});

registerCompressTool(server, client, config);
registerSummarizeTool(server, client);
registerClassifyTool(server, client);
registerExtractTool(server, client);
registerRetrieveTool(server);

const transport = new StdioServerTransport();
await server.connect(transport);
