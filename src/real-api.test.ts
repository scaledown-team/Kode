/**
 * Real API smoke tests — only run during release (test:real script).
 * Requires SCALEDOWN_API_KEY environment variable.
 * Tests actual API endpoint responses with minimal payloads.
 */

import { ScaledownClient } from "./client.js";

const API_KEY = process.env.SCALEDOWN_API_KEY;

beforeAll(() => {
  if (!API_KEY) {
    throw new Error(
      "SCALEDOWN_API_KEY environment variable is required for real API tests.\n" +
        "These tests are intended to run only during release validation."
    );
  }
});

const getClient = () => new ScaledownClient(API_KEY!);

describe("compress (real API)", () => {
  it("returns a valid CompressResponse shape", async () => {
    const client = getClient();
    const result = await client.compress(
      "This is a background context document for testing.",
      "What is the main topic?"
    );
    expect(typeof result.compressed_prompt).toBe("string");
    expect(typeof result.original_prompt_tokens).toBe("number");
    expect(typeof result.compressed_prompt_tokens).toBe("number");
    expect(typeof result.successful).toBe("boolean");
    expect(result.request_metadata).toBeDefined();
  }, 15000);
});

describe("summarize (real API)", () => {
  it("returns a valid SummarizeResponse shape", async () => {
    const client = getClient();
    const result = await client.summarize(
      "The quick brown fox jumps over the lazy dog. This sentence is a classic pangram used in typography.",
      "One sentence only."
    );
    expect(typeof result.summary).toBe("string");
    expect(result.summary.length).toBeGreaterThan(0);
    expect(typeof result.input_chars).toBe("number");
    expect(typeof result.output_chars).toBe("number");
  }, 15000);
});

describe("classify (real API)", () => {
  it("returns a valid ClassifyResponse shape", async () => {
    const client = getClient();
    const result = await client.classify("Please read the file package.json", [
      { name: "file_read", rubric: "Does this request involve reading a file?" },
      { name: "other", rubric: "Does this request describe something else entirely?" },
    ]);
    expect(typeof result.top_label).toBe("string");
    expect(["file_read", "other"]).toContain(result.top_label);
    expect(typeof result.scores).toBe("object");
    expect(Array.isArray(result.labels)).toBe(true);
  }, 15000);
});

describe("extract (real API)", () => {
  it("returns a valid ExtractResponse shape", async () => {
    const client = getClient();
    const result = await client.extract(
      "Alice Smith works at Acme Corp. Contact her at alice@acme.com.",
      { Name: "Full name of a person", Email: "Email address" }
    );
    expect(Array.isArray(result.entities)).toBe(true);
    if (result.entities.length > 0) {
      const entity = result.entities[0];
      expect(typeof entity.text).toBe("string");
      expect(typeof entity.type).toBe("string");
      expect(typeof entity.confidence).toBe("number");
    }
  }, 15000);
});
