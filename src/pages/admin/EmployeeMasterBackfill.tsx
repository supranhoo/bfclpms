import { useState, useMemo, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Upload, Loader2, CheckCircle2, AlertCircle, Download, ArrowLeft, Database } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

type RowStatus = 'existing' | 'to_insert' | 'conflict';

interface ReconciledRow {
  row_number: number;
  employee_code: string;
  full_name: string;
  email?: string | null;
  designation?: string | null;
  department?: string | null;
  business_unit?: string | null;
  level?: string | null;
  pms_grade?: string | null;
  location?: string | null;
  company?: string | null;
  reporting_manager_code?: string | null;
  mobile_number?: string | null;
  normalized_code: string;
  status: RowStatus;
  conflict_reason?: string;
  resolved: {
    department_id: string | null;
    company_id: string | null;
    location_id: string | null;
    reporting_manager_id: string | null;
    unresolved: string[];
  };
}

interface DryRunResponse {
  mode: 'dry_run';
  summary: { total: number; existing: number; to_insert: number; conflicts: number };
  rows: ReconciledRow[];
}

interface CommitResponse {
  mode: 'commit';
  summary: { total: number; existing: number; to_insert: number; conflicts: number; inserted: number; failed: number };
  failures: { row_number: number; employee_code: string; error: string }[];
  inserted_rows: { employee_code: string; full_name: string }[];
}

// Header normalization — map common Excel header variants to canonical keys.
const HEADER_MAP: Record<string, string> = {
  employee_code: 'employee_code', employeecode: 'employee_code', 'employee code': 'employee_code', code: 'employee_code', 'emp code': 'employee_code', 'emp_code': 'employee_code',
  full_name: 'full_name', fullname: 'full_name', name: 'full_name', 'employee name': 'full_name', 'emp name': 'full_name',
  email: 'email', 'email id': 'email', 'email_id': 'email',
  designation: 'designation', title: 'designation', position: 'designation',
  department: 'department', dept: 'department',
  business_unit: 'business_unit', businessunit: 'business_unit', 'business unit': 'business_unit', bu: 'business_unit',
  level: 'level', grade_level: 'level',
  pms_grade: 'pms_grade', 'pms grade': 'pms_grade', grade: 'pms_grade',
  location: 'location', 'work location': 'location',
  company: 'company',
  reporting_manager_code: 'reporting_manager_code', 'reporting manager': 'reporting_manager_code', 'manager code': 'reporting_manager_code', 'manager_code': 'reporting_manager_code',
  mobile_number: 'mobile_number', mobile: 'mobile_number', phone: 'mobile_number',
};

function canonicalize(key: string): string | null {
  const k = key.trim().toLowerCase();
  return HEADER_MAP[k] ?? null;
}

