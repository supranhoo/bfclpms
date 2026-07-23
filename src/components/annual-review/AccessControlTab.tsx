import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { OrgFilterCombobox } from '@/components/admin/OrgFilterCombobox';
import { Shield, KeyRound, ListChecks, History, Search, Plus, Trash2, RefreshCw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useBusinessUnits, useActiveProfilesLite, formatSafetyProfileLabel } from '@/hooks/useSafetyOrg';
import {
  useKillSwitches, useSetKillSwitch,
  useDirectoryOverrides, useUpsertOverride, useDeleteOverride,
  useAccessAudit, useAccessExplain,
  type OverrideType, type DirectoryOverride,
  useRoleCapabilities, useUpsertRoleCapability,
  type RoleCapability, type RoleSource, type AssistScopeSetting,
  useManagementSeedingGaps, useBackfillManagementStage,
} from '@/hooks/useAccessControlAdmin';

const OVERRIDE_LABEL: Record<OverrideType, string> = {
  grant_all: 'Grant — All employees',
  grant_bu: 'Grant — Specific Business Units',
  grant_team: 'Grant — Reporting team only',
  deny: 'Deny — Block directory & Assisted',
};

function OverrideBadge({ type }: { type: OverrideType }) {
  const variant = type === 'deny' ? 'destructive' : type === 'grant_all' ? 'default' : 'secondary';
  return <Badge variant={variant as any}>{OVERRIDE_LABEL[type]}</Badge>;
}

const ROLE_LABEL: Record<RoleSource, string> = {
  admin: 'Admin',
  hr_pms: 'HR PMS',
  hr_team: 'HR Team (HR Business Unit)',
  bu_head: 'BU Head',
  hod: 'HOD (Department Head)',
  reporting_manager: 'Reporting Manager',
  skip_manager: 'Skip-Level Manager',
};

const ASSIST_SCOPE_LABEL: Record<AssistScopeSetting, string> = {
  same_as_search: 'Same as search scope',
  direct_reports_only: 'Direct reports only',
  none: 'None',
};

