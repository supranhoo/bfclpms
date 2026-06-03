/**
 * Hub Platform — pure helpers to build sanitized would_deny metadata.
 *
 * Stored in `entitlement_audit.after` (jsonb). No schema change.
 * No I/O — fully unit-testable.
 */

export const SENSITIVE_QS_KEYS: readonly string[] = [
  'token',
  'access_token',
  'refresh_token',
  'code',
  'apikey',
  'api_key',
  'password',
  'secret',
  'id_token',
  'key',
  'signature',
];

/** Truncate to N characters (default 256). Returns input unchanged when short. */
export function truncate(s: string, max = 256): string {
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Strip sensitive query-string keys. If anything was redacted, returns
 * `"[redacted]"` (no partial leakage). Empty/missing input → empty string.
 */
export function sanitizeSearch(search: string | null | undefined): string {
  if (!search) return '';
  const raw = search.startsWith('?') ? search.slice(1) : search;
  if (!raw) return '';
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(raw);
  } catch {
    return '[redacted]';
  }
  let redacted = false;
  const denylist = new Set(SENSITIVE_QS_KEYS.map((k) => k.toLowerCase()));
  for (const key of Array.from(params.keys())) {
    if (denylist.has(key.toLowerCase())) {
      redacted = true;
      params.delete(key);
    }
  }
  if (redacted) return '[redacted]';
  const out = params.toString();
  return out ? `?${out}` : '';
}

export interface WouldDenyMetadataInput {
  actionKey: string;
  clientId: string | null;
  pathname: string | null | undefined;
  search: string | null | undefined;
  source?: string;
}

/**
 * Build the JSON blob stored in `entitlement_audit.after` for would_deny rows.
 * Pathname and search are truncated to 256 chars. `mode` is always `observe_only`.
 */
export function buildWouldDenyMetadata(input: WouldDenyMetadataInput): Record<string, unknown> {
  return {
    pathname: truncate(input.pathname ?? '', 256),
    search: truncate(sanitizeSearch(input.search), 256),
    source: input.source ?? 'CanAction',
    mode: 'observe_only',
    client_id: input.clientId,
    action_key: input.actionKey,
    captured_at: new Date().toISOString(),
  };
}