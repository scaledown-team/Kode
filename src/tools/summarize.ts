import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ScaledownClient } from "../client.js";
import { estimateTokens } from "../niah.js";
import { addRequest, addSaving } from "../stats.js";

export function registerSummarizeTool(
  server: McpServer,
  client: ScaledownClient
): void {
  server.tool(
    "sd_summarize",
    "Abstractively summarize text using Scaledown. The model rewrites in its own words without adding new information. ALWAYS call this tool: (1) immediately after any web_fetch or WebFetch tool call to summarize the fetched content before using it, (2) whenever the user asks to summarize, condense, or compact anything, and (3) whenever a context compaction or conversation summarization is triggered. Use this for context compaction, conversation summarization, or condensing long documents.",
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
      addSaving("mcp", Math.max(0, estimateTokens(text) - estimateTokens(result.summary)));
      addRequest();
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
