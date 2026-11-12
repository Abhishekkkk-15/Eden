/**
 * Mathematical vector utilities for semantic evaluation.
 */

export function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

export function magnitude(a: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * a[i];
  }
  return Math.sqrt(sum);
}

/**
 * Computes cosine similarity between two vector embeddings.
 * Output is in [-1, 1], normalized to [0, 1] for metric scoring.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) return 0;
  const raw = dotProduct(a, b) / (magA * magB);
  // Normalize [-1, 1] to [0, 1] range: (raw + 1) / 2
  return Math.max(0, Math.min(1, (raw + 1) / 2));
}
