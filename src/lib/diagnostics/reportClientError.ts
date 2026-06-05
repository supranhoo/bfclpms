import { supabase } from '@/integrations/supabase/client';
import { getLastRpc } from './lastRpc';

/**
 * Fire-and-forget client crash reporter. Inserts one row into
 * `public.client_error_reports`. Wrapped in try/catch so a failure
 * here can NEVER re-throw and re-trigger the ErrorBoundary.
 *
 * Logged fields are metadata only — no KPI values, scores, comments,
 * evidence, tokens, or form payloads. See ADR / plan for the auditor0003
 * iOS crash RCA.
 */
export interface ReportClientErrorInput {
  error: Error;
  componentStack?: string | null;
  timeSinceMountMs?: number | null;
}

function getViewport(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    const dpr = window.devicePixelRatio ?? 1;
    return `${window.innerWidth}x${window.innerHeight} @${dpr}`;
  } catch {
    return null;
  }
}

function getAppBuild(): string | null {
  try {
    // Prefer an explicit VITE_APP_BUILD if defined; otherwise null.
    const meta = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return meta?.VITE_APP_BUILD ?? null;
  } catch {
    return null;
  }
}

export function reportClientError(input: ReportClientErrorInput): void {
  try {
    const { error, componentStack, timeSinceMountMs } = input;
    const { name: lastRpcName, status: lastRpcStatus } = getLastRpc();

    // Fire-and-forget. Resolve identity from the current session asynchronously.
    void (async () => {
      try {
        let userId: string | null = null;
        let accountCode: string | null = null;
        let effectiveRole: string | null = null;
        try {
          const { data } = await supabase.auth.getUser();
          userId = data?.user?.id ?? null;
          // email local-part is the closest non-PII account identifier
          const email = data?.user?.email ?? '';
          if (email) accountCode = email.split('@')[0] ?? null;
        } catch {
          // ignore — anonymous report is acceptable
        }
        try {
          if (typeof localStorage !== 'undefined') {
            effectiveRole = localStorage.getItem('effective_role_override') ?? null;
          }
        } catch {
          // ignore
        }

        const payload = {
          user_id: userId,
          account_code: accountCode,
          effective_role: effectiveRole,
          route: typeof window !== 'undefined' ? window.location.pathname : null,
          query: typeof window !== 'undefined' ? window.location.search : null,
          error_message: (error?.message ?? String(error)).slice(0, 2000),
          error_stack: (error?.stack ?? '').slice(0, 8000) || null,
          component_stack: (componentStack ?? '').slice(0, 8000) || null,
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          viewport: getViewport(),
          app_build: getAppBuild(),
          last_rpc_name: lastRpcName,
          last_rpc_status: lastRpcStatus,
          time_since_mount_ms:
            typeof timeSinceMountMs === 'number' && Number.isFinite(timeSinceMountMs)
              ? Math.max(0, Math.round(timeSinceMountMs))
              : null,
        };

        await supabase.from('client_error_reports').insert(payload);
      } catch {
        // swallow — diagnostics must never break the app
      }
    })();
  } catch {
    // outer guard — must never throw
  }
}