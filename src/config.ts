import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { resolve } from "path";

export const CONFIG_FILE = resolve(homedir(), ".scaledown", "config.json");

export interface Config {
  apiKey: string;
  compressThreshold: number;
  compressRate: number | "auto";
  niahDisable: boolean;
  postToolDisable: boolean;
  postToolThreshold: number;
}

function readConfigFile(): { apiKey?: string } {
  try {
    if (existsSync(CONFIG_FILE)) {
      return JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    }
  } catch {
    // Malformed config file — ignore
  }
  return {};
}

export function loadConfig(): Config {
  const apiKey = process.env.SCALEDOWN_API_KEY ?? readConfigFile().apiKey;
  if (!apiKey) {
    throw new Error(
      "SCALEDOWN_API_KEY is not set.\n" +
        "Get your API key at https://scaledown.ai/dashboard, then run:\n" +
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

  const postToolDisable = process.env.SCALEDOWN_POST_TOOL_DISABLE === "true";

  const postToolThresholdRaw = process.env.SCALEDOWN_POST_TOOL_THRESHOLD;
  const postToolThreshold = postToolThresholdRaw
    ? parseInt(postToolThresholdRaw, 10)
    : 4000;

  return {
    apiKey,
    compressThreshold,
    compressRate,
    niahDisable,
    postToolDisable,
    postToolThreshold,
  };
}