function RoleCapabilityMatrixCard() {
  const { data: rows = [], isLoading } = useRoleCapabilities();
  const upsert = useUpsertRoleCapability();
  const [editing, setEditing] = useState<RoleCapability | null>(null);
  const [form, setForm] = useState<{ can_search: boolean; can_assist: boolean; assist_scope: AssistScopeSetting; reason: string }>({
    can_search: true, can_assist: false, assist_scope: 'same_as_search', reason: '',
  });

  const openEdit = (r: RoleCapability) => {
    setEditing(r);
    setForm({
      can_search: r.can_search, can_assist: r.can_assist,
      assist_scope: r.assist_scope, reason: '',
    });
  };

  const save = () => {
    if (!editing) return;
    if (form.reason.trim().length < 3) { toast.error('Reason is required'); return; }
    upsert.mutate(
      { role_source: editing.role_source, ...form, reason: form.reason.trim() },
      {
        onSuccess: () => { toast.success('Role capability updated'); setEditing(null); },
        onError: (e: any) => toast.error(e?.message ?? 'Failed'),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5" />Role capability matrix</CardTitle>
        <CardDescription>
          Defines defaults per detected role. "Search" enables the All Employees directory;
          "Assist" separately enables Assisted Self-Submission. Managers can be limited to
          direct reports only to prevent cross-team leakage.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Role</TableHead>
                  <TableHead>Can search directory</TableHead>
                  <TableHead>Can assist self-submission</TableHead>
                  <TableHead>Assist scope</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.role_source}>
                    <TableCell className="font-medium">{ROLE_LABEL[r.role_source]}</TableCell>
                    <TableCell>
                      {r.can_search
                        ? <Badge variant="secondary">Allowed</Badge>
                        : <Badge variant="destructive">Blocked</Badge>}
                    </TableCell>
                    <TableCell>
                      {r.can_assist
                        ? <Badge variant="secondary">Allowed</Badge>
                        : <Badge variant="destructive">Blocked</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{ASSIST_SCOPE_LABEL[r.assist_scope]}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit role: {editing ? ROLE_LABEL[editing.role_source] : ''}</DialogTitle>
              <DialogDescription>
                Changes apply to every user auto-detected with this role. Per-user overrides on the
                next card still win over these defaults.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Allow directory search</Label>
                  <p className="text-xs text-muted-foreground">Show the "All Employees" search in Team Annual Review.</p>
                </div>
                <Switch checked={form.can_search} onCheckedChange={(v) => setForm((f) => ({ ...f, can_search: v }))} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <Label>Allow Assisted self-submission</Label>
                  <p className="text-xs text-muted-foreground">Permit proxy-submitting an employee's self-review.</p>
                </div>
                <Switch checked={form.can_assist} onCheckedChange={(v) => setForm((f) => ({ ...f, can_assist: v }))} />
              </div>
              <div>
                <Label className="mb-1 block">Assist scope</Label>
                <Select
                  value={form.assist_scope}
                  onValueChange={(v) => setForm((f) => ({ ...f, assist_scope: v as AssistScopeSetting }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="same_as_search">Same as search scope</SelectItem>
                    <SelectItem value="direct_reports_only">Direct reports only (no skip-level)</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Applies only when Assist is allowed. HODs are always restricted to their own department,
                  never the whole BU, regardless of this setting.
                </p>
              </div>
              <div>
                <Label className="mb-1 block">Reason (audited)</Label>
                <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why is this default changing?" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={save} disabled={upsert.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// -------------------- Kill switches --------------------
function KillSwitchesCard() {
  const { data, isLoading } = useKillSwitches();
  const setSwitch = useSetKillSwitch();
  const [pending, setPending] = useState<null | {
    key: 'annual_review_directory_search_enabled' | 'assisted_self_submission_enabled';
    value: boolean;
  }>(null);
  const [reason, setReason] = useState('');

  const commit = () => {
    if (!pending) return;
    if (reason.trim().length < 3) { toast.error('Reason is required'); return; }
    setSwitch.mutate(
      { key: pending.key, value: pending.value, reason: reason.trim() },
      {
        onSuccess: () => { toast.success('Setting updated'); setPending(null); setReason(''); },
        onError: (e: any) => toast.error(e?.message ?? 'Failed to update'),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5" />Global kill-switches</CardTitle>
        <CardDescription>Turn the "All Employees" directory and Assisted Submission on or off for everyone.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Skeleton className="h-24 w-full" /> : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex items-start justify-between rounded-lg border p-4 gap-4">
              <div>
                <Label className="font-medium">Directory search (All employees)</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Controls the "All Employees" search button inside Team Annual Review.
                </p>
              </div>
              <Switch
                checked={!!data?.annual_review_directory_search_enabled}
                onCheckedChange={(v) => setPending({ key: 'annual_review_directory_search_enabled', value: v })}
                aria-label="Toggle directory search"
              />
            </div>
            <div className="flex items-start justify-between rounded-lg border p-4 gap-4">
              <div>
                <Label className="font-medium">Assisted self-submission</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Allows managers/HR to submit a self-review on behalf of an employee.
                </p>
              </div>
              <Switch
                checked={!!data?.assisted_self_submission_enabled}
                onCheckedChange={(v) => setPending({ key: 'assisted_self_submission_enabled', value: v })}
                aria-label="Toggle assisted submission"
              />
            </div>
          </div>
        )}

        <Dialog open={!!pending} onOpenChange={(o) => { if (!o) { setPending(null); setReason(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm setting change</DialogTitle>
              <DialogDescription>
                {pending?.key === 'annual_review_directory_search_enabled'
                  ? 'Directory search'
                  : 'Assisted self-submission'} will be turned {pending?.value ? 'ON' : 'OFF'}.
                A reason is required and will be recorded in the audit log.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="ac-reason">Reason</Label>
              <Textarea id="ac-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this change being made?" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPending(null); setReason(''); }}>Cancel</Button>
              <Button onClick={commit} disabled={setSwitch.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// -------------------- Access explain --------------------
function AccessExplainCard() {
  const { data: profiles = [], isLoading: pLoading } = useActiveProfilesLite();
  const [userId, setUserId] = useState<string>('');
  const options = useMemo(
    () => profiles.map((p) => ({ value: p.id, label: formatSafetyProfileLabel(p) })),
    [profiles],
  );
  const { data, isLoading } = useAccessExplain(userId || null);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Search className="h-5 w-5" />Why does a user have access?</CardTitle>
        <CardDescription>Pick any employee to see how their current directory access is derived.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="max-w-md">
          <OrgFilterCombobox
            value={userId}
            onValueChange={setUserId}
            options={options}
            placeholder={pLoading ? 'Loading…' : 'Search employee…'}
            label="Employee"
          />
        </div>
        {userId && (isLoading || !data ? <Skeleton className="h-32 w-full" /> : (
          <div className="rounded-md border p-4 space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">Directory access:</span>
              {data.access.can_access ? (
                <Badge>Access — {data.access.scope}</Badge>
              ) : (
                <Badge variant="destructive">No access</Badge>
              )}
              <span className="text-muted-foreground">source: {data.access.source ?? '—'}</span>
              <Badge variant={data.access.can_assist ? 'secondary' : 'destructive'}>
                Assisted: {data.access.can_assist ? 'allowed' : 'blocked'}
              </Badge>
            </div>
            {data.override && (
              <div className="rounded bg-muted/40 p-2">
                <div className="font-medium mb-1">Override applied</div>
                <div>Type: {OVERRIDE_LABEL[data.override.override_type]}</div>
                <div>Assisted: {data.override.can_assist ? 'allowed' : 'blocked'}</div>
                <div>Reason: {data.override.reason}</div>
              </div>
            )}
            <div>
              <div className="font-medium mb-1">Automatic signals</div>
              <ul className="list-disc pl-6 space-y-1">
                <li>Admin: {data.auto.is_admin ? 'yes' : 'no'}</li>
                <li>HR PMS role: {data.auto.is_hr_pms ? 'yes' : 'no'}</li>
                <li>Member of HR Business Unit: {data.auto.in_hr_bu ? 'yes' : 'no'}</li>
                <li>BU Head of: {data.auto.bu_head_of.length ? data.auto.bu_head_of.map(b => b.name).join(', ') : '—'}</li>
                <li>HOD of: {data.auto.hod_of.length ? data.auto.hod_of.map(d => d.name).join(', ') : '—'}</li>
                <li>Direct reports: {data.auto.direct_reports} • Skip reports: {data.auto.skip_reports}</li>
              </ul>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// -------------------- Overrides table --------------------
function OverridesCard() {
  const { data: overrides = [], isLoading } = useDirectoryOverrides();
  const { data: profiles = [] } = useActiveProfilesLite();
  const { data: bus = [] } = useBusinessUnits();
  const upsert = useUpsertOverride();
  const del = useDeleteOverride();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DirectoryOverride | null>(null);
  const [form, setForm] = useState<{
    user_id: string; override_type: OverrideType; business_unit_ids: string[]; can_assist: boolean; reason: string;
  }>({ user_id: '', override_type: 'grant_all', business_unit_ids: [], can_assist: true, reason: '' });

  const [deleteTarget, setDeleteTarget] = useState<DirectoryOverride | null>(null);
  const [deleteReason, setDeleteReason] = useState('');

  const profileById = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => m.set(p.id, formatSafetyProfileLabel(p)));
    return m;
  }, [profiles]);
  const buById = useMemo(() => {
    const m = new Map<string, string>();
    bus.forEach((b) => m.set(b.id, b.name));
    return m;
  }, [bus]);
  const userOptions = useMemo(
    () => profiles.map((p) => ({ value: p.id, label: formatSafetyProfileLabel(p) })),
    [profiles],
  );
  const buOptions = useMemo(() => bus.map((b) => ({ value: b.id, label: b.name })), [bus]);

  const openNew = () => {
    setEditing(null);
    setForm({ user_id: '', override_type: 'grant_all', business_unit_ids: [], can_assist: true, reason: '' });
    setOpen(true);
  };
  const openEdit = (o: DirectoryOverride) => {
    setEditing(o);
    setForm({
      user_id: o.user_id, override_type: o.override_type,
      business_unit_ids: o.business_unit_ids ?? [], can_assist: o.can_assist, reason: o.reason,
    });
    setOpen(true);
  };

  const submit = () => {
    if (!form.user_id) { toast.error('Pick an employee'); return; }
    if (form.reason.trim().length < 3) { toast.error('Reason is required'); return; }
    if (form.override_type === 'grant_bu' && form.business_unit_ids.length === 0) {
      toast.error('Select at least one Business Unit'); return;
    }
    upsert.mutate(
      {
        user_id: form.user_id,
        override_type: form.override_type,
        business_unit_ids: form.override_type === 'grant_bu' ? form.business_unit_ids : [],
        can_assist: form.override_type === 'deny' ? false : form.can_assist,
        reason: form.reason.trim(),
      },
      {
        onSuccess: () => { toast.success(editing ? 'Override updated' : 'Override created'); setOpen(false); },
        onError: (e: any) => toast.error(e?.message ?? 'Failed'),
      },
    );
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteReason.trim().length < 3) { toast.error('Reason is required'); return; }
    del.mutate(
      { user_id: deleteTarget.user_id, reason: deleteReason.trim() },
      {
        onSuccess: () => { toast.success('Override removed'); setDeleteTarget(null); setDeleteReason(''); },
        onError: (e: any) => toast.error(e?.message ?? 'Failed'),
      },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5" />Per-user overrides</CardTitle>
          <CardDescription>
            Overrides win over automatic rules. Denies block directory & Assisted entirely.
          </CardDescription>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />Add override</Button>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : overrides.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">
            No overrides yet. Access is entirely governed by the automatic rules.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Override</TableHead>
                  <TableHead>BU scope</TableHead>
                  <TableHead>Assisted</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overrides.map((o) => (
                  <TableRow key={o.user_id} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{profileById.get(o.user_id) ?? o.user_id.slice(0, 8)}</TableCell>
                    <TableCell><OverrideBadge type={o.override_type} /></TableCell>
                    <TableCell className="max-w-[220px] truncate">
                      {o.override_type === 'grant_bu'
                        ? (o.business_unit_ids ?? []).map((id) => buById.get(id) ?? id.slice(0, 6)).join(', ')
                        : '—'}
                    </TableCell>
                    <TableCell>
                      {o.can_assist
                        ? <Badge variant="secondary">Allowed</Badge>
                        : <Badge variant="destructive">Blocked</Badge>}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate" title={o.reason}>{o.reason}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {new Date(o.updated_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(o)}>Edit</Button>
                        <Button variant="ghost" size="icon" aria-label="Remove override" onClick={() => { setDeleteTarget(o); setDeleteReason(''); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Upsert dialog */}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit override' : 'Add override'}</DialogTitle>
              <DialogDescription>
                Grants add or elevate access. Deny blocks the user entirely, including Assisted submission.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="mb-1 block">Employee</Label>
                <OrgFilterCombobox
                  value={form.user_id}
                  onValueChange={(v) => setForm((f) => ({ ...f, user_id: v }))}
                  options={userOptions}
                  placeholder="Search employee…"
                  disabled={!!editing}
                />
              </div>
              <div>
                <Label className="mb-1 block">Override type</Label>
                <Select value={form.override_type} onValueChange={(v) => setForm((f) => ({ ...f, override_type: v as OverrideType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grant_all">Grant — All employees</SelectItem>
                    <SelectItem value="grant_bu">Grant — Specific Business Units</SelectItem>
                    <SelectItem value="grant_team">Grant — Reporting team only</SelectItem>
                    <SelectItem value="deny">Deny — Block directory & Assisted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {form.override_type === 'grant_bu' && (
                <div>
                  <Label className="mb-1 block">Business Units</Label>
                  <OrgFilterCombobox
                    multiSelect
                    values={form.business_unit_ids}
                    onValuesChange={(v) => setForm((f) => ({ ...f, business_unit_ids: v }))}
                    options={buOptions}
                    placeholder="Select business units…"
                  />
                </div>
              )}
              {form.override_type !== 'deny' && (
                <div className="flex items-center justify-between rounded-md border p-3">
                  <div>
                    <Label>Allow Assisted submission</Label>
                    <p className="text-xs text-muted-foreground">Uncheck to grant view-only directory access without proxy submission.</p>
                  </div>
                  <Switch checked={form.can_assist} onCheckedChange={(v) => setForm((f) => ({ ...f, can_assist: v }))} />
                </div>
              )}
              <div>
                <Label className="mb-1 block">Reason (audited)</Label>
                <Textarea value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Why is this override being set?" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={upsert.isPending}>{editing ? 'Save changes' : 'Create override'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) { setDeleteTarget(null); setDeleteReason(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove access override?</DialogTitle>
              <DialogDescription>
                {deleteTarget ? `Access for ${profileById.get(deleteTarget.user_id) ?? deleteTarget.user_id.slice(0, 8)} will revert to the automatic rules.` : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Reason (audited)</Label>
              <Textarea value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} placeholder="Why is this override being removed?" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDeleteTarget(null); setDeleteReason(''); }}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDelete} disabled={del.isPending}>Remove</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// -------------------- Audit log --------------------
function AuditCard() {
  const { data = [], isLoading } = useAccessAudit(50);
  const { data: profiles = [] } = useActiveProfilesLite();
  const nameOf = (id: string | null) => {
    if (!id) return '—';
    const p = profiles.find((x) => x.id === id);
    return p ? formatSafetyProfileLabel(p) : id.slice(0, 8);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><History className="h-5 w-5" />Audit log</CardTitle>
        <CardDescription>Every kill-switch toggle and override change (latest 50).</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-40 w-full" /> : data.length === 0 ? (
          <div className="text-sm text-muted-foreground border rounded-md p-6 text-center">No activity yet.</div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{new Date(e.created_at).toLocaleString()}</TableCell>
                    <TableCell>{nameOf(e.actor_id)}</TableCell>
                    <TableCell><Badge variant="secondary">{e.action.replace(/_/g, ' ')}</Badge></TableCell>
                    <TableCell>{e.target_user_id ? nameOf(e.target_user_id) : '—'}</TableCell>
                    <TableCell className="max-w-[320px] truncate" title={e.reason ?? ''}>{e.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// -------------------- Management stage backfill (ADR-148) --------------------
function ManagementBackfillCard() {
  const { data: profiles = [], isLoading: pLoading } = useActiveProfilesLite();
  const options = useMemo(
    () => profiles.map((p) => ({ value: p.id, label: formatSafetyProfileLabel(p) })),
    [profiles],
  );
  const [managerId, setManagerId] = useState<string>('');
  const [reopen, setReopen] = useState<boolean>(true);
  const [reason, setReason] = useState<string>('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: gaps = [], isLoading: gapsLoading, refetch } = useManagementSeedingGaps(managerId || null);
  const backfill = useBackfillManagementStage();

  const totals = useMemo(() => {
    const reopenCount = gaps.filter((g) => g.overall_status === 'completed').length;
    return { total: gaps.length, reopenCount, augmentOnly: gaps.length - reopenCount };
  }, [gaps]);

  const runBackfill = () => {
    if (!managerId) { toast.error('Pick a management user'); return; }
    if (reason.trim().length < 3) { toast.error('Reason is required'); return; }
    backfill.mutate(
      { management_uid: managerId, reopen_completed: reopen, dry_run: false, reason: reason.trim() },
      {
        onSuccess: (res) => {
          toast.success(
            `Stamped ${res.rows_stamped} instance(s), reopened ${res.rows_reopened}.`,
          );
          setConfirmOpen(false);
          setReason('');
          refetch();
        },
        onError: (e: any) => toast.error(e?.message ?? 'Backfill failed'),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />Management stage backfill (ADR-148)
        </CardTitle>
        <CardDescription>
          Stamps <b>Management</b> as the terminal reviewer on the annual review instances of a
          management user's direct reports. Historic rows that were finalised at the BU Head stage
          can be reopened to <b>Pending Management</b> so the management review actually happens.
          Every affected instance is snapshotted to the reset archive and audited.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] items-end">
          <div className="max-w-md">
            <OrgFilterCombobox
              value={managerId}
              onValueChange={setManagerId}
              options={options}
              placeholder={pLoading ? 'Loading…' : 'Search a management user…'}
              label="Management user"
            />
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={!managerId || gapsLoading}>
            <Search className="h-4 w-4 mr-2" />Preview gaps
          </Button>
        </div>

        {managerId && (
          <>
            <div className="flex flex-wrap gap-3 text-sm">
              <Badge variant="secondary">Total gaps: {totals.total}</Badge>
              <Badge variant={totals.reopenCount ? 'destructive' : 'secondary'}>
                Completed rows (will reopen): {totals.reopenCount}
              </Badge>
              <Badge variant="secondary">Stamp only (in-flight): {totals.augmentOnly}</Badge>
            </div>

            {gapsLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : gaps.length === 0 ? (
              <div className="rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                No gaps detected. Every direct report already has the Management stage seeded.
              </div>
            ) : (
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Current status</TableHead>
                      <TableHead>Has mgmt stage</TableHead>
                      <TableHead>Has mgmt ID</TableHead>
                      <TableHead>Will reopen</TableHead>
                      <TableHead>Cycle</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gaps.map((g) => (
                      <TableRow key={g.instance_id}>
                        <TableCell className="font-mono">{g.employee_code ?? '—'}</TableCell>
                        <TableCell>{g.employee_name ?? '—'}</TableCell>
                        <TableCell><Badge variant="secondary">{g.overall_status}</Badge></TableCell>
                        <TableCell>{g.has_management_stage ? 'Yes' : <Badge variant="destructive">No</Badge>}</TableCell>
                        <TableCell>{g.has_management_id ? 'Yes' : <Badge variant="destructive">No</Badge>}</TableCell>
                        <TableCell>
                          {g.needs_reopen
                            ? (reopen ? <Badge variant="destructive">Reopen</Badge> : <Badge variant="secondary">Kept</Badge>)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{g.cycle_name ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-col gap-3 rounded-md border p-4 bg-muted/20">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="reopen-completed"
                  checked={reopen}
                  onCheckedChange={(v) => setReopen(Boolean(v))}
                />
                <Label htmlFor="reopen-completed" className="text-sm">
                  Reopen completed rows to <b>Pending Management</b> (recommended)
                </Label>
              </div>
              <div>
                <Label htmlFor="mgmt-reason" className="text-sm">Reason (audited)</Label>
                <Textarea
                  id="mgmt-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Adding Gaurav as terminal management reviewer for FY25-26 direct reports"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={!managerId || gaps.length === 0 || reason.trim().length < 3 || backfill.isPending}
                >
                  Run backfill
                </Button>
              </div>
            </div>
          </>
        )}

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm management stage backfill</DialogTitle>
              <DialogDescription>
                About to stamp <b>{totals.total}</b> instance(s). Of those,{' '}
                <b>{reopen ? totals.reopenCount : 0}</b> completed row(s) will be reopened to
                Pending Management (scores cleared, response rows preserved). This is snapshotted
                and reversible via the reset archive.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={backfill.isPending}>
                Cancel
              </Button>
              <Button onClick={runBackfill} disabled={backfill.isPending}>
                {backfill.isPending ? 'Running…' : 'Confirm & run'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// -------------------- Root --------------------
export function AccessControlTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/30 p-4 flex items-start gap-3">
        <Shield className="h-5 w-5 mt-0.5 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          Controls who can use <b>All Employees</b> search and <b>Assisted Submission</b> under Team Annual Review.
          Automatic rules (Admin, HR PMS, HR Business Unit, BU Head, HOD, Reporting/Skip Manager) remain in force —
          overrides on this page only add, elevate, or block on top of them.
        </div>
      </div>
      <KillSwitchesCard />
      <RoleCapabilityMatrixCard />
      <AccessExplainCard />
      <OverridesCard />
      <ManagementBackfillCard />
      <AuditCard />
    </div>
  );
}

export default AccessControlTab;