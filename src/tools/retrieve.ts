import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getOriginal } from "../proxy/store.js";

export function registerRetrieveTool(server: McpServer): void {
  server.tool(
    "sd_retrieve",
    "Retrieve the full original text that DietCode's proxy compressed into a " +
      "summary. When you see a marker like [Earlier conversation — ScaleDown " +
      'summary. Call sd_retrieve("<id>") ...], call this with that id to get the ' +
      "verbatim earlier transcript or tool output if you need an exact detail " +
      "(a precise error string, full file contents, etc.) that the summary omitted.",
    {
      id: z
        .string()
        .describe('The retrieval id from a ScaleDown summary marker, e.g. "a1b2c3d4e5f6a7b8".'),
    },
    async ({ id }) => {
      const original = getOriginal(id);
      if (original === null) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                found: false,
                message: `No stored content for id "${id}". It may have expired or never existed.`,
              }),
            },
          ],
        };
      }
      return {
        content: [{ type: "text", text: original }],
      };
    }
  );
}
