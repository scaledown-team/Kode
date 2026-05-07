const BASE_URL = "https://api.scaledown.xyz";

export class ScaledownError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string
  ) {
    super(message);
    this.name = "ScaledownError";
  }
}

export interface CompressResponse {
  compressed_prompt: string;
  original_prompt_tokens: number;
  compressed_prompt_tokens: number;
  successful: boolean;
  latency_ms: number;
  request_metadata: {
    compression_time_ms: number;
    compression_rate: string | number;
    prompt_length: number;
    compressed_prompt_length: number;
  };
}

export interface SummarizeResponse {
  summary: string;
  input_chars: number;
  output_chars: number;
  latency_ms: number;
}

export interface Label {
  name: string;
  rubric: string;
}

export interface ClassifyResponseLabel {
  label: string;
  score: number;
  rubric: string;
}

export interface ClassifyResponse {
  top_label: string;
  scores: Record<string, number>;
  labels: ClassifyResponseLabel[];
}

export interface EntityDefinition {
  description: string;
  threshold?: number;
  top_n?: number;
}

export type EntityMap = Record<string, string | EntityDefinition>;

export interface ExtractedEntity {
  text: string;
  type: string;
  confidence: number;
  start: number;
  end: number;
  context: string;
}

export interface ExtractResponse {
  entities: ExtractedEntity[];
}

export class ScaledownClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(apiKey: string, baseUrl: string = BASE_URL) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ScaledownError(
        `Scaledown API error ${res.status}: ${res.statusText}`,
        res.status,
        text
      );
    }

    return res.json() as Promise<T>;
  }

  async compress(
    context: string,
    prompt: string,
    rate: number | "auto" = "auto"
  ): Promise<CompressResponse> {
    return this.post<CompressResponse>("/compress/raw/", {
      context,
      prompt,
      scaledown: { rate },
    });
  }

  async summarize(
    text: string,
    instructions?: string,
    maxTokens?: number
  ): Promise<SummarizeResponse> {
    return this.post<SummarizeResponse>("/summarization/abstractive", {
      text,
      ...(instructions !== undefined && { instructions }),
      ...(maxTokens !== undefined && { max_tokens: maxTokens }),
    });
  }

  async classify(text: string, labels: Label[]): Promise<ClassifyResponse> {
    return this.post<ClassifyResponse>("/classify", { text, labels });
  }

  async extract(
    text: string,
    entities: EntityMap,
    threshold?: number,
    topN?: number
  ): Promise<ExtractResponse> {
    return this.post<ExtractResponse>("/extract", {
      text,
      entities,
      ...(threshold !== undefined && { threshold }),
      ...(topN !== undefined && { top_n: topN }),
    });
  }
}
