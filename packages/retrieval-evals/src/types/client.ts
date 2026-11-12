/**
 * Structural OpenAI-compatible AI client interfaces.
 * This ensures any client matching the OpenAI API surface (OpenAI SDK, Groq, NVIDIA NIM,
 * Azure OpenAI, Ollama, vLLM) can be supplied without forcing a specific client dependency.
 */

export interface EmbeddingCreateParams {
  model: string;
  input: string | string[];
  encoding_format?: "float" | "base64";
  [key: string]: unknown;
}

export interface EmbeddingData {
  embedding: number[];
  index?: number;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionCreateParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  response_format?: { type: "json_object" | "text" };
  [key: string]: unknown;
}

export interface ChatCompletionChoice {
  message?: {
    content?: string | null;
  };
}

export interface AIClient {
  embeddings: {
    create(params: EmbeddingCreateParams): Promise<{
      data: EmbeddingData[];
    }>;
  };
  chat?: {
    completions: {
      create(params: ChatCompletionCreateParams): Promise<{
        choices: ChatCompletionChoice[];
      }>;
    };
  };
}
