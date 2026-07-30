/**
 * ADR-202 / POLICY §IMPORT-ERROR-TRANSPARENCY
 *
 * `supabase.functions.invoke()` returns `data = null` and a generic
 * `FunctionsHttpError` ("Edge Function returned a non-2xx status code")
 * whenever the function replies with a non-2xx status. The real JSON body
 * lives unread on `error.context` (a `Response`).
 *
 * This helper reads that body so callers can surface the server's actual
 * message instead of the SDK placeholder.
 */

const SDK_PLACEHOLDER = /non-2xx status code/i;

function pickMessage(payload: unknown): string | null {
  if (!payload) return null;
  if (typeof payload === 'string') return payload.trim() || null;
  if (typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    for (const key of ['error', 'message', 'msg', 'details']) {
      const v = p[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
  }
  return null;
}

/**
 * Resolve the most informative error message available for a failed
 * `functions.invoke()` call.
 *
 * @param fnError error returned by the SDK
 * @param fnData  data returned by the SDK (usually null on failure)
 */
export async function extractFunctionError(fnError: unknown, fnData?: unknown): Promise<string> {
  // 1. Some SDK versions still populate `data` with the parsed body.
  const fromData = pickMessage(fnData);
  if (fromData) return fromData;

  // 2. Preferred path: read the raw Response stored on `error.context`.
  const context = (fnError as { context?: unknown } | null)?.context;
  if (context && typeof (context as Response).text === 'function') {
    try {
      const raw = await (context as Response).clone().text();
      if (raw) {
        try {
          const parsed = pickMessage(JSON.parse(raw));
          if (parsed) return parsed;
        } catch {
          /* not JSON — fall through to raw text */
        }
        if (raw.trim()) return raw.trim();
      }
    } catch {
      /* body already consumed or unreadable — fall through */
    }
  }

  // 3. Fall back to the SDK message (placeholder text included).
  const sdkMsg = (fnError as { message?: string } | null)?.message;
  if (sdkMsg && !SDK_PLACEHOLDER.test(sdkMsg)) return sdkMsg;
  return sdkMsg || 'Unknown error';
}
