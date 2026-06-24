import OpenAI, { toFile } from "openai";

let clientInstance: OpenAI | null = null;

function getClient() {
  if (clientInstance) return clientInstance;

  const apiKey = process.env.AI_INTEGRATIONS_GROQ_API_KEY;
  const baseURL = "https://api.groq.com/openai/v1";

  if (!apiKey || apiKey === "gsk_your_key_here") {
    throw new Error("AI_INTEGRATIONS_GROQ_API_KEY is not set or is still the placeholder.");
  }

  clientInstance = new OpenAI({
    apiKey,
    baseURL,
  });
  return clientInstance;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  filename: string = "audio.wav",
): Promise<{ text: string; model: string }> {
  const client = getClient();
  const file = await toFile(audioBuffer, filename);
  
  const response = await client.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
  });

  return {
    text: response.text,
    model: "groq/whisper-large-v3",
  };
}
