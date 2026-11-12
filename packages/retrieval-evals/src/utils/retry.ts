export interface RetryOptions {
  /** Maximum number of retry attempts (default: 5) */
  maxRetries?: number;
  /** Initial delay before first retry in milliseconds (default: 2000) */
  initialDelayMs?: number;
  /** Multiplier for exponential backoff (default: 2) */
  backoffFactor?: number;
  /** Maximum ceiling delay cap in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Optional callback invoked before each retry wait */
  onRetry?: (error: unknown, attempt: number, waitMs: number) => void;
}

/**
 * Checks if an error corresponds to an HTTP 429 Rate Limit error across
 * OpenAI SDK, native fetch, Axios, and LangChain formats.
 */
export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as Record<string, any>;

  // Check HTTP status code properties
  if (err.status === 429 || err.statusCode === 429 || err.response?.status === 429) {
    return true;
  }

  // Check error code string
  if (err.code === "rate_limit_exceeded" || err.code === "429") {
    return true;
  }

  // Check error message text
  if (typeof err.message === "string") {
    const lower = err.message.toLowerCase();
    if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota exceeded")) {
      return true;
    }
  }

  return false;
}

/**
 * Extracts the Retry-After delay in milliseconds from response headers if present.
 */
export function getRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const err = error as Record<string, any>;
  const headers = err.response?.headers ?? err.headers;

  let headerVal: string | null = null;
  if (headers) {
    if (typeof headers.get === "function") {
      headerVal = headers.get("retry-after");
    } else if (typeof headers["retry-after"] === "string") {
      headerVal = headers["retry-after"];
    }
  }

  if (headerVal) {
    const parsed = Number(headerVal);
    if (!isNaN(parsed) && parsed > 0) {
      // Standard HTTP Retry-After is in seconds
      return parsed * 1000;
    }
  }

  return null;
}

/**
 * Executes an async operation with exponential backoff and jitter on HTTP 429 Rate Limit errors.
 */
export async function withRateLimitRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 5,
    initialDelayMs = 2000,
    backoffFactor = 2,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let delay = initialDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      const isRateLimit = isRateLimitError(error);

      if (!isRateLimit || attempt === maxRetries) {
        throw error;
      }

      // Check for Retry-After header
      const retryAfterMs = getRetryAfterMs(error);
      let waitTime = retryAfterMs ?? delay;

      // Add 0-200ms random jitter to avoid synchronized retry stampedes
      const jitter = Math.floor(Math.random() * 200);
      const totalWait = Math.min(waitTime + jitter, maxDelayMs);

      if (onRetry) {
        onRetry(error, attempt, totalWait);
      } else {
        console.warn(
          `[Rate Limit 429] Retrying in ${totalWait}ms (Attempt ${attempt}/${maxRetries})...`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, totalWait));

      // Compute next exponential delay
      delay = Math.min(delay * backoffFactor, maxDelayMs);
    }
  }

  throw new Error("Exceeded maximum retries for rate limit.");
}
