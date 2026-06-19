import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FileDown, Loader2, FileSpreadsheet, FileText, Layers, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
import {
  useAnnualReviewExportConfig, canUseAnnualReviewExport,
} from '@/hooks/useAnnualReviewExportConfig';
import { useTemplate } from '@/hooks/annualReview/useAnnualReview';
import * as svc from '@/services/annualReview/annualReviewService';
import {
  buildBlankReviewerWorkbook, buildBulkResultsWorkbook, buildSeedingWorkbook,
  buildReviewerPdfBlob,
} from '@/services/annualReview/exports';
import { KraPreviewDialog } from '@/components/review/KraPreviewDialog';
import type { AnnualReviewCycle } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';

const EXCEL_CAP = 5000;
const PDF_CAP = 50;

interface Props {
  cycle: AnnualReviewCycle | null;
  /** Active filters mirrored from Admin toolbar — passed through to fetchAllInstancesForExport. */
  filters: {
    search?: string;
    status?: any;
    hasOverride?: boolean;
    departmentId?: string;
    businessUnitId?: string;
    managerId?: string;
  };
  /** Total rows currently matching filters (for cap checks). */
  total: number;
}

export function AnnualReviewExportMenu({ cycle, filters, total }: Props) {
  const { effectiveRole } = useAuth();
  const cfg = useAnnualReviewExportConfig();
  const { data: appSettings } = useAppSettings();
  const { data: templateForCycle } = useTemplate(undefined);

  const [busy, setBusy] = useState<null | string>(null);
  const [pdfPickerOpen, setPdfPickerOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfFileName, setPdfFileName] = useState('annual-review.pdf');
  const [previewOpen, setPreviewOpen] = useState(false);

  const canExcel = canUseAnnualReviewExport(cfg.excelRoles, effectiveRole);
  const canPdf = canUseAnnualReviewExport(cfg.pdfRoles, effectiveRole);

  if (cfg.isLoading || !cfg.isEnabled) return null;
  if (!canExcel && !canPdf) return null;

  const companyName = appSettings?.organization_name || undefined;
  const disabled = !cycle || total === 0 || !!busy;

  async function loadRows(): Promise<InstanceWithEmployee[]> {
    if (!cycle) return [];
    if (total > EXCEL_CAP) {
      throw new Error(`Result set has ${total} rows — exceeds export cap of ${EXCEL_CAP}. Narrow the filters.`);
    }
    return svc.fetchAllInstancesForExport({ cycleId: cycle.id, ...filters });
  }

  async function resolveTemplate(rows: InstanceWithEmployee[]) {
    const tid = svc.resolveTemplateId(rows[0]);
    if (!tid) throw new Error('No template resolved for the current cycle.');
    return svc.getTemplate(tid);
  }

  async function handleBlankExcel() {
    if (!cycle) return;
    setBusy('blank-excel');
    try {
      const rows = await loadRows();
      const tpl = await resolveTemplate(rows);
      const wb = buildBlankReviewerWorkbook({ cycle, template: tpl, rows });
      XLSX.writeFile(wb, `annual-review-blank_${cycle.review_year}.xlsx`);
      toast.success(`Generated blank template for ${rows.length} employee${rows.length === 1 ? '' : 's'}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  }

  async function handleBulkResults() {
    if (!cycle) return;
    setBusy('bulk');
    try {
      const rows = await loadRows();
      const stageScores = await svc.fetchInstanceStageScores(rows.map((r) => r.id));
      const tplIds = Array.from(new Set(rows.map((r) => svc.resolveTemplateId(r)).filter((x): x is string => !!x)));
      const tplList = await Promise.all(tplIds.map((tid) => svc.getTemplate(tid).catch(() => null)));
      const templatesById: Record<string, any> = {};
      for (const t of tplList) if (t) templatesById[t.id] = t;
      const wb = buildBulkResultsWorkbook({
        cycle, instances: rows, stageScores, templatesById, visibleColumns: cfg.visibleColumns,
      });
      XLSX.writeFile(wb, `annual-review-results_${cycle.review_year}.xlsx`);
      toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}.`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  }

  async function handleSeeding() {
    if (!cycle) return;
    setBusy('seed');
    try {
      const rows = await loadRows();
      const tpl = await resolveTemplate(rows);
      const wb = buildSeedingWorkbook({ cycle, template: tpl, rows });
      XLSX.writeFile(wb, `annual-review-seed_${cycle.review_year}.xlsx`);
      toast.success(`Generated seeding template (${rows.length * (tpl.sections.criteria?.length ?? 0)} rows).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  }

  function openPdfPicker() {
    if (total > PDF_CAP) {
      toast.error(`PDF export is limited to ${PDF_CAP} rows. Narrow the filters.`);
      return;
    }
    setPdfPickerOpen(true);
  }

  async function handlePdfFor(inst: InstanceWithEmployee) {
    if (!cycle) return;
    setBusy('pdf');
    try {
      const tid = svc.resolveTemplateId(inst);
      if (!tid) throw new Error('No template for this instance.');
      const tpl = await svc.getTemplate(tid);
      const responses = await svc.listResponses(inst.id).catch(() => []);
      const blob = buildReviewerPdfBlob({
        cycle, template: tpl, employee: inst.employee ?? {}, responses,
        companyName, showLogo: cfg.showLogo, showEmployeeDetails: cfg.showEmployeeDetails,
      });
      setPdfBlob(blob);
      setPdfFileName(
        `annual-review_${(inst.employee?.employee_code ?? 'employee').toString().replace(/\s+/g, '_')}_${cycle.review_year}.pdf`,
      );
      setPdfPickerOpen(false);
      setPreviewOpen(true);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(null); }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" disabled={disabled}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
            <span className="hidden sm:inline">Download</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Templates &amp; exports</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canExcel && (
            <DropdownMenuItem onClick={handleBlankExcel} disabled={!!busy}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Blank reviewer template (Excel)
            </DropdownMenuItem>
          )}
          {canPdf && (
            <DropdownMenuItem onClick={openPdfPicker} disabled={!!busy || total > PDF_CAP}>
              <FileText className="h-4 w-4 mr-2" />
              Blank reviewer template (PDF)
            </DropdownMenuItem>
          )}
          {canExcel && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleBulkResults} disabled={!!busy}>
                <ClipboardList className="h-4 w-4 mr-2" />
                Bulk results export (Excel)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSeeding} disabled={!!busy}>
                <Layers className="h-4 w-4 mr-2" />
                Cycle seeding template (Excel)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <EmployeePickerDialog
        open={pdfPickerOpen}
        onOpenChange={setPdfPickerOpen}
        cycle={cycle}
        filters={filters}
        onPick={handlePdfFor}
        busy={busy === 'pdf'}
      />

      <KraPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        pdfBlob={pdfBlob}
        fileName={pdfFileName}
      />
    </>
  );
}

/** Lightweight picker — loads rows once when opened, lets admin search/click one. */
function EmployeePickerDialog({
  open, onOpenChange, cycle, filters, onPick, busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cycle: AnnualReviewCycle | null;
  filters: Props['filters'];
  onPick: (inst: InstanceWithEmployee) => void;
  busy: boolean;
}) {
  const [rows, setRows] = useState<InstanceWithEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');

  async function load() {
    if (!cycle) return;
    setLoading(true);
    try {
      const r = await svc.fetchAllInstancesForExport({ cycleId: cycle.id, ...filters });
      setRows(r);
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setLoading(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (v && rows.length === 0) load(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose employee</DialogTitle>
          <DialogDescription>Generate a printable PDF for a single employee.</DialogDescription>
        </DialogHeader>
        <Input placeholder="Search name or code…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-2" />
        <div className="max-h-80 overflow-auto rounded-md border">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
            </div>
          ) : (
            rows
              .filter((r) => {
                if (!q.trim()) return true;
                const needle = q.trim().toLowerCase();
                return (r.employee?.full_name ?? '').toLowerCase().includes(needle)
                  || (r.employee?.employee_code ?? '').toLowerCase().includes(needle);
              })
              .slice(0, 100)
              .map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60 border-b last:border-b-0 disabled:opacity-50"
                  disabled={busy}
                  onClick={() => onPick(r)}
                >
                  <div className="font-medium">{r.employee?.full_name ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{r.employee?.employee_code ?? '—'}</div>
                </button>
              ))
          )}
          {!loading && rows.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">No employees in scope.</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}