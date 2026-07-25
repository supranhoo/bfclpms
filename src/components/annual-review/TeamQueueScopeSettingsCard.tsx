import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Filter } from 'lucide-react';
import {
  useTeamQueueScopeSettings,
  useUpdateTeamQueueScopeSettings,
} from '@/hooks/useTeamQueueScopeConfig';
import {
  TEAM_QUEUE_SCOPES,
  type TeamQueueScope,
  type TeamQueueScopeAppSettings,
} from '@/lib/annualReview/teamQueueScopeConfig';

const SCOPE_LABEL: Record<TeamQueueScope, string> = {
  any: 'Any',
  manager: 'Manager (direct reports)',
  skip: 'Skip-Level',
  dept: 'Dept Head',
  bu: 'BU Head',
  hr: 'HR',
  management: 'Management',
};

const ROLE_ROWS: { key: string; label: string }[] = [
  { key: 'admin', label: 'Admin' },
  { key: 'hr_pms', label: 'HR PMS' },
  { key: 'management', label: 'Management' },
  { key: 'manager', label: 'Manager' },
  { key: 'skip_level', label: 'Skip-Level' },
  { key: 'auditor', label: 'Auditor' },
];

interface RoleOverride { default?: TeamQueueScope; allowed?: TeamQueueScope[] }

function parseAllowed(raw: unknown): TeamQueueScope[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is TeamQueueScope =>
    typeof x === 'string' && (TEAM_QUEUE_SCOPES as string[]).includes(x));
}

