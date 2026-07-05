import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Upload, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { parseBfclFormsWorkbook, type BfclParseResult } from '@/lib/annualReview/bfclFormsWorkbook';
import { commitBfclImport } from '@/services/annualReview/bfclFormsImport';

export function BfclFormsImportButton() {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<BfclParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const handleFile = async (file: File) => {
    try {
      setParseError(null);
      const buf = await file.arrayBuffer();
      const parsed = parseBfclFormsWorkbook(buf);
      if (!parsed.sheets.length) {
        toast.error('No parsable form sheets found. Expect sheets named "<BU> - (M|W) - <Dept>".');
        return;
      }
      setPlan(parsed);
      setOpen(true);
    } catch (e) {
      setParseError((e as Error).message);
      setOpen(true);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const commitMut = useMutation({
    mutationFn: async () => {
      if (!plan) throw new Error('No plan loaded');
      return commitBfclImport(plan);
    },
    onSuccess: (res) => {
      toast.success(
        `Imported ${res.criteriaUpserted} criteria, ${res.assignmentsUpserted} assignments, ${res.systemWeightsUpserted} system weights.`,
      );
      qc.invalidateQueries({ queryKey: ['annual-review-criteria-library'] });
      qc.invalidateQueries({ queryKey: ['annual-review-criteria-assignments'] });
      qc.invalidateQueries({ queryKey: ['annual-review-system-kpi-weights'] });
      setOpen(false);
      setPlan(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
      />
      <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()}>
        <FileSpreadsheet className="h-4 w-4" /> Import BFCL Forms Workbook
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setPlan(null); } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>BFCL Forms — import preview</DialogTitle>
            <DialogDescription>
              Review what will be written to the Criteria Library, Criteria Assignments, and System KPI Weights tables. Nothing is committed until you confirm.
            </DialogDescription>
          </DialogHeader>

          {parseError ? (
            <Alert variant="destructive">
              <AlertTitle>Parse error</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          ) : plan ? (
            <PreviewContent plan={plan} />
          ) : null}

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); setPlan(null); }}>Cancel</Button>
            <Button
              disabled={!plan || commitMut.isPending}
              onClick={() => commitMut.mutate()}
            >
              {commitMut.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Upload className="h-4 w-4 mr-2" />
              Commit import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PreviewContent({ plan }: { plan: BfclParseResult }) {
  const badSheets = useMemo(() => plan.sheets.filter((s) => s.warnings.length > 0), [plan]);

  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Forms" value={plan.sheets.length} />
        <Stat label="Criteria" value={plan.criteria.length} />
        <Stat label="Assignments" value={plan.assignments.length} />
        <Stat label="System weights" value={plan.systemWeights.length} />
        <Stat label="Warnings" value={plan.warnings.length} tone={plan.warnings.length ? 'warn' : 'ok'} />
      </div>

      {plan.warnings.length > 0 && (
        <Alert>
          <AlertTitle>Warnings ({plan.warnings.length})</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4 text-xs space-y-0.5 max-h-32 overflow-auto">
              {plan.warnings.slice(0, 40).map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div>
        <div className="text-sm font-semibold mb-1">Forms coverage</div>
        <div className="rounded-md border overflow-hidden max-h-64 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sheet</TableHead>
                <TableHead>BU</TableHead>
                <TableHead>Grade</TableHead>
                <TableHead>Dept</TableHead>
                <TableHead className="text-right">Crit Σ</TableHead>
                <TableHead className="text-right">Sys Σ</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plan.sheets.map((s) => (
                <TableRow key={s.sheetName}>
                  <TableCell className="font-mono text-xs">{s.sheetName}</TableCell>
                  <TableCell>{s.buCode}</TableCell>
                  <TableCell>{s.gradeBucket}</TableCell>
                  <TableCell>{s.deptName}</TableCell>
                  <TableCell className="text-right font-mono">{s.criteriaWeightSum}</TableCell>
                  <TableCell className="text-right font-mono">{s.systemWeightSum}</TableCell>
                  <TableCell>
                    {s.warnings.length
                      ? <Badge variant="destructive">{s.warnings.length} issue</Badge>
                      : <Badge variant="default">OK</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {(plan.eligibility.length > 0 || plan.selfReview.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plan.eligibility.length > 0 && (
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold mb-1">Eligibility gates parsed (informational)</div>
              <ul className="text-xs list-disc pl-4 space-y-0.5">
                {plan.eligibility.map((e, i) => <li key={i}>{e.label}</li>)}
              </ul>
              <p className="text-[10px] text-muted-foreground mt-1">
                Manage in the Eligibility settings panel — not overwritten by this import.
              </p>
            </div>
          )}
          {plan.selfReview.length > 0 && (
            <div className="rounded-md border p-3">
              <div className="text-xs font-semibold mb-1">Self-review fields parsed (informational)</div>
              <ul className="text-xs list-disc pl-4 space-y-0.5">
                {plan.selfReview.map((e, i) => <li key={i}>{e.label}</li>)}
              </ul>
              <p className="text-[10px] text-muted-foreground mt-1">
                Manage in the Self-Review Library — not overwritten by this import.
              </p>
            </div>
          )}
        </div>
      )}

      {badSheets.length > 0 && (
        <p className="text-xs text-amber-600">
          {badSheets.length} sheet(s) have weight-sum warnings. You can still commit — the template factory will block generation of individual forms whose criteria sum ≠ 100.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'warn' }) {
  return (
    <div className={`rounded-md border p-2 ${tone === 'warn' ? 'border-amber-500/40 bg-amber-500/5' : ''}`}>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className="font-mono text-lg">{value}</div>
    </div>
  );
}