/**
 * Batched fetch helper to bypass Supabase / PostgREST's default 1000-row cap.
 *
 * Usage:
 *   const profiles = await fetchAllPaged((from, to) =>
 *     supabase.from('profiles').select('*').order('full_name').range(from, to)
 *   );
 *
 * The callback receives a `from` and `to` (inclusive) index and must perform a
 * `.range(from, to)` query. The loop stops as soon as a page returns fewer rows
 * than the page size (so the "exactly N * 1000 rows" boundary is handled
 * correctly — it will fetch one extra empty page only in that edge case).
 */
export async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Hard safety cap: 100 pages = 100k rows. Prevents accidental infinite loops.
  for (let i = 0; i < 100; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

/**
 * Paginated wrapper for SECURITY DEFINER RPC reads (POLICY §125).
 *
 * Why this exists:
 *   PostgREST on Lovable Cloud / Supabase enforces a hard server-side
 *   `db-max-rows = 1000` cap on RPC responses that returns
 *   `Content-Range: 0-999/<total>` with HTTP 206 — even when the client
 *   sends `Range: 0-49999`. A single `.range(0, 49999)` therefore SILENTLY
 *   truncates large reporting RPCs (e.g. `get_reviewer_roster_slim` for
 *   2,532 active employees returns only 1000).
 *
 * This helper loops `.rpc(name, params).range(from, from+999)` until a page
 * returns fewer rows than the page size. Use for any reporting RPC that
 * may exceed 1000 rows.
 *
 * @param rpcCall A factory that builds the RPC query for the requested page.
 *                Must call `.range(from, to)` on the returned builder.
 */
export async function fetchAllRpcPaged<T>(
  rpcCall: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  for (let i = 0; i < 100; i++) {
    const to = from + pageSize - 1;
    const { data, error } = await rpcCall(from, to);
    if (error) throw error;
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
