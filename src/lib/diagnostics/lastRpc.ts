/**
 * Tiny in-memory ring buffer (size 1) that records the most recent
 * Supabase RPC / edge-function call name + HTTP-ish status. Read by the
 * client-error reporter so a captured crash can be correlated with the
 * last network round-trip. Opt-in: only the few shared service wrappers
 * we own call `setLastRpc`. No PII / payload is stored.
 *
 * Diagnostic only — remove together with `client_error_reports` once the
 * auditor0003 iOS crash RCA is closed.
 */
let lastRpcName: string | null = null;
let lastRpcStatus: number | null = null;

export function setLastRpc(name: string, status?: number | null): void {
  lastRpcName = name ?? null;
  lastRpcStatus = typeof status === 'number' ? status : null;
}

export function getLastRpc(): { name: string | null; status: number | null } {
  return { name: lastRpcName, status: lastRpcStatus };
}