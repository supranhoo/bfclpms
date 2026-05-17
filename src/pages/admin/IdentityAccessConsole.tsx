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
  useExportRoleMatrix,
  useLoadMatrixLookups,
  useApplyMatrixDiff,
} from '@/hooks/useIac';
import { Loader2, Search, Shield, Trash2, UserPlus, FileSpreadsheet, ListTree, Users, History, Layers, Download, Upload, AlertCircle, CheckCircle2, FileDown } from 'lucide-react';
import type { IacBulkAssignmentRow, ParsedBulkRow, BulkRowIssue, IacBulkPreview, IacMatrixDiff } from '@/services/iac/types';
import { parseCsv, validateBulkRow, serializeCsv, downloadCsv, templateCsv, BULK_HEADERS, issueLabel, serializeMatrixCsv, matrixTemplateCsv, parseMatrixCsv, diffMatrix } from '@/lib/iac/csv';
import { useRef } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { IacPerson } from '@/services/iac/iacService';
import { UserAccessSheet } from '@/components/admin/UserAccessSheet';

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
  return (
    <UserAccessSheet
      user={person ? {
        id: person.id,
        full_name: person.full_name,
        email: person.email,
        employee_code: person.employee_code,
      } : null}
      onClose={onClose}
    />
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
  const [mode, setMode] = useState<'matrix' | 'advanced'>('matrix');
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={mode === 'matrix' ? 'default' : 'outline'}
          className="cursor-pointer" onClick={() => setMode('matrix')}>
          Role Matrix (recommended)
        </Badge>
        <Badge variant={mode === 'advanced' ? 'default' : 'outline'}
          className="cursor-pointer" onClick={() => setMode('advanced')}>
          Advanced (long-form, scoped grants)
        </Badge>
      </div>
      {mode === 'matrix' ? <MatrixBulkTab /> : <LongFormBulkTab />}
    </div>
  );
}

