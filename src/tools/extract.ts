import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ScaledownClient } from "../client.js";

export function registerExtractTool(
  server: McpServer,
  client: ScaledownClient
): void {
  server.tool(
    "sd_extract",
    "Extract named entities or structured data from text using Scaledown. You define entity types in plain English — the model finds matching spans with confidence scores and surrounding context. Use this for NER or structured output tasks.",
    {
      text: z.string().describe("The input text to extract entities from."),
      entities: z
        .record(
          z.string(),
          z.union([
            z.string().describe("Description of what to look for."),
            z.object({
              description: z.string(),
              threshold: z
                .number()
                .min(0)
                .max(1)
                .optional()
                .describe("Confidence threshold for this entity type (0–1)."),
              top_n: z
                .number()
                .int()
                .nonnegative()
                .optional()
                .describe(
                  "Max results for this entity type. 0 = all above threshold."
                ),
            }),
          ])
        )
        .describe(
          'Map of entity type name to description. Example: {"Name": "Full name of a person", "Email": "Email address"}'
        ),
      threshold: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Global confidence threshold (default: 0.5)."),
      top_n: z
        .number()
        .int()
        .nonnegative()
        .optional()
        .describe(
          "Global max results per entity type. 0 = all above threshold (default)."
        ),
    },
    async ({ text, entities, threshold, top_n }) => {
      const result = await client.extract(text, entities as import("../client.js").EntityMap, threshold, top_n);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ entities: result.entities }),
          },
        ],
      };
    }
  );
}
