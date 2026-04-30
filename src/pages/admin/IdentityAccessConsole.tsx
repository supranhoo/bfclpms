import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { useToast } from '@/hooks/use-toast';
import {
  useIacAssignments,
  useIacAudit,
  useIacCapabilities,
  useIacPeople,
  useIacRoles,
  useGrantRole,
  useRevokeAssignment,
  useSetRoleCapabilities,
  useApplyBulk,
  usePreviewBulk,
  useExportAssignments,
} from '@/hooks/useIac';
import { Loader2, Search, Shield, Trash2, UserPlus, FileSpreadsheet, ListTree, Users, History, Layers, Download, Upload, AlertCircle, CheckCircle2, FileDown } from 'lucide-react';
import type { IacBulkAssignmentRow, ParsedBulkRow, BulkRowIssue, IacBulkPreview } from '@/services/iac/types';
import { parseCsv, validateBulkRow, serializeCsv, downloadCsv, templateCsv, BULK_HEADERS, issueLabel } from '@/lib/iac/csv';
import { useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { IacPerson } from '@/services/iac/iacService';

/**
 * Identity & Access Console
 * ------------------------------------------------------------------
 * /admin/iac — single Hub-level surface for managing People, Roles,
 * Capabilities, Bulk operations, and Audit. Replaces module-specific
 * user/role screens going forward (legacy screens become wrappers).
 */
export default function IdentityAccessConsole() {
  return (
    <div className="container mx-auto p-3 sm:p-6 space-y-6 max-w-7xl">
      <header className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Shield className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Identity & Access Console</h1>
          <p className="text-sm text-muted-foreground">
            Single source of truth for who can do what across PMS, Safety, and future modules.
          </p>
        </div>
      </header>

      <Tabs defaultValue="people" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="people"><Users className="h-4 w-4 mr-2" />People</TabsTrigger>
          <TabsTrigger value="roles"><Layers className="h-4 w-4 mr-2" />Roles</TabsTrigger>
          <TabsTrigger value="capabilities"><ListTree className="h-4 w-4 mr-2" />Capabilities</TabsTrigger>
          <TabsTrigger value="bulk"><FileSpreadsheet className="h-4 w-4 mr-2" />Bulk</TabsTrigger>
          <TabsTrigger value="audit"><History className="h-4 w-4 mr-2" />Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="people"><PeopleTab /></TabsContent>
        <TabsContent value="roles"><RolesTab /></TabsContent>
        <TabsContent value="capabilities"><CapabilitiesTab /></TabsContent>
        <TabsContent value="bulk"><BulkTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// People tab
// =====================================================================
function PeopleTab() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<IacPerson | null>(null);
  const people = useIacPeople(search);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Directory</CardTitle>
        <CardDescription>
          Search any user. Open a profile to see and manage all module access in one place.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, email, or employee code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="border rounded-md divide-y max-h-[60vh] overflow-auto">
          {people.isLoading ? (
            <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (people.data ?? []).length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No users match.</div>
          ) : (
            (people.data ?? []).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p)}
                className="w-full text-left p-3 hover:bg-accent flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.full_name || p.email}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.email}{p.employee_code ? ` · ${p.employee_code}` : ''}
                  </p>
                </div>
                {!p.is_active && <Badge variant="secondary">Inactive</Badge>}
              </button>
            ))
          )}
        </div>
      </CardContent>

      <PersonDrawer person={selected} onClose={() => setSelected(null)} />
    </Card>
  );
}

