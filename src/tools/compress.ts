import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ScaledownClient } from "../client.js";
import { Config } from "../config.js";

export function registerCompressTool(
  server: McpServer,
  client: ScaledownClient,
  config: Config
): void {
  server.tool(
    "sd_compress",
    "Compress a large context and prompt using Scaledown, reducing token count by ~50-70% while preserving semantic meaning. Use this before NIAH (needle-in-a-haystack) queries where you need to search a large body of text.",
    {
      context: z
        .string()
        .describe(
          "Background information or supporting text to compress. This is compressed most aggressively."
        ),
      prompt: z
        .string()
        .describe("The main query or question. Kept intact where possible."),
      rate: z
        .union([z.number().min(0.3).max(1.0), z.literal("auto")])
        .optional()
        .describe(
          'Compression rate: "auto" (recommended) or a number 0.3–1.0. Lower = more aggressive.'
        ),
    },
    async ({ context, prompt, rate }) => {
      const result = await client.compress(
        context,
        prompt,
        rate ?? config.compressRate
      );
      const saved = result.original_prompt_tokens - result.compressed_prompt_tokens;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              compressed_prompt: result.compressed_prompt,
              original_prompt_tokens: result.original_prompt_tokens,
              compressed_prompt_tokens: result.compressed_prompt_tokens,
              tokens_saved: saved,
            }),
          },
        ],
      };
    }
  );
}
