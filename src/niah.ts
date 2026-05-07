const RETRIEVAL_PATTERN =
  /\b(find|search|locate|where|which file|look for|show me|what does .+ do|how does .+ work|what is)\b/i;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function isNiahQuery(prompt: string, threshold: number): boolean {
  if (estimateTokens(prompt) < threshold) return false;
  return RETRIEVAL_PATTERN.test(prompt);
}
