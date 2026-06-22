/**
 * Hub Platform — entitlement resolver (Phase 1, observe-only).
 *
 * Gated by `system_settings.hub_platform_settings_enabled` (default `"false"`).
 * When the flag is OFF (default), every check returns `true` → ZERO change
 * to existing PMS behavior.
 *
 * When the flag is ON, returns the resolved entitlement based on the
 * `default` client row + `client_module_entitlements` / `client_action_entitlements`.
 * Unknown keys → deny. Disabled rows → deny.
 *
 * Nothing in PMS is wired to this hook yet. It exists so Phase 5+ can
 * enforce entitlements without further plumbing.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const DEFAULT_CLIENT_KEY = 'default';

export interface EntitlementSnapshot {
  enabled: boolean;
  clientId: string | null;
  modules: Set<string>;
  actions: Set<string>;
}

async function fetchSnapshot(): Promise<EntitlementSnapshot> {
  const { data: flagRow } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'hub_platform_settings_enabled')
    .maybeSingle();

  const raw = flagRow?.setting_value;
  const enabled = raw === true || raw === 'true' || raw === '"true"';

  if (!enabled) {
    return { enabled: false, clientId: null, modules: new Set(), actions: new Set() };
  }

  const { data: clientRow } = await supabase
    .from('clients')
    .select('id')
    .eq('client_key', DEFAULT_CLIENT_KEY)
    .maybeSingle();

  const clientId = clientRow?.id ?? null;
  if (!clientId) {
    return { enabled: true, clientId: null, modules: new Set(), actions: new Set() };
  }

  const [{ data: mods }, { data: acts }] = await Promise.all([
    supabase
      .from('client_module_entitlements')
      .select('module_key, is_enabled')
      .eq('client_id', clientId),
    supabase
      .from('client_action_entitlements')
      .select('action_key, is_enabled')
      .eq('client_id', clientId),
  ]);

  const modules = new Set<string>(
    (mods ?? []).filter((m) => m.is_enabled).map((m) => m.module_key),
  );
  const actions = new Set<string>(
    (acts ?? []).filter((a) => a.is_enabled).map((a) => a.action_key),
  );

  return { enabled: true, clientId, modules, actions };
}

/** Pure resolver — testable without Supabase. */
export function resolveModule(snap: EntitlementSnapshot, moduleKey: string): boolean {
  if (!snap.enabled) return true;
  return snap.modules.has(moduleKey);
}

export function resolveAction(snap: EntitlementSnapshot, actionKey: string): boolean {
  if (!snap.enabled) return true;
  return snap.actions.has(actionKey);
}

export function useEntitlement() {
  const { isReady } = useAuth();
  const query = useQuery({
    queryKey: ['hub-entitlement-snapshot'],
    queryFn: fetchSnapshot,
    staleTime: 5 * 60 * 1000,
    // v2.66.11.15 — pre-auth guard. system_settings RLS calls has_role()
    // which the `anon` role cannot execute, so a request fired before the
    // JWT lands returns 'permission denied for function has_role' and
    // poisons downstream queries (Sajid Raza Team Reviews regression).
    enabled: isReady,
  });

  const snap: EntitlementSnapshot =
    query.data ?? { enabled: false, clientId: null, modules: new Set(), actions: new Set() };

  return {
    loading: query.isLoading,
    /** Master switch — when false, all checks return true (observe-off mode). */
    hubEnabled: snap.enabled,
    isModuleEntitled: (moduleKey: string) => resolveModule(snap, moduleKey),
    isActionEntitled: (actionKey: string) => resolveAction(snap, actionKey),
    snapshot: snap,
  };
}

/**
 * Phase 3 pilot flag. Read from `system_settings.hub_enforcement_pilot_enabled`.
 * When false (default), enforcement is OFF for every action — instant rollback.
 */
async function fetchPilotFlag(): Promise<boolean> {
  const { data } = await supabase
    .from('system_settings')
    .select('setting_value')
    .eq('setting_key', 'hub_enforcement_pilot_enabled')
    .maybeSingle();
  const raw = data?.setting_value;
  return raw === true || raw === 'true' || raw === '"true"';
}

export function useEnforcementPilot() {
  const { isReady } = useAuth();
  const query = useQuery({
    queryKey: ['hub-enforcement-pilot'],
    queryFn: fetchPilotFlag,
    staleTime: 10 * 60 * 1000,
    // v2.66.11.15 — pre-auth guard, see useEntitlement above.
    enabled: isReady,
  });
  return {
    loading: query.isLoading,
    pilotEnabled: query.data ?? false,
  };
}

/**
 * Best-effort observe-mode logger. Inserts a `would_deny` row in
 * `entitlement_audit` without throwing. Safe to call from render paths.
 *
 * `metadata` (when supplied) is written to the `after` JSONB column —
 * intended for route/page context. Old callers that omit it keep working.
 */
export async function logWouldDeny(
  actionKey: string,
  reason?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const row: Record<string, unknown> = {
      actor_id: userData?.user?.id ?? null,
      event_type: 'would_deny',
      entity_type: 'action',
      entity_key: actionKey,
      reason: reason ?? null,
    };
    if (metadata) row.after = metadata;
    await supabase.from('entitlement_audit').insert(row as never);
  } catch {
    /* observe-only: never throw from a guard */
  }
}

/**
 * Phase 3 enforcement logger — mirrors `logWouldDeny` but writes
 * `event_type='deny'` so platform_owner can distinguish observed-vs-blocked.
 * Best-effort; never throws.
 */
export async function logDeny(
  actionKey: string,
  reason?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const row: Record<string, unknown> = {
      actor_id: userData?.user?.id ?? null,
      event_type: 'deny',
      entity_type: 'action',
      entity_key: actionKey,
      reason: reason ?? null,
    };
    if (metadata) row.after = metadata;
    await supabase.from('entitlement_audit').insert(row as never);
  } catch {
    /* enforcement should never throw — UI is already blocked */
  }
}