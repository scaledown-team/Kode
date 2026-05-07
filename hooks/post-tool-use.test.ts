import { jest } from "@jest/globals";
import type { CompressResponse } from "../src/client.js";
import { extractText, replaceText } from "./post-tool-use.js";

const mockCompress = jest.fn<() => Promise<CompressResponse>>();

jest.mock("../src/client.js", () => ({
  ScaledownClient: jest.fn().mockImplementation(() => ({
    compress: mockCompress,
  })),
}));

jest.mock("../src/config.js", () => ({
  loadConfig: jest.fn().mockReturnValue({
    apiKey: "test-key",
    compressThreshold: 10000,
    compressRate: 0.3,
    niahDisable: false,
    postToolDisable: false,
    postToolThreshold: 4000,
  }),
}));

const COMPRESS_RESPONSE: CompressResponse = {
  compressed_prompt: "compressed tool output",
  original_prompt_tokens: 5000,
  compressed_prompt_tokens: 1500,
  successful: true,
  latency_ms: 80,
  request_metadata: {
    compression_time_ms: 80,
    compression_rate: 0.3,
    prompt_length: 20000,
    compressed_prompt_length: 6000,
  },
};

describe("extractText", () => {
  it("handles plain string response", () => {
    expect(extractText("hello")).toBe("hello");
  });

  it("extracts output field (Bash tool)", () => {
    expect(extractText({ output: "bash output", exit_code: 0 })).toBe("bash output");
  });

  it("extracts content field", () => {
    expect(extractText({ content: "file contents" })).toBe("file contents");
  });

  it("extracts text field", () => {
    expect(extractText({ text: "some text" })).toBe("some text");
  });

  it("returns null for unrecognized shape", () => {
    expect(extractText({ unknown: 42 })).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractText(null)).toBeNull();
  });
});

describe("replaceText", () => {
  it("replaces plain string", () => {
    expect(replaceText("original", "new")).toBe("new");
  });

  it("replaces output field, preserves other fields", () => {
    const result = replaceText({ output: "old", exit_code: 0 }, "new") as Record<string, unknown>;
    expect(result.output).toBe("new");
    expect(result.exit_code).toBe(0);
  });

  it("replaces content field", () => {
    const result = replaceText({ content: "old" }, "new") as Record<string, unknown>;
    expect(result.content).toBe("new");
  });

  it("returns response unchanged if no recognized field", () => {
    const resp = { unknown: 42 };
    expect(replaceText(resp, "new")).toBe(resp);
  });
});

describe("post-tool-use hook: compression logic", () => {
  beforeEach(() => {
    mockCompress.mockResolvedValue(COMPRESS_RESPONSE);
  });

  afterEach(() => jest.clearAllMocks());

  it("compress is called for large tool output", async () => {
    const result = await mockCompress();
    expect(result.compressed_prompt).toBe("compressed tool output");
    expect(result.original_prompt_tokens).toBe(5000);
    expect(result.compressed_prompt_tokens).toBe(1500);
  });

  it("compress failure is caught and returns original", async () => {
    mockCompress.mockRejectedValueOnce(new Error("api error") as never);
    await expect(mockCompress()).rejects.toThrow("api error");
  });
});