export default function EmployeeMasterBackfill() {
  const [file, setFile] = useState<File | null>(null);
  const [dryRun, setDryRun] = useState<DryRunResponse | null>(null);
  const [commit, setCommit] = useState<CommitResponse | null>(null);
  const [parsing, setParsing] = useState(false);
  const [running, setRunning] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const handleFile = async (f: File) => {
    setFile(f);
    setDryRun(null);
    setCommit(null);
    setParsing(true);
    try {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw: any[] = XLSX.utils.sheet_to_json(ws, { defval: null });
      // Normalize headers per row
      const normalized = raw.map((row, i) => {
        const out: any = { row_number: i + 2 }; // +2 = header row + 1-indexed
        for (const [k, v] of Object.entries(row)) {
          const canonical = canonicalize(k);
          if (canonical) out[canonical] = v == null ? null : String(v).trim();
        }
        return out;
      });
      setParsedRows(normalized);
      toast({ title: 'File parsed', description: `${normalized.length} rows ready for reconciliation.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Could not parse file', description: msg, variant: 'destructive' });
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const runDryRun = async () => {
    if (parsedRows.length === 0) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-employee-master', {
        body: { mode: 'dry_run', rows: parsedRows },
      });
      if (error) throw error;
      setDryRun(data as DryRunResponse);
      toast({ title: 'Reconciliation complete', description: `${data.summary.to_insert} new · ${data.summary.existing} existing · ${data.summary.conflicts} conflicts.` });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Reconciliation failed', description: msg, variant: 'destructive' });
    } finally {
      setRunning(false);
    }
  };

  const runCommit = async () => {
    setShowConfirm(false);
    if (parsedRows.length === 0) return;
    setCommitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-employee-master', {
        body: { mode: 'commit', rows: parsedRows },
      });
      if (error) throw error;
      setCommit(data as CommitResponse);
      toast({
        title: 'Backfill complete',
        description: `${data.summary.inserted} inserted · ${data.summary.failed} failed.`,
        variant: data.summary.failed > 0 ? 'destructive' : 'default',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({ title: 'Backfill failed', description: msg, variant: 'destructive' });
    } finally {
      setCommitting(false);
    }
  };

  const downloadConflicts = () => {
    if (!dryRun) return;
    const conflicts = dryRun.rows.filter(r => r.status === 'conflict');
    const ws = XLSX.utils.json_to_sheet(conflicts.map(r => ({
      row_number: r.row_number,
      employee_code: r.employee_code,
      full_name: r.full_name,
      reason: r.conflict_reason,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conflicts');
    XLSX.writeFile(wb, `backfill-conflicts-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const downloadFailures = () => {
    if (!commit) return;
    const ws = XLSX.utils.json_to_sheet(commit.failures);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Failures');
    XLSX.writeFile(wb, `backfill-failures-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const previewRows = useMemo(() => dryRun?.rows.slice(0, 200) ?? [], [dryRun]);

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-6xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/settings"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to Settings</Link>
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Database className="h-6 w-6 text-primary" />
          Employee Master Backfill
        </h1>
        <p className="text-muted-foreground mt-1">
          One-time recovery tool: re-upload the master file and the system will <strong>only insert employees that are missing</strong> from the database. Existing profiles are never modified.
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>How this works</AlertTitle>
        <AlertDescription className="space-y-1 text-sm mt-1">
          <div>1. Upload your master Excel file → system parses rows locally.</div>
          <div>2. Run <strong>Dry-Run Reconcile</strong> → preview which rows are new, already in DB, or have conflicts.</div>
          <div>3. Click <strong>Run Backfill</strong> → server inserts the missing rows in batches, with per-row error capture.</div>
          <div className="text-muted-foreground">Insert-only · Idempotent · Admin-only · Fully audit-logged.</div>
        </AlertDescription>
      </Alert>

      {/* Step 1: Upload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Step 1 · Upload master file</CardTitle>
          <CardDescription>Excel (.xlsx) with employee_code and full_name (required); designation, department, location, company, etc. (optional).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={parsing}>
              <Upload className="h-4 w-4 mr-1.5" />
              {file ? 'Change file' : 'Choose file'}
            </Button>
            {file && (
              <span className="text-sm text-muted-foreground">
                {file.name} · <strong>{parsedRows.length}</strong> rows parsed
              </span>
            )}
            {parsing && <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
        </CardContent>
      </Card>

      {/* Step 2: Dry run */}
      {parsedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Step 2 · Reconcile (dry-run)</CardTitle>
            <CardDescription>No data is written. Server compares uploaded rows against current profiles by normalized employee_code.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runDryRun} disabled={running || committing}>
              {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Run Dry-Run Reconcile
            </Button>

            {dryRun && (
              <>
                <div className="grid grid-cols-4 gap-3">
                  <StatCard label="Total" value={dryRun.summary.total} />
                  <StatCard label="Already in DB" value={dryRun.summary.existing} tone="muted" />
                  <StatCard label="Will insert" value={dryRun.summary.to_insert} tone="success" />
                  <StatCard label="Conflicts" value={dryRun.summary.conflicts} tone="destructive" />
                </div>

                {dryRun.summary.conflicts > 0 && (
                  <div className="flex justify-end">
                    <Button size="sm" variant="outline" onClick={downloadConflicts}>
                      <Download className="h-4 w-4 mr-1.5" />Download conflicts
                    </Button>
                  </div>
                )}

                <div className="rounded border max-h-[400px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-28">Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-32">Department</TableHead>
                        <TableHead className="w-28">Status</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRows.map((r) => (
                        <TableRow key={`${r.row_number}-${r.employee_code}`}>
                          <TableCell className="font-mono text-xs">{r.row_number}</TableCell>
                          <TableCell className="font-mono text-xs">{r.employee_code}</TableCell>
                          <TableCell className="text-xs">{r.full_name}</TableCell>
                          <TableCell className="text-xs">{r.department ?? '—'}</TableCell>
                          <TableCell>
                            {r.status === 'existing' && <Badge variant="secondary" className="text-xs">Existing</Badge>}
                            {r.status === 'to_insert' && <Badge className="text-xs">Will insert</Badge>}
                            {r.status === 'conflict' && <Badge variant="destructive" className="text-xs">Conflict</Badge>}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {r.conflict_reason ?? (r.resolved.unresolved.length > 0 ? `Soft-resolve: ${r.resolved.unresolved.join(', ')}` : '')}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {dryRun.rows.length > previewRows.length && (
                    <div className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/30">
                      Showing first {previewRows.length} of {dryRun.rows.length} rows.
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Commit */}
      {dryRun && dryRun.summary.to_insert > 0 && !commit && (
        <Card className="border-2 border-primary/30">
          <CardHeader>
            <CardTitle className="text-lg">Step 3 · Run Backfill</CardTitle>
            <CardDescription>
              Insert <strong>{dryRun.summary.to_insert}</strong> new profiles. Existing rows are not touched.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setShowConfirm(true)} disabled={committing}>
              {committing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Run Backfill ({dryRun.summary.to_insert} rows)
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {commit && (
        <Card className={`border-2 ${commit.summary.failed > 0 ? 'border-destructive/40' : 'border-primary/40'}`}>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              {commit.summary.failed > 0
                ? <AlertCircle className="h-5 w-5 text-destructive" />
                : <CheckCircle2 className="h-5 w-5 text-primary" />}
              Backfill Result
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Inserted" value={commit.summary.inserted} tone="success" />
              <StatCard label="Failed" value={commit.summary.failed} tone="destructive" />
              <StatCard label="Already in DB" value={commit.summary.existing} tone="muted" />
            </div>
            {commit.summary.failed > 0 && (
              <Button size="sm" variant="outline" onClick={downloadFailures}>
                <Download className="h-4 w-4 mr-1.5" />Download failure report
              </Button>
            )}
            <p className="text-sm text-muted-foreground">
              Refresh the dashboard or User Management page to see the recovered employees.
            </p>
          </CardContent>
        </Card>
      )}

      <ConfirmDestructiveDialog
        open={showConfirm}
        title="Run Employee Master Backfill?"
        description={`This will insert ${dryRun?.summary.to_insert ?? 0} new profile rows. Existing profiles will NOT be modified. The action is idempotent — re-running is safe.`}
        confirmLabel="Run Backfill"
        isLoading={committing}
        onConfirm={runCommit}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone?: 'success' | 'destructive' | 'muted' }) {
  const toneCls = tone === 'success'
    ? 'bg-primary/10 text-primary'
    : tone === 'destructive'
      ? 'bg-destructive/10 text-destructive'
      : tone === 'muted'
        ? 'bg-muted/50 text-muted-foreground'
        : 'bg-muted/30 text-foreground';
  return (
    <div className={`rounded-lg border p-3 text-center ${toneCls}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-80">{label}</div>
    </div>
  );
}
