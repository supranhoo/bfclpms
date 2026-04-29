import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Wrench, Loader2, Search, ArrowRight } from 'lucide-react';
import { useSafetyAssets } from '@/hooks/useSafetyAssets';
import {
  SAFETY_ASSET_STATUSES,
  SAFETY_ASSET_STATUS_LABEL,
  CALIBRATION_BUCKET_LABEL,
  type SafetyAssetStatus,
  type CalibrationBucket,
  calibrationBucket,
} from '@/lib/safetyAssets';
import { AssetCalibrationBadge } from '@/components/safety/AssetCalibrationBadge';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

/**
 * Asset register list with filters by status, calibration bucket, and search.
 * Empty state guides the user to create the first asset.
 */
export default function SafetyAssets() {
  const [status, setStatus] = useState<SafetyAssetStatus | 'all'>('all');
  const [bucket, setBucket] = useState<CalibrationBucket | 'all'>('all');
  const [search, setSearch] = useState('');

  const { data: rows = [], isLoading } = useSafetyAssets({ status, bucket, search });

  const counters = useMemo(() => {
    const c = { ok: 0, t7: 0, t1: 0, overdue: 0 };
    for (const r of rows) c[calibrationBucket(r)] += 1;
    return c;
  }, [rows]);

  return (
    <div className="max-w-6xl mx-auto space-y-4">
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile label="On track"      value={counters.ok}      tone="default" />
        <SummaryTile label="Due in 7 days" value={counters.t7}      tone="secondary" />
        <SummaryTile label="Due tomorrow"  value={counters.t1}      tone="destructive" />
        <SummaryTile label="Overdue"       value={counters.overdue} tone="destructive" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Filters</CardTitle>
          <CardDescription>Narrow by status, calibration urgency, or text.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {SAFETY_ASSET_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{SAFETY_ASSET_STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bucket} onValueChange={(v) => setBucket(v as typeof bucket)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All calibration windows</SelectItem>
              <SelectItem value="ok">{CALIBRATION_BUCKET_LABEL.ok}</SelectItem>
              <SelectItem value="t7">{CALIBRATION_BUCKET_LABEL.t7}</SelectItem>
              <SelectItem value="t1">{CALIBRATION_BUCKET_LABEL.t1}</SelectItem>
              <SelectItem value="overdue">{CALIBRATION_BUCKET_LABEL.overdue}</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative md:col-span-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search code, name, location, serial…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-10 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading assets…
        </div>
      )}

      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <Wrench className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No assets match these filters yet.
            </p>
            <Button asChild>
              <Link to="/safety/assets/new">
                <Plus className="h-4 w-4 mr-2" /> Register the first asset
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!isLoading && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Register</CardTitle>
            <CardDescription>{rows.length} asset(s)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {rows.map((r) => (
              <Link
                key={r.id}
                to={`/safety/assets/${r.id}`}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {r.asset_code} · {r.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.category}
                    {r.location ? ` · ${r.location}` : ''}
                    {r.calibration_expires_at
                      ? ` · expires ${format(new Date(r.calibration_expires_at), 'dd MMM yyyy')}`
                      : ''}
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  {SAFETY_ASSET_STATUS_LABEL[r.status]}
                </Badge>
                <AssetCalibrationBadge asset={r} />
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: 'default' | 'secondary' | 'destructive';
}) {
  const toneCls =
    tone === 'destructive'
      ? 'text-destructive'
      : tone === 'secondary'
        ? 'text-foreground'
        : 'text-muted-foreground';
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${toneCls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}