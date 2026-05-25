/**
 * Tiny serialization helpers for Bulk Review filter persistence in URL
 * query params. We keep this dependency-free and pure so it's easy to test
 * — the React-side wiring just reads from `window.location.search` on
 * mount and writes back with `history.replaceState` on change.
 *
 * Empty arrays are intentionally encoded as no param (so the URL stays
 * clean when the user resets). Values are URI-component-encoded so KRA
 * names containing `,` or `&` round-trip correctly.
 */

export function encodeCsv(values: ReadonlyArray<string>): string | null {
  if (!values || values.length === 0) return null;
  return values.map(v => encodeURIComponent(v)).join(',');
}

export function decodeCsv(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').filter(Boolean).map(v => {
    try { return decodeURIComponent(v); } catch { return v; }
  });
}

export function readUrlArrays(
  searchString: string,
  keys: ReadonlyArray<string>,
): Record<string, string[]> {
  const params = new URLSearchParams(searchString);
  const out: Record<string, string[]> = {};
  for (const k of keys) out[k] = decodeCsv(params.get(k));
  return out;
}

export function writeUrlArrays(
  searchString: string,
  updates: Record<string, ReadonlyArray<string>>,
): string {
  const params = new URLSearchParams(searchString);
  for (const [k, v] of Object.entries(updates)) {
    const enc = encodeCsv(v);
    if (enc === null) params.delete(k);
    else params.set(k, enc);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}