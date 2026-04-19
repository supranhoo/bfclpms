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