// ---------------------------------------------------------------------
// Matrix flow: download, upload, diff preview, apply
// ---------------------------------------------------------------------
function MatrixBulkTab() {
  const { toast } = useToast();
  const exportMatrix = useExportRoleMatrix();
  const loadLookups = useLoadMatrixLookups();
  const applyDiff = useApplyMatrixDiff();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [diff, setDiff] = useState<IacMatrixDiff | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [allowInactive, setAllowInactive] = useState(false);
  const [applyResult, setApplyResult] = useState<Awaited<ReturnType<typeof applyDiff.mutateAsync>> | null>(null);
  const [lastCsv, setLastCsv] = useState<string | null>(null);

  const reportError = (where: string, e: unknown) => {
    const msg = (e as Error)?.message ?? String(e);
    // eslint-disable-next-line no-console
    console.error(`[IAC.matrix] ${where}:`, e);
    toast({ title: where, description: msg, variant: 'destructive' });
  };

  const handleDownload = async () => {
    setApplyResult(null);
    try {
      const { roleCodes, rows } = await exportMatrix.mutateAsync();
      if (rows.length === 0) {
        toast({ title: 'Nothing to export', description: 'No active users found.', variant: 'destructive' });
        return;
      }
      const csv = serializeMatrixCsv(roleCodes, rows);
      downloadCsv(`iac-role-matrix-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast({ title: 'Exported', description: `${rows.length} employees × ${roleCodes.length} roles.` });
    } catch (e) {
      reportError('Export failed', e);
    }
  };

  const handleTemplate = async () => {
    try {
      const { roleCodes } = await exportMatrix.mutateAsync();
      downloadCsv('iac-role-matrix-template.csv', matrixTemplateCsv(roleCodes));
      toast({ title: 'Template downloaded' });
    } catch (e) {
      reportError('Template download failed', e);
    }
  };

  const recompute = async (csv: string, allowInact: boolean) => {
    setPreviewing(true);
    setDiff(null);
    try {
      const lookups = await loadLookups.mutateAsync();
      const validRoleCodes = Array.from(lookups.roleByCode.keys());
      const parsed = parseMatrixCsv(csv, validRoleCodes);
      const d = diffMatrix(parsed, lookups.userByEmail, lookups.userByCode, lookups.roleByCode, lookups.currentGlobal, allowInact);
      setDiff(d);
      if (d.unknownRoleColumns.length) {
        toast({
          title: 'Some role columns ignored',
          description: `Unknown role codes: ${d.unknownRoleColumns.join(', ')}`,
          variant: 'destructive',
        });
      }
    } catch (e) {
      reportError('Preview failed', e);
    } finally {
      setPreviewing(false);
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      reportError('File too large', new Error('Max 10MB'));
      return;
    }
    setApplyResult(null);
    try {
      const text = await file.text();
      setLastCsv(text);
      setFileName(file.name);
      await recompute(text, allowInactive);
      toast({ title: 'File loaded', description: file.name });
    } catch (e) {
      reportError('Could not read file', e);
    }
  };

  const onAllowInactiveChange = async (next: boolean) => {
    setAllowInactive(next);
    if (lastCsv) await recompute(lastCsv, next);
  };

  const handleApply = async () => {
    if (!diff) return;
    if (diff.toGrant.length + diff.toRevoke.length === 0) return;
    setApplyResult(null);
    try {
      const res = await applyDiff.mutateAsync({ diff, fileName: fileName ?? undefined });
      setApplyResult(res);
      const failed = res.failures.length;
      toast({
        title: failed === 0 ? 'Applied' : `Applied with ${failed} batch failure${failed === 1 ? '' : 's'}`,
        description: `Granted ${res.inserted} · Revoked ${res.deleted}${failed ? ' · See result panel.' : ''}`,
        variant: failed === 0 ? 'default' : 'destructive',
      });
      // Re-run preview against fresh state.
      if (lastCsv) await recompute(lastCsv, allowInactive);
    } catch (e) {
      reportError('Apply failed', e);
    }
  };

  const totalChanges = (diff?.toGrant.length ?? 0) + (diff?.toRevoke.length ?? 0);
  const blockingErrors = diff?.errors.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Download */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" />Download role matrix</CardTitle>
          <CardDescription>
            One row per active employee, one column per role. Cell value <code>Y</code> means the
            user has that role. Edit, save, and re-upload to grant or revoke in bulk.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={handleDownload} disabled={exportMatrix.isPending}>
            {exportMatrix.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download current matrix
          </Button>
          <Button onClick={handleTemplate} variant="outline" disabled={exportMatrix.isPending}>
            <FileDown className="h-4 w-4 mr-2" />Empty template (headers only)
          </Button>
        </CardContent>
      </Card>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" />Upload role matrix</CardTitle>
          <CardDescription>
            Lookup uses <code>email</code> first, then <code>employee_code</code>. Cells must be
            <code> Y</code> (grant) or blank/<code>N</code>/<code>-</code> (revoke). Only
            <code> scope_type=global</code> rows are touched — scoped assignments are preserved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />Choose CSV file
            </Button>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
            <label className="flex items-center gap-2 text-xs ml-auto">
              <Checkbox checked={allowInactive} onCheckedChange={(v) => void onAllowInactiveChange(Boolean(v))} />
              Include inactive users
            </label>
          </div>

          {previewing && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Computing diff…
            </div>
          )}

          {diff && (
            <div className="border rounded-md p-3 space-y-3 bg-muted/20">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Bucket icon={<CheckCircle2 className="h-3 w-3 text-emerald-600" />} label="To grant" count={diff.toGrant.length} />
                <Bucket icon={<AlertCircle className="h-3 w-3 text-amber-600" />} label="To revoke" count={diff.toRevoke.length} />
                <Bucket icon={<CheckCircle2 className="h-3 w-3 text-muted-foreground" />} label="Unchanged" count={diff.unchanged} />
                <Bucket icon={<AlertCircle className="h-3 w-3 text-destructive" />} label="Errors" count={diff.errors.length} />
              </div>

              {diff.unknownRoleColumns.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Unknown role columns ignored</AlertTitle>
                  <AlertDescription className="font-mono text-xs">{diff.unknownRoleColumns.join(', ')}</AlertDescription>
                </Alert>
              )}

              {diff.errors.length > 0 && (
                <details className="text-xs" open>
                  <summary className="cursor-pointer font-medium text-destructive">
                    Errors ({diff.errors.length})
                  </summary>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5 max-h-48 overflow-auto">
                    {diff.errors.slice(0, 200).map((e, i) => (
                      <li key={i}>
                        <span className="text-muted-foreground">Line {e.lineNo}:</span>{' '}
                        <span className="font-mono">{e.email || '∅'}</span> — {e.reason}
                      </li>
                    ))}
                    {diff.errors.length > 200 && <li>…and {diff.errors.length - 200} more</li>}
                  </ul>
                </details>
              )}

              {diff.toGrant.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-emerald-700">
                    Grants preview ({diff.toGrant.length})
                  </summary>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5 max-h-48 overflow-auto">
                    {diff.toGrant.slice(0, 200).map((g, i) => (
                      <li key={i}><span className="font-mono">{g.email}</span> ← <span className="font-medium">{g.role_code}</span></li>
                    ))}
                    {diff.toGrant.length > 200 && <li>…and {diff.toGrant.length - 200} more</li>}
                  </ul>
                </details>
              )}

              {diff.toRevoke.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium text-amber-700">
                    Revokes preview ({diff.toRevoke.length})
                  </summary>
                  <ul className="mt-1 ml-4 list-disc space-y-0.5 max-h-48 overflow-auto">
                    {diff.toRevoke.slice(0, 200).map((r, i) => (
                      <li key={i}><span className="font-mono">{r.email}</span> ✕ <span className="font-medium">{r.role_code}</span></li>
                    ))}
                    {diff.toRevoke.length > 200 && <li>…and {diff.toRevoke.length - 200} more</li>}
                  </ul>
                </details>
              )}
            </div>
          )}

          {applyResult && (
            <Alert variant={applyResult.failures.length === 0 ? 'default' : 'destructive'}>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>
                Result · Granted {applyResult.inserted} · Revoked {applyResult.deleted}
                {applyResult.failures.length > 0 ? ` · ${applyResult.failures.length} batch failure(s)` : ''}
              </AlertTitle>
              {applyResult.failures.length > 0 && (
                <AlertDescription>
                  <ul className="ml-4 list-disc text-xs mt-1">
                    {applyResult.failures.map((f, i) => (
                      <li key={i}>
                        Batch #{f.batchIndex} ({f.phase}, {f.size} rows): {f.reason}
                      </li>
                    ))}
                  </ul>
                </AlertDescription>
              )}
            </Alert>
          )}

          <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              {diff
                ? `${totalChanges} change${totalChanges === 1 ? '' : 's'} pending · ${blockingErrors} error${blockingErrors === 1 ? '' : 's'}`
                : 'Upload a CSV to see the diff.'}
            </p>
            <Button
              onClick={handleApply}
              disabled={applyDiff.isPending || !diff || totalChanges === 0}
              variant={diff && diff.toRevoke.length > 0 ? 'destructive' : 'default'}
            >
              {applyDiff.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Apply {totalChanges} change{totalChanges === 1 ? '' : 's'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------
// Long-form (advanced) flow — original implementation, scope-aware.
// ---------------------------------------------------------------------
function LongFormBulkTab() {
  const { toast } = useToast();
  const apply = useApplyBulk();
  const preview = usePreviewBulk();
  const exportMut = useExportAssignments();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [csv, setCsv] = useState<string>(() => templateCsv());
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedBulkRow[]>([]);
  const [previewResult, setPreviewResult] = useState<IacBulkPreview | null>(null);
  const [lastErrorReport, setLastErrorReport] = useState<Array<{ email: string; role_code: string; reason: string }>>([]);

  const invalidRows = parsedRows.filter((r) => r.issues.length > 0);
  const validRows = parsedRows.filter((r) => r.row !== null).map((r) => r.row!) as IacBulkAssignmentRow[];

  const reportError = (where: string, e: unknown) => {
    const msg = (e as Error)?.message ?? String(e);
    // eslint-disable-next-line no-console
    console.error(`[IAC.bulk] ${where}:`, e);
    toast({ title: where, description: msg, variant: 'destructive' });
  };

  const runParseAndPreview = async (text: string) => {
    setLastErrorReport([]);
    setPreviewResult(null);
    setParsedRows([]);
    try {
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) {
        setParseError('CSV is empty.');
        return;
      }
      const required = ['email', 'role_code'];
      const missing = required.filter((h) => !headers.includes(h));
      if (missing.length) {
        const msg = `Missing required header(s): ${missing.join(', ')}`;
        setParseError(msg);
        toast({ title: 'CSV parse failed', description: msg, variant: 'destructive' });
        return;
      }
      setParseError(null);
      const validated = rows.map((r, i) => validateBulkRow(r, i + 2));
      setParsedRows(validated);
      const valid = validated.filter((r) => r.row !== null).map((r) => r.row!) as IacBulkAssignmentRow[];
      if (valid.length === 0) {
        setPreviewResult({ ok: [], unknownUsers: [], unknownRoles: [], duplicates: [] });
        return;
      }
      try {
        const res = await preview.mutateAsync(valid);
        setPreviewResult(res);
      } catch (e) {
        setPreviewResult(null);
        reportError('Preview failed', e);
      }
    } catch (e) {
      setParseError((e as Error).message);
      reportError('CSV parse error', e);
    }
  };

  const onCsvChange = (text: string) => {
    setCsv(text);
    void runParseAndPreview(text);
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      reportError('File too large', new Error('Max 2MB'));
      return;
    }
    try {
      const text = await file.text();
      setCsv(text);
      await runParseAndPreview(text);
      toast({ title: 'File loaded', description: `${file.name} parsed.` });
    } catch (e) {
      reportError('Could not read file', e);
    }
  };

  const handleDownloadAll = async () => {
    try {
      const rows = await exportMut.mutateAsync();
      const csvText = serializeCsv(
        rows,
        ['email', 'role_code', 'scope_type', 'scope_id', 'expires_at', 'assigned_at'],
      );
      downloadCsv(`iac-assignments-${new Date().toISOString().slice(0, 10)}.csv`, csvText);
      toast({ title: 'Downloaded', description: `${rows.length} assignments exported.` });
    } catch (e) {
      reportError('Export failed', e);
    }
  };

  const handleDownloadTemplate = () => {
    try {
      downloadCsv('iac-template.csv', templateCsv());
      toast({ title: 'Template downloaded' });
    } catch (e) {
      reportError('Template download failed', e);
    }
  };

  const handleApply = async () => {
    const ready = previewResult?.ok ?? [];
    if (ready.length === 0) return;
    try {
      const res = await apply.mutateAsync(ready);
      // Build error report from skipped rows
      const skipped: Array<{ email: string; role_code: string; reason: string }> = [];
      invalidRows.forEach((r) =>
        r.issues.forEach((iss) =>
          skipped.push({ email: r.raw.email ?? '', role_code: r.raw.role_code ?? '', reason: issueLabel(iss) }),
        ),
      );
      (previewResult?.unknownUsers ?? []).forEach((r) =>
        skipped.push({ email: r.email, role_code: r.role_code, reason: issueLabel('unknown_user') }),
      );
      (previewResult?.unknownRoles ?? []).forEach((r) =>
        skipped.push({ email: r.email, role_code: r.role_code, reason: issueLabel('unknown_role') }),
      );
      (previewResult?.duplicates ?? []).forEach((r) =>
        skipped.push({ email: r.email, role_code: r.role_code, reason: issueLabel('duplicate') }),
      );
      setLastErrorReport(skipped);
      if (skipped.length === 0) {
        toast({ title: 'Bulk import done', description: `${res.inserted} assignments created.` });
      } else {
        toast({
          title: `${res.inserted} applied, ${skipped.length} skipped`,
          description: 'Download the error report for details.',
        });
      }
      // Refresh preview so applied rows now show as duplicates.
      await runParseAndPreview(csv);
    } catch (e) {
      reportError('Bulk import failed', e);
    }
  };

  const downloadErrorReport = () => {
    if (lastErrorReport.length === 0) return;
    try {
      const txt = serializeCsv(lastErrorReport, ['email', 'role_code', 'reason']);
      downloadCsv(`iac-bulk-errors-${Date.now()}.csv`, txt);
    } catch (e) {
      reportError('Error report download failed', e);
    }
  };

  const readyCount = previewResult?.ok.length ?? 0;

  return (
    <div className="space-y-4">
      {/* Download */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Download className="h-4 w-4" />Download</CardTitle>
          <CardDescription>
            Export every existing assignment, or grab an empty template. The export shape is
            round-trip-compatible with Upload.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button onClick={handleDownloadAll} disabled={exportMut.isPending} variant="default">
            {exportMut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Download Assignments CSV
          </Button>
          <Button onClick={handleDownloadTemplate} variant="outline">
            <FileDown className="h-4 w-4 mr-2" />
            Download Template CSV
          </Button>
        </CardContent>
      </Card>

      {/* Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4" />Upload</CardTitle>
          <CardDescription>
            Required columns: <code>email,role_code</code>. Optional: <code>scope_type,scope_id,expires_at</code>.
            Lines starting with <code>#</code> are ignored. Existing assignments are skipped server-side (idempotent).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => { void onFile(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />Choose CSV file
            </Button>
            <span className="text-xs text-muted-foreground">…or paste below</span>
          </div>

          <div>
            <Label htmlFor="iac-csv" className="text-xs">CSV content</Label>
            <Textarea
              id="iac-csv"
              value={csv}
              onChange={(e) => onCsvChange(e.target.value)}
              rows={8}
              className="font-mono text-xs mt-1"
            />
          </div>

          {parseError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>CSV parse error</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Preview buckets */}
          {!parseError && parsedRows.length > 0 && (
            <PreviewBuckets
              parsedTotal={parsedRows.length}
              invalid={invalidRows}
              preview={previewResult}
              previewing={preview.isPending}
            />
          )}

          <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
            <p className="text-xs text-muted-foreground">
              Parsed {parsedRows.length} rows · {validRows.length} valid · {readyCount} ready to apply
            </p>
            <div className="flex gap-2">
              {lastErrorReport.length > 0 && (
                <Button variant="outline" size="sm" onClick={downloadErrorReport}>
                  <FileDown className="h-4 w-4 mr-2" />Download error report ({lastErrorReport.length})
                </Button>
              )}
              <Button onClick={handleApply} disabled={apply.isPending || readyCount === 0}>
                {apply.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Apply {readyCount} assignment{readyCount === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewBuckets({
  parsedTotal, invalid, preview, previewing,
}: {
  parsedTotal: number;
  invalid: ParsedBulkRow[];
  preview: IacBulkPreview | null;
  previewing: boolean;
}) {
  const ready = preview?.ok ?? [];
  const unknownUsers = preview?.unknownUsers ?? [];
  const unknownRoles = preview?.unknownRoles ?? [];
  const duplicates = preview?.duplicates ?? [];

  return (
    <div className="border rounded-md p-3 space-y-3 bg-muted/20">
      <div className="flex items-center gap-2 text-xs">
        <span className="font-medium">Preview</span>
        {previewing && <Loader2 className="h-3 w-3 animate-spin" />}
        <span className="text-muted-foreground">({parsedTotal} parsed)</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <Bucket icon={<CheckCircle2 className="h-3 w-3 text-emerald-600" />} label="Ready" count={ready.length} />
        <Bucket icon={<AlertCircle className="h-3 w-3 text-amber-600" />} label="Already exists" count={duplicates.length} />
        <Bucket icon={<AlertCircle className="h-3 w-3 text-destructive" />} label="Unknown email" count={unknownUsers.length} />
        <Bucket icon={<AlertCircle className="h-3 w-3 text-destructive" />} label="Unknown role" count={unknownRoles.length} />
        <Bucket icon={<AlertCircle className="h-3 w-3 text-destructive" />} label="Invalid rows" count={invalid.length} />
      </div>

      {invalid.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-destructive">Invalid rows ({invalid.length})</summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {invalid.slice(0, 50).map((r) => (
              <li key={r.lineNo}>
                <span className="text-muted-foreground">Line {r.lineNo}:</span>{' '}
                <span className="font-mono">{r.raw.email || '∅'} / {r.raw.role_code || '∅'}</span>
                {' — '}
                {r.issues.map(issueLabel).join('; ')}
              </li>
            ))}
            {invalid.length > 50 && <li>…and {invalid.length - 50} more</li>}
          </ul>
        </details>
      )}
      {unknownUsers.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-destructive">Unknown emails ({unknownUsers.length})</summary>
          <ul className="mt-1 ml-4 list-disc">
            {unknownUsers.slice(0, 50).map((r, i) => <li key={i} className="font-mono">{r.email}</li>)}
          </ul>
        </details>
      )}
      {unknownRoles.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium text-destructive">Unknown role codes ({unknownRoles.length})</summary>
          <ul className="mt-1 ml-4 list-disc">
            {unknownRoles.slice(0, 50).map((r, i) => <li key={i} className="font-mono">{r.role_code}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function Bucket({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="border rounded p-2 bg-background flex items-center gap-2">
      {icon}
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
        <p className="font-semibold">{count}</p>
      </div>
    </div>
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