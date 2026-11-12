import type {
  AIClient,
  EmbeddingCreateParams,
  EmbeddingData,
  ChatCompletionCreateParams,
  ChatCompletionChoice,
} from "../types/client.js";
import { withRateLimitRetry, type RetryOptions } from "../utils/retry.js";

export interface CreateAIClientOptions {
  /** API key (defaults to process.env.OPENAI_API_KEY if available) */
  apiKey?: string;
  /** Custom base URL (e.g. Groq, NVIDIA NIM, Ollama, Azure, vLLM). Defaults to "https://api.openai.com/v1" */
  baseURL?: string;
  /** Optional custom headers to send with each request */
  defaultHeaders?: Record<string, string>;
  /** Optional rate-limit retry options (exponential backoff & jitter on 429) */
  retryOptions?: RetryOptions;
}

/**
 * Creates a zero-dependency OpenAI-compatible AIClient using native Node fetch.
 * Compatible with OpenAI, Groq, NVIDIA NIM, Ollama, vLLM, Together, Mistral, and Azure OpenAI.
 * Automatically handles 429 rate limits with exponential backoff and jitter.
 */
export function createAIClient(options?: CreateAIClientOptions): AIClient {
  const baseURL = (options?.baseURL ?? "https://api.openai.com/v1").replace(/\/+$/, "");
  const apiKey = options?.apiKey ?? (typeof process !== "undefined" ? process.env?.OPENAI_API_KEY : undefined);
  const retryOpts = options?.retryOptions;

  const getHeaders = () => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...options?.defaultHeaders,
    };
    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    return headers;
  };

  return {
    embeddings: {
      async create(params: EmbeddingCreateParams): Promise<{ data: EmbeddingData[] }> {
        return withRateLimitRetry(async () => {
          const res = await fetch(`${baseURL}/embeddings`, {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify(params),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            const err: any = new Error(`Embeddings API error (${res.status} ${res.statusText}): ${errText}`);
            err.status = res.status;
            err.statusCode = res.status;
            err.headers = res.headers;
            throw err;
          }
          const json = (await res.json()) as { data: EmbeddingData[] };
          return { data: json.data };
        }, retryOpts);
      },
    },
    chat: {
      completions: {
        async create(params: ChatCompletionCreateParams): Promise<{ choices: ChatCompletionChoice[] }> {
          return withRateLimitRetry(async () => {
            const res = await fetch(`${baseURL}/chat/completions`, {
              method: "POST",
              headers: getHeaders(),
              body: JSON.stringify(params),
            });
            if (!res.ok) {
              const errText = await res.text().catch(() => "");
              const err: any = new Error(`Chat Completions API error (${res.status} ${res.statusText}): ${errText}`);
              err.status = res.status;
              err.statusCode = res.status;
              err.headers = res.headers;
              throw err;
            }
            const json = (await res.json()) as { choices: ChatCompletionChoice[] };
            return { choices: json.choices };
          }, retryOpts);
        },
      },
    },
  };
}