export function TeamQueueScopeSettingsCard() {
  const { data: settings, isLoading } = useTeamQueueScopeSettings();
  const update = useUpdateTeamQueueScopeSettings();

  const [defaultScope, setDefaultScope] = useState<TeamQueueScope>('any');
  const [allowedScopes, setAllowedScopes] = useState<TeamQueueScope[] | null>(null); // null = all
  const [roleOverrides, setRoleOverrides] = useState<Record<string, RoleOverride>>({});
  const [allowUserOverride, setAllowUserOverride] = useState(true);

  useEffect(() => {
    if (!settings) return;
    const d = settings.team_queue_default_scope;
    setDefaultScope((typeof d === 'string' && (TEAM_QUEUE_SCOPES as string[]).includes(d)) ? d as TeamQueueScope : 'any');
    const a = settings.team_queue_allowed_scopes;
    setAllowedScopes(a == null ? null : parseAllowed(a));
    const ro = (settings.team_queue_role_overrides ?? null) as Record<string, RoleOverride> | null;
    setRoleOverrides(ro ?? {});
    setAllowUserOverride(settings.team_queue_allow_user_override !== false);
  }, [settings]);

  const toggleAllowed = (s: TeamQueueScope) => {
    setAllowedScopes((prev) => {
      const cur = prev ?? [...TEAM_QUEUE_SCOPES];
      return cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
    });
  };
  const setRoleDefault = (role: string, v: TeamQueueScope | '__inherit__') => {
    setRoleOverrides((prev) => {
      const next = { ...prev };
      const row = { ...(next[role] ?? {}) } as RoleOverride;
      if (v === '__inherit__') delete row.default; else row.default = v;
      if (!row.default && !row.allowed) delete next[role]; else next[role] = row;
      return next;
    });
  };
  const toggleRoleAllowed = (role: string, s: TeamQueueScope) => {
    setRoleOverrides((prev) => {
      const next = { ...prev };
      const row = { ...(next[role] ?? {}) } as RoleOverride;
      const cur = row.allowed ?? [];
      row.allowed = cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s];
      if (row.allowed.length === 0) delete row.allowed;
      if (!row.default && !row.allowed) delete next[role]; else next[role] = row;
      return next;
    });
  };
  const resetRole = (role: string) => {
    setRoleOverrides((prev) => {
      const next = { ...prev }; delete next[role]; return next;
    });
  };

  const dirty = useMemo(() => {
    if (!settings) return false;
    const cur: TeamQueueScopeAppSettings = {
      team_queue_default_scope: defaultScope,
      team_queue_allowed_scopes: allowedScopes,
      team_queue_role_overrides: Object.keys(roleOverrides).length ? roleOverrides : null,
      team_queue_allow_user_override: allowUserOverride,
    };
    return JSON.stringify(cur) !== JSON.stringify({
      team_queue_default_scope: settings.team_queue_default_scope ?? 'any',
      team_queue_allowed_scopes: settings.team_queue_allowed_scopes ?? null,
      team_queue_role_overrides: settings.team_queue_role_overrides ?? null,
      team_queue_allow_user_override: settings.team_queue_allow_user_override !== false,
    });
  }, [settings, defaultScope, allowedScopes, roleOverrides, allowUserOverride]);

  const save = () => {
    update.mutate({
      team_queue_default_scope: defaultScope,
      team_queue_allowed_scopes: allowedScopes as unknown as TeamQueueScopeAppSettings['team_queue_allowed_scopes'],
      team_queue_role_overrides: (Object.keys(roleOverrides).length
        ? roleOverrides
        : null) as unknown as TeamQueueScopeAppSettings['team_queue_role_overrides'],
      team_queue_allow_user_override: allowUserOverride,
    }, {
      onSuccess: () => toast.success('Scope-chip settings saved'),
      onError: (e: any) => toast.error(e?.message ?? 'Failed to save'),
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />My Queue — scope chips</CardTitle>
        </CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  const effectiveAllowed = allowedScopes ?? [...TEAM_QUEUE_SCOPES];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />My Queue — scope chips</CardTitle>
        <CardDescription>
          Controls the <b>My role</b> chips (Any / Dept Head / BU Head / …) shown on
          Team Annual Review → My Queue. Set the default chip and restrict which
          chips render. This is a display control — reviewer assignments and
          server-side permissions are unchanged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Global default */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Default chip</Label>
            <Select value={defaultScope} onValueChange={(v) => setDefaultScope(v as TeamQueueScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TEAM_QUEUE_SCOPES.map((s) => (
                  <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Applies when the user has no personal override.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Allow users to pin their own default</Label>
              <Switch checked={allowUserOverride} onCheckedChange={setAllowUserOverride} />
            </div>
            <p className="text-[11px] text-muted-foreground">
              When enabled, a "Set as default" button appears next to the chips.
            </p>
          </div>
        </div>

        {/* Global allowed */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Allowed chips (global)</Label>
            <Button variant="ghost" size="sm" onClick={() => setAllowedScopes(null)}>
              Allow all
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 rounded-md border p-3">
            {TEAM_QUEUE_SCOPES.map((s) => (
              <label key={s} className="flex items-center gap-1.5 text-sm">
                <Checkbox
                  checked={effectiveAllowed.includes(s)}
                  disabled={s === 'any'}
                  onCheckedChange={() => toggleAllowed(s)}
                />
                {SCOPE_LABEL[s]}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            The "Any" chip is always available. Unchecking a chip hides it from all users unless a per-role override re-adds it.
          </p>
        </div>

        {/* Per-role overrides */}
        <div className="space-y-2">
          <Label>Per-role overrides</Label>
          <div className="rounded-md border divide-y">
            {ROLE_ROWS.map((r) => {
              const ov = roleOverrides[r.key] ?? {};
              const roleAllowed = ov.allowed ?? effectiveAllowed;
              return (
                <div key={r.key} className="p-3 grid gap-3 md:grid-cols-[160px_180px_1fr_auto] md:items-center">
                  <div className="font-medium text-sm">{r.label}</div>
                  <div>
                    <Select
                      value={ov.default ?? '__inherit__'}
                      onValueChange={(v) => setRoleDefault(r.key, v as TeamQueueScope | '__inherit__')}
                    >
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__inherit__">Inherit global default</SelectItem>
                        {TEAM_QUEUE_SCOPES.map((s) => (
                          <SelectItem key={s} value={s}>{SCOPE_LABEL[s]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {TEAM_QUEUE_SCOPES.map((s) => (
                      <label key={s} className="flex items-center gap-1 text-xs">
                        <Checkbox
                          checked={roleAllowed.includes(s)}
                          disabled={s === 'any'}
                          onCheckedChange={() => toggleRoleAllowed(r.key, s)}
                        />
                        {SCOPE_LABEL[s]}
                      </label>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => resetRole(r.key)} disabled={!roleOverrides[r.key]}>
                    Reset
                  </Button>
                </div>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Per-role override wins over the global settings. Leaving a role untouched inherits the global config.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={save} disabled={!dirty || update.isPending}>
            {update.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}