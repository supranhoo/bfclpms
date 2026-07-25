/**
 * Pure resolver for the Team Annual Review "My role" scope chips.
 *
 * Admins can pick a default chip and restrict which chips render, either
 * globally or per detected role. Individual users can pin their own default
 * (stored on `profiles.team_queue_default_scope`) when the admin allows it.
 *
 * Kept free of React/Supabase so the precedence rules can be unit-tested
 * in isolation.
 */

export type TeamQueueScope =
  | 'any' | 'manager' | 'skip' | 'dept' | 'bu' | 'hr' | 'management';

export const TEAM_QUEUE_SCOPES: TeamQueueScope[] = [
  'any', 'manager', 'skip', 'dept', 'bu', 'hr', 'management',
];

export interface TeamQueueScopeAppSettings {
  team_queue_default_scope?: string | null;
  team_queue_allowed_scopes?: unknown; // jsonb: string[] | null
  team_queue_role_overrides?: unknown; // jsonb: { [role]: { default?, allowed? } }
  team_queue_allow_user_override?: boolean | null;
}

export interface ResolveArgs {
  role: string | null | undefined;
  appSettings: TeamQueueScopeAppSettings | null | undefined;
  profileOverride: string | null | undefined;
  /** Roles the user has count > 0 for — chips outside this stay hidden anyway. */
  availableScopes?: Set<TeamQueueScope>;
  /** Currently selected chip — always kept visible even if newly disallowed. */
  currentSelection?: string | null;
}

export interface ResolvedScopeConfig {
  defaultScope: TeamQueueScope;
  allowedScopes: TeamQueueScope[]; // 'any' is always included
  allowUserOverride: boolean;
}

function isScope(x: unknown): x is TeamQueueScope {
  return typeof x === 'string' && (TEAM_QUEUE_SCOPES as string[]).includes(x);
}

function parseAllowed(raw: unknown): TeamQueueScope[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out = raw.filter(isScope);
  return out.length ? out : null;
}

export function resolveTeamQueueScopeConfig(args: ResolveArgs): ResolvedScopeConfig {
  const settings = args.appSettings ?? {};
  const allowUserOverride = settings.team_queue_allow_user_override !== false;

  // Per-role override (falls back to global fields).
  let roleDefault: TeamQueueScope | null = null;
  let roleAllowed: TeamQueueScope[] | null = null;
  const overrides = (settings.team_queue_role_overrides ?? null) as
    | Record<string, { default?: unknown; allowed?: unknown }> | null;
  if (overrides && args.role && overrides[args.role]) {
    const o = overrides[args.role];
    if (isScope(o?.default)) roleDefault = o.default;
    const a = parseAllowed(o?.allowed);
    if (a) roleAllowed = a;
  }

  const globalDefault = isScope(settings.team_queue_default_scope)
    ? settings.team_queue_default_scope
    : 'any';
  const globalAllowed = parseAllowed(settings.team_queue_allowed_scopes);

  // User override wins for the default only, and only if admin allows it.
  const userDefault = allowUserOverride && isScope(args.profileOverride)
    ? args.profileOverride
    : null;

  let allowed: TeamQueueScope[] = roleAllowed ?? globalAllowed ?? TEAM_QUEUE_SCOPES;
  // "any" is always available as an escape hatch.
  if (!allowed.includes('any')) allowed = ['any', ...allowed];

  // Keep whatever the user has actively selected visible (matches the pre-existing
  // "don't hide the chip a user is on" rule in TeamAnnualReview.tsx).
  if (isScope(args.currentSelection) && !allowed.includes(args.currentSelection)) {
    allowed = [...allowed, args.currentSelection];
  }

  // Intersect with the roles the user actually has instances under. `any` always
  // renders (no count attached). Empty intersection → fall back to just `any`.
  if (args.availableScopes) {
    const intersected = allowed.filter((s) => s === 'any' || args.availableScopes!.has(s));
    allowed = intersected.length > 0 ? intersected : ['any'];
  }

  // Default must be an allowed & (if provided) available scope.
  const candidate = userDefault ?? roleDefault ?? globalDefault ?? 'any';
  const defaultScope: TeamQueueScope = allowed.includes(candidate) ? candidate : 'any';

  return { defaultScope, allowedScopes: allowed, allowUserOverride };
}