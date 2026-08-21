/**
 * ADR-309 — KPI Data Ledger: react-query bindings over the service layer.
 * No business logic lives here; roll-up and authorisation stay server-side.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  bulkImportLedgerRows, deleteLedgerRow, fetchLedgerBundle, fetchLedgerRows,
  fetchServerRollup, fetchValidationState, saveLedgerRow, upsertLedgerDef,
  validateLedgerPeriod,
  type BulkImportResult, type LedgerIdentity, type LedgerRowsPage,
  type SaveRowInput, type ServerRollup, type UpsertDefInput,
} from '@/services/orgKpiDataset/kpiLedgerService';
import type { LedgerBundle, LedgerValidation } from '@/lib/review/kpiLedgerModel';

const BUNDLE_KEY = 'org-kpi-ledger-bundle';
const ROWS_KEY = 'org-kpi-ledger-rows';
const ROLLUP_KEY = 'org-kpi-ledger-rollup';
const VALIDATION_KEY = 'org-kpi-ledger-validation';

export function useLedgerBundle(identity: Partial<LedgerIdentity>) {
  const { isReady, user } = useAuth();
  const { categoryId, kraName, kpiName } = identity;
  return useQuery({
    queryKey: [BUNDLE_KEY, categoryId, kraName, kpiName, user?.id],
    enabled: isReady && !!user && !!categoryId && !!kraName && !!kpiName,
    staleTime: 60_000,
    queryFn: (): Promise<LedgerBundle | null> =>
      fetchLedgerBundle({ categoryId: categoryId!, kraName: kraName!, kpiName: kpiName! }),
  });
}

export function useLedgerRows(args: {
  datasetId: string | undefined;
  reviewYear?: number | null;
  reviewPeriod?: string | null;
  page?: number;
  pageSize?: number;
  enabled?: boolean;
}) {
  const { isReady, user } = useAuth();
  const pageSize = args.pageSize ?? 100;
  const page = args.page ?? 0;
  return useQuery({
    queryKey: [ROWS_KEY, args.datasetId, args.reviewYear ?? null, args.reviewPeriod ?? null, page, pageSize, user?.id],
    enabled: isReady && !!user && !!args.datasetId && args.enabled !== false,
    staleTime: 30_000,
    queryFn: (): Promise<LedgerRowsPage> =>
      fetchLedgerRows({
        datasetId: args.datasetId!,
        reviewYear: args.reviewYear ?? null,
        reviewPeriod: args.reviewPeriod ?? null,
        limit: pageSize,
        offset: page * pageSize,
      }),
  });
}

export function useLedgerRollup(args: {
  datasetId: string | undefined;
  reviewYear: number | undefined;
  reviewPeriod?: string | null;
}) {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: [ROLLUP_KEY, args.datasetId, args.reviewYear, args.reviewPeriod ?? null, user?.id],
    enabled: isReady && !!user && !!args.datasetId && !!args.reviewYear,
    staleTime: 30_000,
    queryFn: (): Promise<ServerRollup> =>
      fetchServerRollup({
        datasetId: args.datasetId!,
        reviewYear: args.reviewYear!,
        reviewPeriod: args.reviewPeriod ?? null,
      }),
  });
}

export function useLedgerValidation(args: {
  datasetId: string | undefined;
  reviewYear: number | undefined;
  reviewPeriod: string | undefined;
}) {
  const { isReady, user } = useAuth();
  return useQuery({
    queryKey: [VALIDATION_KEY, args.datasetId, args.reviewYear, args.reviewPeriod, user?.id],
    enabled: isReady && !!user && !!args.datasetId && !!args.reviewYear && !!args.reviewPeriod,
    staleTime: 30_000,
    queryFn: (): Promise<LedgerValidation | null> =>
      fetchValidationState({
        datasetId: args.datasetId!,
        reviewYear: args.reviewYear!,
        reviewPeriod: args.reviewPeriod!,
      }),
  });
}

function useInvalidateLedger() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [ROWS_KEY] });
    qc.invalidateQueries({ queryKey: [ROLLUP_KEY] });
    qc.invalidateQueries({ queryKey: [VALIDATION_KEY] });
    qc.invalidateQueries({ queryKey: [BUNDLE_KEY] });
  };
}

export function useUpsertLedgerDef() {
  const invalidate = useInvalidateLedger();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: UpsertDefInput) => upsertLedgerDef(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Data table saved', description: 'The column design is live for this KPI.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not save the data table', description: err.message, variant: 'destructive' }),
  });
}

export function useSaveLedgerRow() {
  const invalidate = useInvalidateLedger();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: SaveRowInput) => saveLedgerRow(input),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Row saved', description: 'The entry was recorded with a new revision.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not save the row', description: err.message, variant: 'destructive' }),
  });
}

export function useDeleteLedgerRow() {
  const invalidate = useInvalidateLedger();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ rowId, reason }: { rowId: string; reason: string | null }) =>
      deleteLedgerRow(rowId, reason),
    onSuccess: () => {
      invalidate();
      toast({ title: 'Row removed', description: 'The removal is recorded in the change trail.' });
    },
    onError: (err: Error) =>
      toast({ title: 'Could not remove the row', description: err.message, variant: 'destructive' }),
  });
}

export function useBulkImportLedger() {
  const invalidate = useInvalidateLedger();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: { datasetId: string; rows: Array<Omit<SaveRowInput, 'datasetId'>>; dryRun: boolean }):
      Promise<BulkImportResult> => bulkImportLedgerRows(args),
    onSuccess: (res, vars) => {
      if (!vars.dryRun) {
        invalidate();
        toast({
          title: 'Import applied',
          description: `${res.created} added, ${res.updated} updated.`,
        });
      }
    },
    onError: (err: Error) =>
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' }),
  });
}

export function useValidateLedgerPeriod() {
  const invalidate = useInvalidateLedger();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (args: {
      datasetId: string; reviewYear: number; reviewPeriod: string;
      verdict: 'validated' | 'rejected'; note: string | null;
    }) => validateLedgerPeriod(args),
    onSuccess: (res) => {
      invalidate();
      toast({
        title: res.verdict === 'validated' ? 'Period validated' : 'Period rejected',
        description: `${res.row_count} row(s) covered by this decision.`,
      });
    },
    onError: (err: Error) =>
      toast({ title: 'Validation failed', description: err.message, variant: 'destructive' }),
  });
}
