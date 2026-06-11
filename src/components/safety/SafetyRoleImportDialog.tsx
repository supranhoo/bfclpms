import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Upload, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseRoleImportCsv, type SafetyRoleImportRow, SAFETY_ROLE_CSV_HEADERS } from '@/lib/safetyRoleCsv';

interface RowResult {
  row: SafetyRoleImportRow;
  status: 'pending' | 'ok' | 'error';
  message?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function SafetyRoleImportDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [fileName, setFileName] = useState<string | null>(null);
  const [parseErrors, setParseErrors] = useState<{ line: number; message: string }[]>([]);
  const [results, setResults] = useState<RowResult[]>([]);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  const reset = () => { setFileName(null); setParseErrors([]); setResults([]); setRunning(false); setDone(false); };

  const handleFile = async (file: File) => {
    reset();
    setFileName(file.name);
    const text = await file.text();
    const { rows, errors } = parseRoleImportCsv(text);
    setParseErrors(errors);
    setResults(rows.map((r) => ({ row: r, status: 'pending' })));
  };

  const handleRun = async () => {
    if (results.length === 0) return;
    setRunning(true);
    const next = [...results];
    for (let i = 0; i < next.length; i++) {
      const { row } = next[i];
      try {
        // Resolve to profile id by employee_code (preferred) or email.
        let q = supabase.from('profiles').select('id, is_active').eq('is_active', true).limit(1);
        q = row.employee_code ? q.eq('employee_code', row.employee_code) : q.eq('email', row.email!);
        const { data: profile, error: pErr } = await q.maybeSingle();
        if (pErr) throw new Error(pErr.message);
        if (!profile) throw new Error('No active profile matched');
        const { data, error } = await supabase.functions.invoke('grant-safety-role', {
          body: { user_id: profile.id, role: row.role },
        });
        if (error) throw new Error((data as any)?.error || error.message);
        if ((data as any)?.error) throw new Error((data as any).error);
        next[i] = { ...next[i], status: 'ok', message: (data as any)?.auth_action === 'created' ? 'Login provisioned' : 'Granted' };
      } catch (e) {
        next[i] = { ...next[i], status: 'error', message: (e as Error).message };
      }
      setResults([...next]);
    }
    setRunning(false);
    setDone(true);
    qc.invalidateQueries({ queryKey: ['safety', 'user-roles'] });
    const okCount = next.filter((r) => r.status === 'ok').length;
    toast({ title: 'Import complete', description: `${okCount}/${next.length} rows succeeded.` });
  };

  const downloadTemplate = () => {
    const csv = `${SAFETY_ROLE_CSV_HEADERS.join(',')}\nE001,,worker\n,jane@example.com,supervisor\n`;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'safety-roles-template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!running) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bulk import Safety roles</DialogTitle>
          <DialogDescription>
            CSV with columns: <code>employee_code</code>, <code>email</code>, <code>role</code>. One of
            <code> employee_code</code> or <code>email</code> is required per row. Max 500 rows.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5 mr-1.5" /> Download template
            </Button>
            <label className="inline-flex">
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                disabled={running}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = ''; }}
              />
              <Button asChild size="sm" disabled={running}>
                <span className="cursor-pointer"><Upload className="h-3.5 w-3.5 mr-1.5" /> Choose CSV</span>
              </Button>
            </label>
            {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
          </div>

          {parseErrors.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{parseErrors.length} parse error(s)</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 text-xs max-h-32 overflow-auto">
                  {parseErrors.slice(0, 20).map((e, i) => (
                    <li key={i}>Line {e.line}: {e.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {results.length > 0 && (
            <div className="border rounded-md max-h-64 overflow-auto divide-y text-sm">
              {results.map((r, i) => (
                <div key={i} className="px-3 py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">
                      {r.row.employee_code || r.row.email} → {r.row.role}
                    </p>
                    {r.message && <p className={`text-xs ${r.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{r.message}</p>}
                  </div>
                  {r.status === 'pending' && <span className="text-xs text-muted-foreground">Pending</span>}
                  {r.status === 'ok' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {r.status === 'error' && <AlertTriangle className="h-4 w-4 text-destructive" />}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={running} onClick={() => onOpenChange(false)}>
            {done ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={handleRun} disabled={running || results.length === 0 || done}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            Grant {results.length} role{results.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}