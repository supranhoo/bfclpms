import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, Upload, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AnnualReviewTemplate, AnnualReviewCycle } from '@/types/annualReview';
import * as svc from '@/services/annualReview/annualReviewService';

/**
 * Bulk system-score uploader.
 * - Exports an Excel template with columns: Employee Code, Full Name,
 *   one column per template.sections.system_scores entry,
 *   one column per template.sections.eligibility_criteria entry.
 * - On import, maps rows by Employee Code → annual_review_instances.id
 *   and updates `system_scores` / `eligibility_inputs` JSONB columns.
 */
export function SystemScoresUploadDialog({
  open,
  onOpenChange,
  template,
  cycle,
  rows,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: AnnualReviewTemplate;
  cycle: AnnualReviewCycle;
  rows: svc.InstanceWithEmployee[];
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const systemCols = template.sections.system_scores ?? [];
  const eligCols = template.sections.eligibility_criteria ?? [];

  const handleExport = () => {
    const headers = ['Employee Code', 'Full Name', ...systemCols.map((s) => s.name), ...eligCols.map((c) => c.name)];
    const data = rows.map((r) => {
      const base: Record<string, unknown> = {
        'Employee Code': r.employee?.employee_code ?? '',
        'Full Name': r.employee?.full_name ?? '',
      };
      for (const s of systemCols) base[s.name] = r.system_scores?.[s.id] ?? '';
      for (const c of eligCols) base[c.name] = (r.eligibility_inputs as Record<string, unknown>)?.[c.id] ?? '';
      return base;
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Annual Review');
    XLSX.writeFile(wb, `annual-review-${cycle.review_year}-system-scores.xlsx`);
  };

  const handleImport = async (file: File) => {
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      let updated = 0;
      for (const rec of records) {
        const code = String(rec['Employee Code'] ?? '').trim();
        if (!code) continue;
        const inst = rows.find((r) => (r.employee?.employee_code ?? '') === code);
        if (!inst) continue;
        const system_scores: Record<string, number> = { ...(inst.system_scores ?? {}) };
        for (const s of systemCols) {
          const v = rec[s.name];
          if (v !== null && v !== undefined && v !== '') system_scores[s.id] = Number(v);
        }
        const eligibility_inputs: Record<string, unknown> = { ...(inst.eligibility_inputs ?? {}) };
        for (const c of eligCols) {
          const v = rec[c.name];
          if (v !== null && v !== undefined && v !== '') eligibility_inputs[c.id] = v;
        }
        await svc.updateInstance(inst.id, { system_scores, eligibility_inputs });
        updated++;
      }
      toast.success(`Updated ${updated} instance${updated === 1 ? '' : 's'}.`);
      onDone?.();
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk system-score upload</DialogTitle>
          <DialogDescription>
            Download the template, fill in scores for each employee using their code, and upload to apply.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button variant="outline" onClick={handleExport} className="gap-2">
            <Download className="h-4 w-4" /> Download template ({rows.length} rows)
          </Button>
          <label className="inline-flex items-center gap-2 h-10 px-3 rounded-md border bg-background hover:bg-muted/50 cursor-pointer text-sm">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span>Upload completed spreadsheet</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.currentTarget.value = '';
                if (f) handleImport(f);
              }}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}