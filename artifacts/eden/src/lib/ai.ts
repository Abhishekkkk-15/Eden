import { API_BASE_URL } from "@/config";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/**
 * Stream chat completion from the AI
 */
export async function* streamChat(messages: ChatMessage[]): AsyncGenerator<string> {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_BASE_URL}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`Failed to stream chat: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("No response body");
  }

  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      yield chunk;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-streaming chat completion
 */
export async function completeChat(messages: ChatMessage[]): Promise<string> {
  const token = localStorage.getItem("token");

  const response = await fetch(`${API_BASE_URL}/chat/complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });

  if (!response.ok) {
    throw new Error(`Failed to complete chat: ${response.status}`);
  }

  const data = await response.json();
  return data.content;
}
