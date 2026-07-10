import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, Download, Search } from 'lucide-react';
import {
  bulkAdd, bulkExclude, bulkRemap, bulkRestore, resolveEmployeeCodes, resultsToCsv,
  type ResolvedCode,
} from '@/services/annualReview/bulkAdmin';
import { useActiveCycle, useTemplates } from '@/hooks/useAnnualReview';

type Action = 'add' | 'remove' | 'remap' | 'restore';

export function BulkActionsTab() {
  const { data: cycle } = useActiveCycle();
  const { data: templates = [] } = useTemplates();
  const [action, setAction] = useState<Action>('remove');
  const [codesText, setCodesText] = useState('');
  const [reason, setReason] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const [resolving, setResolving] = useState(false);
  const [resolved, setResolved] = useState<ResolvedCode[] | null>(null);
  const [executing, setExecuting] = useState(false);
  const [results, setResults] = useState<Array<Record<string, unknown>> | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const codes = useMemo(
    () => Array.from(new Set(codesText.split(/[\s,]+/).map((c) => c.trim()).filter(Boolean))),
    [codesText],
  );

  const preview = useMemo(() => {
    if (!resolved) return null;
    const notFound = resolved.filter((r) => !r.employee_id);
    const withInstance = resolved.filter((r) => r.instance_id);
    const withoutInstance = resolved.filter((r) => r.employee_id && !r.instance_id);
    const eligibleExcludeOrRemap = withInstance.filter(
      (r) => r.overall_status === 'not_started' || r.overall_status === 'pending_self',
    );
    const lockedPastSelf = withInstance.filter(
      (r) => r.overall_status && r.overall_status !== 'not_started' &&
             r.overall_status !== 'pending_self' && r.overall_status !== 'excluded',
    );
    const excluded = withInstance.filter((r) => r.overall_status === 'excluded');
    return { notFound, withInstance, withoutInstance, eligibleExcludeOrRemap, lockedPastSelf, excluded };
  }, [resolved]);

  const canExecute = useMemo(() => {
    if (!preview) return false;
    if (action === 'add') return preview.withoutInstance.length > 0 && !!cycle;
    if (action === 'remove') return preview.eligibleExcludeOrRemap.length > 0 && reason.trim().length >= 3;
    if (action === 'remap') return preview.eligibleExcludeOrRemap.length > 0 && !!templateId && reason.trim().length >= 3;
    if (action === 'restore') return preview.excluded.length > 0 && reason.trim().length >= 3;
    return false;
  }, [action, preview, reason, templateId, cycle]);

  const handleResolve = async () => {
    if (!cycle) { toast.error('No active cycle'); return; }
    if (codes.length === 0) { toast.error('Paste at least one employee code'); return; }
    if (codes.length > 500) { toast.error('Max 500 codes per batch'); return; }
    setResolving(true); setResults(null);
    try {
      const rows = await resolveEmployeeCodes(codes, cycle.id);
      setResolved(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Resolve failed');
    } finally {
      setResolving(false);
    }
  };

  const handleExecute = async () => {
    if (!cycle || !preview) return;
    setExecuting(true);
    try {
      if (action === 'add') {
        const empIds = preview.withoutInstance.map((r) => r.employee_id!);
        const res = await bulkAdd(empIds, cycle.id);
        const byId = new Map(preview.withoutInstance.map((r) => [r.employee_id!, r]));
        setResults(res.map((r) => ({
          employee_code: byId.get(r.employee_id)?.code ?? '',
          name: byId.get(r.employee_id)?.full_name ?? '',
          action: 'add',
          status: r.status,
          message: r.message ?? '',
        })));
        toast.success(`Added ${res.filter((r) => r.status === 'created').length} employees`);
      } else if (action === 'remove') {
        const ids = preview.eligibleExcludeOrRemap.map((r) => r.instance_id!);
        const res = await bulkExclude(ids, reason);
        const byId = new Map(preview.eligibleExcludeOrRemap.map((r) => [r.instance_id!, r]));
        setResults(res.map((r) => ({
          employee_code: byId.get(r.instance_id)?.code ?? '',
          name: byId.get(r.instance_id)?.full_name ?? '',
          action: 'remove',
          status: r.status,
          message: r.message ?? '',
        })));
        toast.success(`Excluded ${res.filter((r) => r.status === 'excluded').length} employees`);
      } else if (action === 'remap') {
        const ids = preview.eligibleExcludeOrRemap.map((r) => r.instance_id!);
        const res = await bulkRemap(ids, templateId, reason);
        const byId = new Map(preview.eligibleExcludeOrRemap.map((r) => [r.instance_id!, r]));
        setResults(res.map((r) => ({
          employee_code: byId.get(r.instance_id)?.code ?? '',
          name: byId.get(r.instance_id)?.full_name ?? '',
          action: 'remap',
          status: r.status,
          message: r.message ?? '',
        })));
        toast.success(`Re-mapped ${res.filter((r) => r.status === 'remapped').length} employees`);
      } else {
        const ids = preview.excluded.map((r) => r.instance_id!);
        const res = await bulkRestore(ids, reason);
        const byId = new Map(preview.excluded.map((r) => [r.instance_id!, r]));
        setResults(res.map((r) => ({
          employee_code: byId.get(r.instance_id)?.code ?? '',
          name: byId.get(r.instance_id)?.full_name ?? '',
          action: 'restore',
          status: r.status,
          message: r.message ?? '',
        })));
        toast.success(`Restored ${res.filter((r) => r.status === 'restored').length} employees`);
      }
      setResolved(null); setCodesText('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Execution failed');
    } finally {
      setExecuting(false); setConfirmOpen(false);
    }
  };

  const downloadCsv = () => {
    if (!results) return;
    const csv = resultsToCsv(results);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `annual-review-bulk-${action}-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Bulk actions — Annual Review</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Add, remove, or re-map a group of employees on the active cycle
            {cycle ? <> (<strong>{cycle.name}</strong>)</> : ''}. Remove and re-map only affect
            employees still in <code>not_started</code> or <code>pending_self</code>. Restore
            re-includes previously excluded employees. HR/Admin only.
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Action</Label>
              <Select value={action} onValueChange={(v) => { setAction(v as Action); setResults(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add employees to cycle</SelectItem>
                  <SelectItem value="remove">Remove (exclude) from cycle</SelectItem>
                  <SelectItem value="restore">Restore (re-include) to cycle</SelectItem>
                  <SelectItem value="remap">Re-map to template</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {action === 'remap' && (
              <div className="md:col-span-2">
                <Label>Target template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Choose template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div>
            <Label>Employee codes (one per line, comma or space separated, max 500)</Label>
            <Textarea
              rows={6}
              value={codesText}
              onChange={(e) => { setCodesText(e.target.value); setResolved(null); setResults(null); }}
              placeholder="EMP001&#10;EMP002&#10;SK105"
              className="font-mono text-xs"
            />
            <div className="text-xs text-muted-foreground mt-1">{codes.length} unique codes</div>
          </div>

          {(action === 'remove' || action === 'remap' || action === 'restore') && (
            <div>
              <Label>Reason (min 3 chars, saved to audit log)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleResolve} disabled={resolving || codes.length === 0}>
              {resolving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Preview
            </Button>
            <Button
              variant="default"
              onClick={() => setConfirmOpen(true)}
              disabled={!canExecute || executing}
            >
              {executing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Execute
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader><CardTitle>Preview</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="outline">Total: {resolved!.length}</Badge>
              <Badge variant="outline">Not found: {preview.notFound.length}</Badge>
              <Badge variant="outline">Without instance: {preview.withoutInstance.length}</Badge>
              <Badge variant="outline">With instance: {preview.withInstance.length}</Badge>
              <Badge variant="default">Eligible (not_started / pending_self): {preview.eligibleExcludeOrRemap.length}</Badge>
              <Badge variant="destructive">Locked past self: {preview.lockedPastSelf.length}</Badge>
              <Badge variant="secondary">Already excluded: {preview.excluded.length}</Badge>
            </div>
            <div className="max-h-80 overflow-auto rounded border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Code</TableHead><TableHead>Name</TableHead>
                    <TableHead>Current status</TableHead><TableHead>Will do</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {resolved!.map((r) => {
                    let willDo = '—';
                    if (!r.employee_id) willDo = 'skip: not found';
                    else if (action === 'add') {
                      willDo = r.instance_id ? 'skip: already in cycle' : 'add';
                    } else if (action === 'restore') {
                      if (!r.instance_id) willDo = 'skip: no instance (use Add)';
                      else if (r.overall_status === 'excluded') willDo = 'restore';
                      else willDo = `skip: not excluded (${r.overall_status ?? '—'})`;
                    } else if (r.overall_status === 'excluded') {
                      willDo = 'skip: already excluded';
                    } else if (!r.instance_id) {
                      willDo = 'skip: no instance';
                    } else if (r.overall_status !== 'not_started' && r.overall_status !== 'pending_self') {
                      willDo = 'skip: past self stage';
                    } else {
                      willDo = action === 'remove' ? 'exclude' : 're-map';
                    }
                    return (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono text-xs">{r.code}</TableCell>
                        <TableCell>{r.full_name ?? '—'}</TableCell>
                        <TableCell className="text-xs">{r.overall_status ?? '—'}</TableCell>
                        <TableCell className="text-xs">{willDo}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {results && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Result</CardTitle>
            <Button size="sm" variant="outline" onClick={downloadCsv}>
              <Download className="h-4 w-4 mr-2" />Download CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-80 overflow-auto rounded border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Code</TableHead><TableHead>Name</TableHead>
                    <TableHead>Status</TableHead><TableHead>Message</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{String(r.employee_code)}</TableCell>
                      <TableCell>{String(r.name)}</TableCell>
                      <TableCell><Badge variant="outline">{String(r.status)}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{String(r.message ?? '')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk {action}</AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'add' && `Add ${preview?.withoutInstance.length ?? 0} employees to the active cycle.`}
              {action === 'remove' && `Exclude ${preview?.eligibleExcludeOrRemap.length ?? 0} employees. Their reviews will be marked "Excluded" but the employees stay active in the system.`}
              {action === 'remap' && `Re-map ${preview?.eligibleExcludeOrRemap.length ?? 0} employees to the selected template.`}
              {' '}This action is audit-logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={executing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleExecute} disabled={executing}>
              {executing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default BulkActionsTab;