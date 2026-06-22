/**
 * v2.66.11.15 — temporary diagnostic. Logs a stack trace whenever a
 * `.in('id', arr)` call passes the literal strings "null" / "undefined"
 * inside `arr`. Sajid Raza's Team Reviews dashboard still surfaces
 * `invalid input syntax for type uuid: "null"` post-fix; we need to
 * pin the exact call site before patching it.
 *
 * Active only in dev (`import.meta.env.DEV`) and removed in the
 * follow-up commit that ships the targeted fix.
 */
import { supabase } from '@/integrations/supabase/client';

let installed = false;

export function installUuidNullTrace() {
  if (installed) return;
  if (!import.meta.env.DEV) return;
  installed = true;

  const origFrom = supabase.from.bind(supabase);
  (supabase as any).from = (table: string) => {
    const qb: any = origFrom(table as any);
    const origIn = qb.in?.bind(qb);
    if (typeof origIn === 'function') {
      qb.in = (column: string, values: unknown[]) => {
        try {
          if (
            Array.isArray(values) &&
            values.some((v) => v === 'null' || v === 'undefined' || v == null)
          ) {
            // eslint-disable-next-line no-console
            console.error(
              `[uuid-null-trace] from('${table}').in('${column}', [...])`,
              { values },
              new Error('uuid-null-trace stack').stack,
            );
          }
        } catch {
          // never let the trace itself break a query
        }
        return origIn(column, values);
      };
    }
    return qb;
  };
}