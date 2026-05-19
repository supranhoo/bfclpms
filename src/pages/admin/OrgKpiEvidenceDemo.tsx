import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import {
  FileText, ExternalLink, X, Upload, RefreshCw, AlertTriangle,
  Users, Settings2,
} from 'lucide-react';
import { OrgKpiEvidenceStatusChip } from '@/components/admin/OrgKpiEvidenceStatusChip';
import { OrgKpiParityBadge } from '@/components/admin/OrgKpiParityBadge';
import { DistributionPreview } from '@/components/admin/EvidenceTargetPopover';
import type { OrgKpiEvidenceParityRow } from '@/hooks/useOrgKpiEvidenceFiles';
import type { OrgKpiEvidenceTargetingRow } from '@/hooks/useOrgKpiEvidenceFiles';

const MOCK_TARGETING: Record<string, OrgKpiEvidenceTargetingRow[]> = {
  s2: [
    { employee_id: 'e1', employee_name: 'Asha Patel',  department_id: 'd1', department_name: 'Plant A', kpi_id: 'k1', kpi_status: 'self_review', expected_files: [{ url:'#', label:'May 2026 production log', added_by:null, added_at:null },{ url:'#', label:'Plant-head sign-off PDF', added_by:null, added_at:null },{ url:'#', label:'Daily output trend (XLSX)', added_by:null, added_at:null }], current_urls: ['#','#','#'], drift_kind: 'in_sync' },
    { employee_id: 'e2', employee_name: 'Ravi Kumar',  department_id: 'd1', department_name: 'Plant A', kpi_id: 'k2', kpi_status: 'self_review', expected_files: [{ url:'#', label:'May 2026 production log', added_by:null, added_at:null },{ url:'#', label:'Plant-head sign-off PDF', added_by:null, added_at:null },{ url:'#', label:'Daily output trend (XLSX)', added_by:null, added_at:null }], current_urls: ['#','#','#'], drift_kind: 'in_sync' },
    { employee_id: 'e3', employee_name: 'Sara Nair',   department_id: 'd2', department_name: 'Plant B', kpi_id: 'k3', kpi_status: 'kra_set',    expected_files: [{ url:'#', label:'May 2026 production log', added_by:null, added_at:null },{ url:'#', label:'Plant-head sign-off PDF', added_by:null, added_at:null },{ url:'#', label:'Daily output trend (XLSX)', added_by:null, added_at:null }], current_urls: [], drift_kind: 'not_propagated' },
  ],
  s3: [
    { employee_id: 'e4', employee_name: 'Mahesh Iyer', department_id: 'd1', department_name: 'Plant A', kpi_id: 'k4', kpi_status: 'manager_check', expected_files: [{ url:'#', label:'Manning sheet — original', added_by:null, added_at:null },{ url:'#', label:'Manning sheet — revision v2', added_by:null, added_at:null }], current_urls: ['#'], drift_kind: 'missing_files' },
    { employee_id: 'e5', employee_name: 'Neha Sharma', department_id: 'd2', department_name: 'Plant B', kpi_id: 'k5', kpi_status: 'self_review',   expected_files: [{ url:'#', label:'Manning sheet — original', added_by:null, added_at:null }], current_urls: ['#'], drift_kind: 'in_sync' },
    { employee_id: 'e6', employee_name: 'Vikas Rao',   department_id: 'd2', department_name: 'Plant B', kpi_id: 'k6', kpi_status: 'self_review',   expected_files: [{ url:'#', label:'Manning sheet — original', added_by:null, added_at:null }], current_urls: ['#','#'], drift_kind: 'extra_files' },
  ],
};

/**
 * Static UI preview for the Org-KPI multi-file evidence + parity feature.
 * No DB calls — purely visual so reviewers can see how it will look in the
 * Org KPI Data Entry surface before live data flows through it.
 */

type DemoFile = { url: string; label: string; added_at: string };

