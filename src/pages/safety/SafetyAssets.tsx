import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Plus, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useManualQuery, type ManualQueryFetcherArgs } from '@/hooks/useManualQuery';
import { SafetyFilterBar } from '@/components/safety/SafetyFilterBar';
import { SafetyDataTable } from '@/components/safety/SafetyDataTable';
import { SafetySkeletonBlock } from '@/components/safety/SafetySkeletonBlock';
import type { SafetyAssetRow } from '@/hooks/useSafetyAssets';
import {
  SAFETY_ASSET_STATUSES,
  SAFETY_ASSET_STATUS_LABEL,
  CALIBRATION_BUCKET_LABEL,
  type SafetyAssetStatus,
  type CalibrationBucket,
} from '@/lib/safetyAssets';
import { AssetCalibrationBadge } from '@/components/safety/AssetCalibrationBadge';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

/**
 * Asset register — POLICY §113 / ADR-050.
 * Filters first, click Search to load, server-side paginated.
 * Calibration bucket filter is applied client-side to the current page only,
 * since urgency depends on a derived field (calibration_expires_at vs now()).
 */

interface AssetFiltersDraft {
  status: SafetyAssetStatus | 'all';
  bucket: CalibrationBucket | 'all';
  search: string;
}

const INITIAL: AssetFiltersDraft = { status: 'all', bucket: 'all', search: '' };

async function fetchAssetsPage({
  filters, range,
}: ManualQueryFetcherArgs<AssetFiltersDraft>): Promise<{ rows: SafetyAssetRow[]; total: number }> {
  let q = supabase
    .from('safety_assets')
    .select('*', { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(range[0], range[1]);
  if (filters.status !== 'all') q = q.eq('status', filters.status);
  // Calibration bucket → server-side date predicate (no client-side filtering of paged results).
  if (filters.bucket !== 'all') {
    const now = new Date();
    const in1 = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const nowIso = now.toISOString();
    if (filters.bucket === 'overdue') q = q.lt('calibration_expires_at', nowIso);
    else if (filters.bucket === 't1') q = q.gte('calibration_expires_at', nowIso).lt('calibration_expires_at', in1);
    else if (filters.bucket === 't7') q = q.gte('calibration_expires_at', in1).lt('calibration_expires_at', in7);
    else if (filters.bucket === 'ok') q = q.gte('calibration_expires_at', in7);
  }
  const search = filters.search.trim();
  if (search.length >= 2) {
    q = q.or(
      `asset_code.ilike.%${search}%,name.ilike.%${search}%,location.ilike.%${search}%,serial_no.ilike.%${search}%`,
    );
  }
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: (data ?? []) as SafetyAssetRow[], total: count ?? 0 };
}

export default function SafetyAssets() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<AssetFiltersDraft>(INITIAL);

  const {
    rows, total, page, pageSize, totalPages,
    hasSubmitted, isLoading, isFetching,
    submit, reset, setPage, setPageSize,
  } = useManualQuery<SafetyAssetRow, AssetFiltersDraft>(
    ['safety', 'assets', 'list'],
    fetchAssetsPage,
  );

  const handleSubmit = () => submit(draft);
  const handleReset = () => { setDraft(INITIAL); reset(); };

  return (
    <div className="max-w-6xl mx-auto space-y-4 p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="p-3 rounded-xl bg-primary/10 text-primary">
          <Wrench className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-[220px]">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Safety Assets</h1>
          <p className="text-muted-foreground">
            Register, calibration history, and expiry alerts for safety-critical equipment.
          </p>
        </div>
        <Button asChild>
          <Link to="/safety/assets/new" className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> New Asset
          </Link>
        </Button>
      </div>

      <SafetyFilterBar
        onSubmit={handleSubmit}
        onReset={handleReset}
        isSubmitting={isFetching}
        description="Filter the asset register by status, calibration window, or free text. Click Search to load."
      >
        <Select value={draft.status} onValueChange={(v) => setDraft((d) => ({ ...d, status: v as AssetFiltersDraft['status'] }))}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {SAFETY_ASSET_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{SAFETY_ASSET_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={draft.bucket} onValueChange={(v) => setDraft((d) => ({ ...d, bucket: v as AssetFiltersDraft['bucket'] }))}>
          <SelectTrigger><SelectValue placeholder="Calibration window" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All calibration windows</SelectItem>
            <SelectItem value="ok">{CALIBRATION_BUCKET_LABEL.ok}</SelectItem>
            <SelectItem value="t7">{CALIBRATION_BUCKET_LABEL.t7}</SelectItem>
            <SelectItem value="t1">{CALIBRATION_BUCKET_LABEL.t1}</SelectItem>
            <SelectItem value="overdue">{CALIBRATION_BUCKET_LABEL.overdue}</SelectItem>
          </SelectContent>
        </Select>
        <Input
          placeholder="Search code, name, location, serial…"
          value={draft.search}
          onChange={(e) => setDraft((d) => ({ ...d, search: e.target.value }))}
        />
      </SafetyFilterBar>

      <SafetyDataTable
        title="Asset Register"
        hasSubmitted={hasSubmitted}
        isLoading={isLoading}
        rowCount={rows.length}
        total={total}
        page={page}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        loadingSkeleton={<SafetySkeletonBlock variant="list" />}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Calibration</TableHead>
              <TableHead>Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow
                key={r.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => navigate(`/safety/assets/${r.id}`)}
              >
                <TableCell className="font-mono text-xs">{r.asset_code}</TableCell>
                <TableCell className="max-w-[220px] truncate">{r.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.category}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.location ?? '—'}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="text-[10px]">
                    {SAFETY_ASSET_STATUS_LABEL[r.status]}
                  </Badge>
                </TableCell>
                <TableCell><AssetCalibrationBadge asset={r} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {r.calibration_expires_at
                    ? format(new Date(r.calibration_expires_at), 'dd MMM yyyy')
                    : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SafetyDataTable>
    </div>
  );
}