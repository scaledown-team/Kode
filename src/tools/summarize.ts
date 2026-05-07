import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ScaledownClient } from "../client.js";

export function registerSummarizeTool(
  server: McpServer,
  client: ScaledownClient
): void {
  server.tool(
    "sd_summarize",
    "Abstractively summarize text using Scaledown. The model rewrites in its own words without adding new information. Use this for context compaction, conversation summarization, or condensing long documents.",
    {
      text: z.string().describe("The text to summarize."),
      instructions: z
        .string()
        .optional()
        .describe(
          'Optional rules appended to base instructions. Examples: "Use bullet points.", "Focus on dates only.", "Limit to 3 sentences."'
        ),
      max_tokens: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum tokens in the generated summary (default: 20048)."),
    },
    async ({ text, instructions, max_tokens }) => {
      const result = await client.summarize(text, instructions, max_tokens);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              summary: result.summary,
              input_chars: result.input_chars,
              output_chars: result.output_chars,
            }),
          },
        ],
      };
    }
  );
}