function PersonDrawer({ person, onClose }: { person: IacPerson | null; onClose: () => void }) {
  const { toast } = useToast();
  const roles = useIacRoles();
  const assignments = useIacAssignments();
  const grant = useGrantRole();
  const revoke = useRevokeAssignment();
  const [roleId, setRoleId] = useState<string>('');

  const userAssignments = useMemo(
    () => (assignments.data ?? []).filter((a) => a.user_id === person?.id),
    [assignments.data, person?.id],
  );
  const roleById = useMemo(() => {
    const m = new Map<string, { name: string; module: string }>();
    (roles.data ?? []).forEach((r) => m.set(r.id, { name: r.name, module: r.module }));
    return m;
  }, [roles.data]);

  const handleGrant = async () => {
    if (!person || !roleId) return;
    try {
      await grant.mutateAsync({ user_id: person.id, role_id: roleId });
      toast({ title: 'Role granted' });
      setRoleId('');
    } catch (e) {
      toast({ title: 'Grant failed', description: (e as Error).message, variant: 'destructive' });
    }
  };
  const handleRevoke = async (id: string) => {
    try {
      await revoke.mutateAsync(id);
      toast({ title: 'Role revoked' });
    } catch (e) {
      toast({ title: 'Revoke failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Sheet open={!!person} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{person?.full_name || person?.email}</SheetTitle>
          <SheetDescription>{person?.email}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 mt-5">
          <section>
            <h3 className="text-sm font-semibold mb-2">Grant a role</h3>
            <div className="flex gap-2">
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="Pick a role" /></SelectTrigger>
                <SelectContent>
                  {(roles.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="text-xs uppercase mr-2 text-muted-foreground">{r.module}</span>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleGrant} disabled={!roleId || grant.isPending}>
                {grant.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              </Button>
            </div>
          </section>

          <section>
            <h3 className="text-sm font-semibold mb-2">Current assignments</h3>
            {userAssignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles yet.</p>
            ) : (
              <div className="space-y-2">
                {userAssignments.map((a) => {
                  const r = roleById.get(a.role_id);
                  return (
                    <div key={a.id} className="flex items-center justify-between border rounded-md p-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{r?.name ?? a.role_id}</p>
                        <p className="text-xs text-muted-foreground">
                          {r?.module} · {a.scope_type}{a.expires_at ? ` · expires ${new Date(a.expires_at).toLocaleDateString()}` : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => handleRevoke(a.id)} disabled={revoke.isPending} aria-label="Revoke">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// =====================================================================
// Roles tab
// =====================================================================
function RolesTab() {
  const { toast } = useToast();
  const roles = useIacRoles();
  const caps = useIacCapabilities();
  const set = useSetRoleCapabilities();
  const [active, setActive] = useState<string | null>(null);

  const role = (roles.data ?? []).find((r) => r.id === active) ?? null;
  const [draft, setDraft] = useState<string[]>([]);

  const open = (id: string) => {
    setActive(id);
    const r = (roles.data ?? []).find((x) => x.id === id);
    setDraft(r?.capabilities ?? []);
  };

  const toggle = (code: string) =>
    setDraft((d) => (d.includes(code) ? d.filter((c) => c !== code) : [...d, code]));

  const save = async () => {
    if (!role) return;
    try {
      await set.mutateAsync({ roleId: role.id, caps: draft });
      toast({ title: 'Role updated' });
      setActive(null);
    } catch (e) {
      toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const grouped = useMemo(() => {
    const out = new Map<string, typeof roles.data>();
    (roles.data ?? []).forEach((r) => {
      const arr = out.get(r.module) ?? [];
      arr.push(r);
      out.set(r.module, arr as typeof roles.data);
    });
    return out;
  }, [roles.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Roles</CardTitle>
        <CardDescription>
          Each role is a bundle of capabilities. Edit a role to change what every assigned user can do.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {Array.from(grouped.entries()).map(([module, list]) => (
          <section key={module}>
            <h3 className="text-sm font-semibold uppercase text-muted-foreground mb-2">{module}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(list ?? []).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => open(r.id)}
                  className="border rounded-md p-3 text-left hover:bg-accent transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium truncate">{r.name}</span>
                    {r.is_system && <Badge variant="outline" className="text-[10px]">system</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                  <p className="text-[11px] text-muted-foreground mt-2">{r.capabilities.length} capabilities</p>
                </button>
              ))}
            </div>
          </section>
        ))}
      </CardContent>

      <Sheet open={!!role} onOpenChange={(o) => !o && setActive(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{role?.name}</SheetTitle>
            <SheetDescription>{role?.description}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 mt-5">
            {(caps.data ?? []).map((c) => (
              <label key={c.code} className="flex items-start gap-3 p-2 border rounded-md cursor-pointer hover:bg-accent">
                <Checkbox
                  checked={draft.includes(c.code)}
                  onCheckedChange={() => toggle(c.code)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{c.label}</span>
                    <Badge variant="outline" className="text-[10px]">{c.module}</Badge>
                    {c.is_destructive && <Badge variant="destructive" className="text-[10px]">destructive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{c.code}</p>
                  {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
                </div>
              </label>
            ))}
            <div className="flex justify-end gap-2 sticky bottom-0 bg-background pt-3">
              <Button variant="outline" onClick={() => setActive(null)}>Cancel</Button>
              <Button onClick={save} disabled={set.isPending}>
                {set.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Save
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </Card>
  );
}

// =====================================================================
// Capabilities tab (read-only catalog)
// =====================================================================
function CapabilitiesTab() {
  const caps = useIacCapabilities();
  const roles = useIacRoles();

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    (roles.data ?? []).forEach((r) => r.capabilities.forEach((c) => m.set(c, (m.get(c) ?? 0) + 1)));
    return m;
  }, [roles.data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Capability Catalog</CardTitle>
        <CardDescription>
          The complete list of gated actions across all modules. Capabilities are immutable
          (managed via migrations); only the roles that bundle them are editable.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-md divide-y">
          {(caps.data ?? []).map((c) => (
            <div key={c.code} className="p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{c.label}</span>
                  <Badge variant="outline" className="text-[10px]">{c.module}</Badge>
                  {c.is_destructive && <Badge variant="destructive" className="text-[10px]">destructive</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{c.code}</p>
                {c.description && <p className="text-xs text-muted-foreground mt-1">{c.description}</p>}
              </div>
              <Badge variant="secondary">{usage.get(c.code) ?? 0} roles</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Bulk tab
// =====================================================================
function BulkTab() {
  const { toast } = useToast();
  const apply = useApplyBulk();
  const [csv, setCsv] = useState('email,role_code,scope_type,scope_id,expires_at\n');
  const [busy, setBusy] = useState(false);

  const parsed: IacBulkAssignmentRow[] = useMemo(() => {
    const lines = csv.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map((h) => h.trim());
    return lines.slice(1).map((line) => {
      const cells = line.split(',').map((c) => c.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
      return {
        email: row.email ?? '',
        role_code: row.role_code ?? '',
        scope_type: (row.scope_type || 'global') as IacBulkAssignmentRow['scope_type'],
        scope_id: row.scope_id || null,
        expires_at: row.expires_at || null,
      };
    }).filter((r) => r.email && r.role_code);
  }, [csv]);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await apply.mutateAsync(parsed);
      toast({ title: 'Bulk import done', description: `${res.inserted} assignments created.` });
    } catch (e) {
      toast({ title: 'Bulk import failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bulk Operations</CardTitle>
        <CardDescription>
          Paste a CSV with columns <code>email,role_code,scope_type,scope_id,expires_at</code>.
          Existing assignments are skipped server-side (idempotent).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Label htmlFor="iac-csv">CSV</Label>
        <Textarea
          id="iac-csv"
          value={csv}
          onChange={(e) => setCsv(e.target.value)}
          rows={10}
          className="font-mono text-xs"
        />
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Parsed {parsed.length} rows.</p>
          <Button onClick={submit} disabled={busy || parsed.length === 0}>
            {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Apply
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =====================================================================
// Audit tab
// =====================================================================
function AuditTab() {
  const audit = useIacAudit(300);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Audit log</CardTitle>
        <CardDescription>Immutable trail of every IAC change.</CardDescription>
      </CardHeader>
      <CardContent>
        {audit.isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (audit.data ?? []).length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">No audit events yet.</div>
        ) : (
          <div className="border rounded-md divide-y max-h-[60vh] overflow-auto">
            {(audit.data ?? []).map((e) => (
              <div key={e.id} className="p-3 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{e.action}</span>
                  <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                </div>
                <p className="text-muted-foreground mt-0.5">
                  {e.target_type}{e.target_id ? ` · ${e.target_id}` : ''}
                </p>
                {Object.keys(e.payload ?? {}).length > 0 && (
                  <pre className="mt-1 text-[10px] bg-muted/40 rounded p-1 overflow-x-auto">
                    {JSON.stringify(e.payload, null, 0)}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}