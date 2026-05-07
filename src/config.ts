export interface Config {
  apiKey: string;
  compressThreshold: number;
  compressRate: number | "auto";
  niahDisable: boolean;
}

export function loadConfig(): Config {
  const apiKey = process.env.SCALEDOWN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "SCALEDOWN_API_KEY is not set.\n" +
        "Get your API key at https://scaledown.ai/api-keys, then run:\n" +
        "  scaledown-claude setup\n" +
        "or set the environment variable manually."
    );
  }

  const thresholdRaw = process.env.SCALEDOWN_COMPRESS_THRESHOLD;
  const compressThreshold = thresholdRaw ? parseInt(thresholdRaw, 10) : 10000;

  const rateRaw = process.env.SCALEDOWN_COMPRESS_RATE ?? "0.3";
  const compressRate: number | "auto" =
    rateRaw === "auto" ? "auto" : parseFloat(rateRaw);

  const niahDisable = process.env.SCALEDOWN_NIAH_DISABLE === "true";

  return { apiKey, compressThreshold, compressRate, niahDisable };
}
