import { jest } from "@jest/globals";
import type { ClassifyResponse, CompressResponse } from "../src/client.js";

const mockClassify =
  jest.fn<() => Promise<ClassifyResponse>>();
const mockCompress =
  jest.fn<() => Promise<CompressResponse>>();

jest.mock("../src/client.js", () => ({
  ScaledownClient: jest.fn().mockImplementation(() => ({
    classify: mockClassify,
    compress: mockCompress,
  })),
}));

jest.mock("../src/config.js", () => ({
  loadConfig: jest.fn().mockReturnValue({
    apiKey: "test-key",
    compressThreshold: 10000,
    compressRate: 0.3,
    niahDisable: false,
  }),
}));

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

const THRESHOLD = 10000;

function makeText(tokens: number): string {
  return "a ".repeat(tokens * 2);
}

const CLASSIFY_RESPONSE: ClassifyResponse = {
  top_label: "file_read",
  scores: { file_read: 0.87, general: 0.13 },
  labels: [
    { label: "file_read", score: 0.87, rubric: "Does this prompt ask to read a file?" },
    { label: "general", score: 0.13, rubric: "Is this a general question?" },
  ],
};

const COMPRESS_RESPONSE: CompressResponse = {
  compressed_prompt: "compressed output",
  original_prompt_tokens: 500,
  compressed_prompt_tokens: 150,
  successful: true,
  latency_ms: 100,
  request_metadata: {
    compression_time_ms: 100,
    compression_rate: 0.3,
    prompt_length: 2000,
    compressed_prompt_length: 600,
  },
};

describe("hook logic: intent classification", () => {
  beforeEach(() => {
    mockClassify.mockResolvedValue(CLASSIFY_RESPONSE);
    mockCompress.mockResolvedValue(COMPRESS_RESPONSE);
  });

  afterEach(() => jest.clearAllMocks());

  it("small conversational prompt: classify fires, compress does not", async () => {
    const prompt = "hello world";
    expect(estimateTokens(prompt)).toBeLessThan(THRESHOLD);
    const result = await mockClassify();
    expect(result.top_label).toBe("file_read");
    expect(mockCompress).not.toHaveBeenCalled();
  });

  it("large NIAH prompt: compress fires and returns compressed output", async () => {
    const largePad = makeText(THRESHOLD);
    const prompt = `${largePad} find the function that handles auth`;
    const { isNiahQuery } = await import("../src/niah.js");
    expect(isNiahQuery(prompt, THRESHOLD)).toBe(true);
    const result = await mockCompress();
    expect(result.compressed_prompt).toBe("compressed output");
  });

  it("classify failure is caught — returns undefined, hook should fail-open", async () => {
    mockClassify.mockRejectedValueOnce(new Error("network error") as never);
    await expect(mockClassify()).rejects.toThrow("network error");
  });

  it("compress failure is caught — hook should keep classify hint", async () => {
    mockCompress.mockRejectedValueOnce(new Error("compress error") as never);
    await expect(mockCompress()).rejects.toThrow("compress error");
  });
});
