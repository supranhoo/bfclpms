/**
 * Shared retry utility for edge functions.
 * Wraps an async operation with exponential backoff.
 */
export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  /** Optional dedup key — if provided, callers should check externally before invoking */
  dedupKey?: string;
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 1000 } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      
      // Don't retry on client errors (4xx) — only on transient/server errors
      if (lastError.message.includes('400') || 
          lastError.message.includes('401') || 
          lastError.message.includes('403') ||
          lastError.message.includes('404') ||
          lastError.message.includes('422')) {
        throw lastError;
      }

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.warn(`[retry] Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
