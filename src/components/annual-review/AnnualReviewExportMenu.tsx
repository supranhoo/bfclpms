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
import * as svc from '@/services/annualReview/annualReviewService';
import {
  buildBlankReviewerWorkbook, buildBulkResultsWorkbook, buildSeedingWorkbook,
  buildReviewerPdfBlob,
} from '@/services/annualReview/exports';
import { buildOperationalReportWorkbook, type ProfileLite, type DeptLite, type BuLite } from '@/services/annualReview/operationalReport';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import type { AnnualReviewResponse, AnnualReviewerRole } from '@/types/annualReview';
import { KraPreviewDialog } from '@/components/review/KraPreviewDialog';
import type { AnnualReviewCycle } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';

const EXCEL_CAP = 5000;
const PDF_CAP = 50;
const IN_BATCH = 200;
const RESP_BATCH = 100;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db: any = supabase;

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
    pmsGrade?: string;
    level?: string;
  };
  /** Total rows currently matching filters (for cap checks). */
  total: number;
}

export function AnnualReviewExportMenu({ cycle, filters, total }: Props) {
  const { effectiveRole } = useAuth();
  const cfg = useAnnualReviewExportConfig();
  const { data: appSettings } = useAppSettings();
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

  async function handleOperationalReport() {
    if (!cycle) return;
    setBusy('ops-report');
    try {
      const rows = await loadRows();
      if (rows.length === 0) {
        toast.error('No employees in scope for the current filters.');
        return;
      }

      // Templates (batched via distinct template ids)
      const tplIds = Array.from(new Set(rows.map((r) => svc.resolveTemplateId(r)).filter((x): x is string => !!x)));
      const tplList = await Promise.all(tplIds.map((tid) => svc.getTemplate(tid).catch(() => null)));
      const templatesById: Record<string, any> = {};
      for (const t of tplList) if (t) templatesById[t.id] = t;

      // Stage scores (already .in() batched inside service)
      const stageScores = await svc.fetchInstanceStageScores(rows.map((r) => r.id));

      // Collect every profile id we need: employees + all reviewer FKs + finalized_by.
      const profileIds = new Set<string>();
      for (const r of rows) {
        for (const k of ['employee_id', 'manager_id', 'skip_id', 'dept_head_id', 'bu_head_id', 'hr_id', 'finalized_by'] as const) {
          const v = (r as any)[k];
          if (v) profileIds.add(v);
        }
      }
      const profilesById: Record<string, ProfileLite> = {};
      const pids = Array.from(profileIds);
      for (let i = 0; i < pids.length; i += IN_BATCH) {
        const slice = pids.slice(i, i + IN_BATCH);
        const { data, error } = await db
          .from('profiles')
          .select('id, full_name, employee_code, designation, department_id, pms_grade, level')
          .in('id', slice);
        if (error) throw error;
        for (const p of (data ?? []) as ProfileLite[]) profilesById[p.id] = p;
      }

      // Departments + BUs
      const deptIds = Array.from(new Set(
        Object.values(profilesById).map((p) => p.department_id).filter((x): x is string => !!x),
      ));
      const deptsById: Record<string, DeptLite> = {};
      for (let i = 0; i < deptIds.length; i += IN_BATCH) {
        const slice = deptIds.slice(i, i + IN_BATCH);
        const { data, error } = await db
          .from('departments')
          .select('id, name, business_unit_id')
          .in('id', slice);
        if (error) throw error;
        for (const d of (data ?? []) as DeptLite[]) deptsById[d.id] = d;
      }
      const buIds = Array.from(new Set(Object.values(deptsById).map((d) => d.business_unit_id).filter((x): x is string => !!x)));
      const buById: Record<string, BuLite> = {};
      if (buIds.length > 0) {
        const { data, error } = await db
          .from('business_units')
          .select('id, name')
          .in('id', buIds);
        if (error) throw error;
        for (const b of (data ?? []) as BuLite[]) buById[b.id] = b;
      }

      // Assignment rules (name lookup)
      const ruleIds = Array.from(new Set(rows.map((r) => r.assigned_rule_id).filter((x): x is string => !!x)));
      const rulesById: Record<string, { id: string; name: string | null }> = {};
      if (ruleIds.length > 0) {
        const { data, error } = await db
          .from('annual_review_assignment_rules')
          .select('id, name')
          .in('id', ruleIds);
        if (error) throw error;
        for (const r of (data ?? []) as { id: string; name: string | null }[]) rulesById[r.id] = r;
      }

      // Responses — RLS-heavy child table. Walk instance ids in RESP_BATCH batches,
      // paged via fetchAllPaged inside each batch to defeat the 1000-row PostgREST cap
      // (POLICY §110 / large-export-pagination-policy). Ordered by (instance_id, id)
      // so the range walk uses an index seek.
      const responsesByInstance: Record<string, AnnualReviewResponse[]> = {};
      const instIds = rows.map((r) => r.id);
      for (let i = 0; i < instIds.length; i += RESP_BATCH) {
        const slice = instIds.slice(i, i + RESP_BATCH);
        const batch = await fetchAllPaged<AnnualReviewResponse>((from, to) =>
          db.from('annual_review_responses')
            .select('id, instance_id, reviewer_id, reviewer_role, criteria_scores, qualitative_responses, evidence, weighted_score, submitted_at, is_locked, notes, created_at, updated_at')
            .in('instance_id', slice)
            .order('instance_id')
            .order('id')
            .range(from, to),
        );
        for (const r of batch) {
          (responsesByInstance[r.instance_id] ??= []).push(r);
        }
      }

      const wb = buildOperationalReportWorkbook({
        cycle, rows, stageScores, templatesById, profilesById, deptsById, buById,
        rulesById, responsesByInstance,
      });
      XLSX.writeFile(wb, `annual-review-operational-status_${cycle.review_year}.xlsx`);
      toast.success(`Exported operational report for ${rows.length} employee${rows.length === 1 ? '' : 's'}.`);
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
              <DropdownMenuItem onClick={handleOperationalReport} disabled={!!busy}>
                <ClipboardList className="h-4 w-4 mr-2" />
                Operational status report (Excel)
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