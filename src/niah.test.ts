import { isNiahQuery, estimateTokens } from "./niah.js";

const THRESHOLD = 10000;

function makeText(tokens: number): string {
  // Each char ≈ 0.25 tokens, so tokens * 4 chars ≈ target token count
  return "a ".repeat(tokens * 2); // "a " = 2 chars = 0.5 tokens each
}

describe("estimateTokens", () => {
  it("estimates chars/4", () => {
    expect(estimateTokens("aaaa")).toBe(1);
    expect(estimateTokens("a".repeat(40000))).toBe(10000);
  });
});

describe("isNiahQuery", () => {
  it("returns false when prompt is under threshold", () => {
    expect(isNiahQuery("find the function", THRESHOLD)).toBe(false);
  });

  it("returns false for large conversational prompts", () => {
    const large = makeText(THRESHOLD) + " how are you?";
    expect(isNiahQuery(large, THRESHOLD)).toBe(false);
  });

  it("returns true for large retrieval prompts", () => {
    const large = makeText(THRESHOLD) + " find the function that handles auth";
    expect(isNiahQuery(large, THRESHOLD)).toBe(true);
  });

  it("matches various retrieval keywords", () => {
    const pad = makeText(THRESHOLD);
    for (const kw of ["find", "search", "locate", "where", "look for", "show me", "what is"]) {
      expect(isNiahQuery(`${pad} ${kw} something`, THRESHOLD)).toBe(true);
    }
  });

  it("is case-insensitive", () => {
    const large = makeText(THRESHOLD) + " FIND the bug";
    expect(isNiahQuery(large, THRESHOLD)).toBe(true);
  });
});
