/**
 * ADR-302 — "Central data" panel on the KPI detail modal.
 *
 * Visible only for KPIs registered in the central registry (ADR-301). Shows the
 * current value, target, evidence count and where the number sits in the
 * approval ladder, and exposes exactly the actions the server would accept for
 * the signed-in user. Nothing here bypasses the RPCs.
 */
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Paperclip, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useOrgKpiEvidenceFiles } from '@/hooks/useOrgKpiEvidenceFiles';
import { OrgKpiEvidenceManagerSheet } from '@/components/admin/OrgKpiEvidenceManagerSheet';
import {
  useIsOrgKpiDataOwner, useOrgKpiApprovalTrail, useOrgKpiCentralChain,
  useOrgKpiCentralRow, useOrgKpiFinalise,
} from '@/hooks/useOrgKpiCentralWorkflow';
import {
  CENTRAL_MODE_LABELS, CENTRAL_STAGE_LABELS, canProvide, resolveStage, stageSummary,
  type CentralActor,
} from '@/lib/review/centralApprovalModel';
import { CentralApprovalRail } from './CentralApprovalRail';
import { CentralValueEntryDialog } from './CentralValueEntryDialog';
import { CentralChainConfigDialog } from './CentralChainConfigDialog';
import type { KpiScoringModel } from '@/lib/kpiScoringModel';

interface Props {
  categoryId: string;
  kraName: string;
  kpiName: string;
  kpiTitle?: string | null;
  period: string;
  year: number;
  scoringModel?: KpiScoringModel | null;
}

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toLocaleString('en-IN');

export function CentralValuePanel({
  categoryId, kraName, kpiName, kpiTitle, period, year, scoringModel,
}: Props) {
  const { user, roles, isAdmin } = useAuth();
  const { toast } = useToast();
  const identity = { categoryId, kraName, kpiName };
  const { data: config, isLoading: chainLoading } = useOrgKpiCentralChain(identity);
  const { data: row, isLoading: rowLoading } = useOrgKpiCentralRow(
    identity, period, year, !!config?.is_central,
  );
  const { data: trail = [], isLoading: trailLoading } = useOrgKpiApprovalTrail(row?.id);
  const { data: isDataOwner = false } = useIsOrgKpiDataOwner(identity);
  const { data: evidence = [] } = useOrgKpiEvidenceFiles(row?.id);
  const finaliseMut = useOrgKpiFinalise();

  const [entryOpen, setEntryOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  if (chainLoading) {
    return (
      <section className="mb-4 space-y-2 rounded-md border p-4" aria-busy="true">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </section>
    );
  }

  if (!config?.authorized) return null;

  if (!config.is_central) {
    if (!isAdmin) return null;
    return (
      <section className="mb-4 rounded-md border border-dashed p-4 text-sm">
        <p className="font-medium">This KPI is not fed centrally.</p>
        <p className="mt-1 text-muted-foreground">
          Register it to have one designated provider enter the value and a fixed ladder approve it
          before it reaches employees.
        </p>
        <Button variant="outline" className="mt-3 h-10" onClick={() => setConfigOpen(true)}>
          <ShieldCheck className="mr-2 h-4 w-4" aria-hidden />
          Set up central approval
        </Button>
        <CentralChainConfigDialog
          open={configOpen}
          onOpenChange={setConfigOpen}
          categoryId={categoryId}
          kraName={kraName}
          kpiName={kpiName}
          config={config}
        />
      </section>
    );
  }

  const actor: CentralActor = {
    userId: user?.id ?? null,
    roles: roles ?? [],
    isAdmin,
    isDataOwner,
  };
  const stage = resolveStage(row);
  const mayProvide = canProvide(row, actor);
  const mayFinalise = isAdmin && stage === 'approved' && !!row;

  const runFinalise = async () => {
    if (!row) return;
    const dry = await finaliseMut.mutateAsync({ okvId: row.id, dryRun: true });
    if (dry?.ok === false) {
      toast({
        title: 'Cannot propagate',
        description: String(dry.reason ?? 'Rejected by the server.'),
        variant: 'destructive',
      });
      return;
    }
    const res = await finaliseMut.mutateAsync({ okvId: row.id, dryRun: false });
    if (res?.ok === false) {
      toast({
        title: 'Cannot propagate',
        description: String(res.reason ?? 'Rejected by the server.'),
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Propagated',
      description: `Applied to ${res.applied} employee${res.applied === 1 ? '' : 's'}` +
        (res.skipped ? `, ${res.skipped} skipped.` : '.'),
    });
  };

  return (
    <section className="mb-4 space-y-4 rounded-md border bg-muted/10 p-4">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-sm font-semibold">Central data</h3>
        <Badge variant={stage === 'propagated' ? 'secondary' : 'outline'}>
          {CENTRAL_STAGE_LABELS[stage]}
        </Badge>
        <span className="text-xs text-muted-foreground">{stageSummary(config.steps, row ?? null)}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {CENTRAL_MODE_LABELS[config.propagation_mode]}
          {config.cutoff_day ? ` · cut-off day ${config.cutoff_day}` : ''}
        </span>
      </header>

      {rowLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span>
            <span className="text-muted-foreground">Value </span>
            <strong>{fmt(row?.achieved_value)}</strong>
          </span>
          <span>
            <span className="text-muted-foreground">Target </span>
            {fmt(row?.target_value)}
          </span>
          <Button
            variant="ghost"
            className="h-10 px-2"
            onClick={() => setEvidenceOpen(true)}
            disabled={!row}
          >
            <Paperclip className="mr-2 h-4 w-4" aria-hidden />
            Evidence ({evidence.length})
          </Button>
          {stage === 'sent_back' && row?.sent_back_reason && (
            <span className="text-xs text-destructive">
              Sent back: {row.sent_back_reason}
            </span>
          )}
        </div>
      )}

      <CentralApprovalRail
        steps={config.steps}
        row={row ?? null}
        decisions={trail}
        actor={actor}
        isLoading={rowLoading || trailLoading}
      />

      <div className="flex flex-wrap gap-2">
        {mayProvide && (
          <Button className="h-10" onClick={() => setEntryOpen(true)} disabled={!row}>
            {stage === 'sent_back' ? 'Fix and resubmit' : 'Enter value & submit'}
          </Button>
        )}
        {mayFinalise && (
          <Button variant="secondary" className="h-10" onClick={runFinalise} disabled={finaliseMut.isPending}>
            {finaliseMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Propagate to mapped employees
          </Button>
        )}
        {isAdmin && (
          <Button variant="outline" className="h-10" onClick={() => setConfigOpen(true)}>
            Edit approval chain
          </Button>
        )}
      </div>

      <CentralValueEntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        row={row ?? null}
        kpiName={kpiTitle || kpiName}
        scoringModel={scoringModel}
        evidenceCount={evidence.length}
        onManageEvidence={() => { setEntryOpen(false); setEvidenceOpen(true); }}
      />

      <OrgKpiEvidenceManagerSheet
        open={evidenceOpen}
        onOpenChange={setEvidenceOpen}
        okvId={row?.id ?? null}
        kpiName={kpiTitle || kpiName}
      />

      <CentralChainConfigDialog
        open={configOpen}
        onOpenChange={setConfigOpen}
        categoryId={categoryId}
        kraName={kraName}
        kpiName={kpiName}
        config={config}
      />
    </section>
  );
}