const SCENARIOS: { id: string; title: string; kra: string; chip: number;
  parity: OrgKpiEvidenceParityRow; files: DemoFile[]; }[] = [
  {
    id: 's1',
    title: 'Costing : 3×100 TPD (after considering inventory shortage)',
    kra: 'Costing',
    chip: 0,
    parity: { okv_id: 's1', category_id: '', kra_name: 'Costing', kpi_name: '',
      total_emps: 8, in_sync: 0, drift_value: 0, drift_evidence: 0, not_propagated: 8 },
    files: [],
  },
  {
    id: 's2',
    title: 'Achieve FADs production target',
    kra: 'Achieve organization\'s production target',
    chip: 3,
    parity: { okv_id: 's2', category_id: '', kra_name: 'Production', kpi_name: '',
      total_emps: 12, in_sync: 12, drift_value: 0, drift_evidence: 0, not_propagated: 0 },
    files: [
      { url: '#', label: 'May 2026 production log',     added_at: '2026-05-12T09:00:00Z' },
      { url: '#', label: 'Plant-head sign-off PDF',     added_at: '2026-05-14T11:30:00Z' },
      { url: '#', label: 'Daily output trend (XLSX)',   added_at: '2026-05-15T08:15:00Z' },
    ],
  },
  {
    id: 's3',
    title: 'Adherence to Manning Norms',
    kra: 'Adherence to Monthly Budget',
    chip: 2,
    parity: { okv_id: 's3', category_id: '', kra_name: 'Budget', kpi_name: '',
      total_emps: 9, in_sync: 4, drift_value: 2, drift_evidence: 3, not_propagated: 0 },
    files: [
      { url: '#', label: 'Manning sheet — original',    added_at: '2026-05-10T10:00:00Z' },
      { url: '#', label: 'Manning sheet — revision v2', added_at: '2026-05-17T16:45:00Z' },
    ],
  },
];

export default function OrgKpiEvidenceDemo() {
  const [open, setOpen] = useState<string | null>(null);
  const active = SCENARIOS.find(s => s.id === open) ?? null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Org KPI — Evidence & Parity (UI Preview)</h1>
        <p className="text-sm text-muted-foreground">
          Static preview of the new evidence chip, parity badge, "Manage files" button and
          re-sync sheet on the Org KPI Data Entry card. No live data is touched.
        </p>
      </div>

      {SCENARIOS.map(sc => (
        <Card key={sc.id} className="border-l-4 border-l-primary/40">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-base">{sc.title}</CardTitle>
                <CardDescription className="text-xs">KRA: {sc.kra}</CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="gap-1 text-[10px]">
                  <Users className="h-3 w-3" /> {sc.parity.total_emps} employees
                </Badge>
                <OrgKpiEvidenceStatusChip count={sc.chip} onClick={() => setOpen(sc.id)} />
                <OrgKpiParityBadge parity={sc.parity} onClick={() => setOpen(sc.id)} />
                <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => setOpen(sc.id)}>
                  <Settings2 className="h-3 w-3 mr-1" /> Manage files
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            Org-wide scope · entered by data owner · propagates to {sc.parity.total_emps} mapped employees.
          </CardContent>
        </Card>
      ))}

      <Sheet open={!!active} onOpenChange={() => setOpen(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {active && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">Manage Supporting Files</SheetTitle>
                <SheetDescription className="text-xs">{active.title}</SheetDescription>
              </SheetHeader>

              <div className="space-y-3 mt-4">
                {active.files.length === 0 ? (
                  <Alert>
                    <AlertDescription className="text-xs">
                      No supporting files attached yet. Use the Upload button below to add one or more.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-2">
                    {active.files.map((f, idx) => (
                      <div key={idx} className="border rounded-md p-3 space-y-2 bg-muted/30">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <Input defaultValue={f.label} className="h-8 text-xs"
                                 placeholder="Label / caption" />
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            View <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                          <Button size="sm" variant="ghost"
                                  className="h-7 w-7 p-0 text-destructive">
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Added {new Date(f.added_at).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Upload className="h-3 w-3 mr-1" /> Add file(s)
                  </Button>
                  <Button size="sm" disabled>Save changes</Button>
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5" /> Distribution preview
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Which supporting file each mapped employee will receive (after per-file targeting).
                  </p>
                  <DistributionPreview rows={MOCK_TARGETING[active.id] ?? []} />
                </div>

                <Separator />

                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5" /> Re-sync to employee dashboards
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    After propagation, employees see a snapshot of the supporting files. Use these
                    actions to push updates without breaking the workflow.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline">Append new files only</Button>
                    <Button size="sm" variant="destructive">Replace + step back</Button>
                  </div>
                  <Alert className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 py-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                    <AlertDescription className="text-[11px] text-amber-800 dark:text-amber-300">
                      <strong>Append</strong> is safe at any stage — only adds new URLs.{' '}
                      <strong>Replace + step back</strong> overwrites employee evidence and returns
                      rows past self-review back to self-review for re-acknowledgement.
                    </AlertDescription>
                  </Alert>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}