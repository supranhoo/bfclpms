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
  const query = useQuery({
    queryKey: ['hub-entitlement-snapshot'],
    queryFn: fetchSnapshot,
    staleTime: 5 * 60 * 1000,
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
 * Best-effort observe-mode logger. Inserts a `would_deny` row in
 * `entitlement_audit` without throwing. Safe to call from render paths.
 */
export async function logWouldDeny(actionKey: string, reason?: string) {
  try {
    const { data: userData } = await supabase.auth.getUser();
    await supabase.from('entitlement_audit').insert({
      actor_id: userData?.user?.id ?? null,
      event_type: 'would_deny',
      entity_type: 'action',
      entity_key: actionKey,
      reason: reason ?? null,
    });
  } catch {
    /* observe-only: never throw from a guard */
  }
}