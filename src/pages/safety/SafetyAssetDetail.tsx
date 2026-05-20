import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, ShieldCheck, History, Wrench } from 'lucide-react';
import {
  useSafetyAsset,
  useAssetCalibrations,
  useRecordCalibration,
} from '@/hooks/useSafetyAssets';
import {
  SAFETY_ASSET_STATUS_LABEL,
  computeNextDueAt,
  validateCalibrationDraft,
} from '@/lib/safetyAssets';
import { AssetCalibrationBadge } from '@/components/safety/AssetCalibrationBadge';
import { format } from 'date-fns';
import { toast } from 'sonner';

/**
 * Asset detail with metadata, calibration history, and a "record calibration" form.
 * The form auto-suggests next_due_at from interval days, but the operator can override.
 */
export default function SafetyAssetDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: asset, isLoading } = useSafetyAsset(id);
  const { data: history = [] } = useAssetCalibrations(id);
  const record = useRecordCalibration();

  const [performedAt, setPerformedAt] = useState<string>(() =>
    new Date().toISOString().slice(0, 16),
  );
  const [nextDueAt, setNextDueAt] = useState<string>('');
  const [certUrl, setCertUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [performedByName, setPerformedByName] = useState('');

  if (isLoading || !asset) {
    return (
      <SafetySkeletonBlock variant="detail" />
    );
  }

  function autoNextDue() {
    if (!asset?.calibration_required || !asset.calibration_interval_days || !performedAt) return;
    const iso = new Date(performedAt).toISOString();
    setNextDueAt(computeNextDueAt(iso, asset.calibration_interval_days).slice(0, 16));
  }

  async function onRecord() {
    if (!asset) return;
    if (!asset.calibration_required) {
      toast.error('This asset is not calibration-tracked.');
      return;
    }
    const err = validateCalibrationDraft({
      performed_at: performedAt,
      next_due_at: nextDueAt,
    });
    if (err) { toast.error(err); return; }
    try {
      await record.mutateAsync({
        asset_id: asset.id,
        performed_at: new Date(performedAt).toISOString(),
        next_due_at: new Date(nextDueAt).toISOString(),
        certificate_url: certUrl.trim() || null,
        notes: notes.trim() || null,
        performed_by_name: performedByName.trim() || null,
      });
      toast.success('Calibration recorded.');
      setNotes('');
      setCertUrl('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to record calibration.');
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/safety/assets"><ArrowLeft className="h-4 w-4 mr-1" /> Back to register</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Wrench className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-[220px]">
              <CardTitle className="text-xl">
                {asset.asset_code} · {asset.name}
              </CardTitle>
              <CardDescription>
                {asset.category}
                {asset.location ? ` · ${asset.location}` : ''}
              </CardDescription>
            </div>
            <Badge variant="outline">{SAFETY_ASSET_STATUS_LABEL[asset.status]}</Badge>
            <AssetCalibrationBadge asset={asset} />
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <Meta label="Manufacturer" value={asset.manufacturer ?? '—'} />
          <Meta label="Model" value={asset.model ?? '—'} />
          <Meta label="Serial" value={asset.serial_no ?? '—'} />
          <Meta label="Install date" value={asset.install_date ?? '—'} />
          <Meta
            label="Calibration required"
            value={asset.calibration_required ? 'Yes' : 'No'}
          />
          <Meta
            label="Interval"
            value={asset.calibration_interval_days ? `${asset.calibration_interval_days} days` : '—'}
          />
          <Meta
            label="Last calibrated"
            value={asset.last_calibration_at
              ? format(new Date(asset.last_calibration_at), 'dd MMM yyyy HH:mm')
              : '—'}
          />
          <Meta
            label="Next due"
            value={asset.calibration_expires_at
              ? format(new Date(asset.calibration_expires_at), 'dd MMM yyyy HH:mm')
              : '—'}
          />
        </CardContent>
      </Card>

      {asset.calibration_required && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Record Calibration
            </CardTitle>
            <CardDescription>
              Updates the asset row and writes an audit log entry.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Performed at *</Label>
              <Input
                type="datetime-local"
                value={performedAt}
                onChange={(e) => setPerformedAt(e.target.value)}
                onBlur={autoNextDue}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Next due *</Label>
              <div className="flex gap-2">
                <Input
                  type="datetime-local"
                  value={nextDueAt}
                  onChange={(e) => setNextDueAt(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" onClick={autoNextDue}>
                  Auto
                </Button>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Performed by (name)</Label>
              <Input value={performedByName} onChange={(e) => setPerformedByName(e.target.value)} placeholder="External technician name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Certificate URL</Label>
              <Input value={certUrl} onChange={(e) => setCertUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="md:col-span-2 space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button onClick={onRecord} disabled={record.isPending}>
                {record.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Record Calibration
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <History className="h-4 w-4" /> Calibration History
          </CardTitle>
          <CardDescription>{history.length} record(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {history.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No calibrations recorded yet.</p>
          )}
          {history.map((c) => (
            <div key={c.id} className="p-3 rounded-lg border">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">
                  {format(new Date(c.performed_at), 'dd MMM yyyy HH:mm')}
                </span>
                <span className="text-muted-foreground">→ next due {format(new Date(c.next_due_at), 'dd MMM yyyy')}</span>
                {c.performed_by_name && (
                  <Badge variant="outline" className="text-[10px]">By {c.performed_by_name}</Badge>
                )}
                {c.certificate_url && (
                  <a href={c.certificate_url} target="_blank" rel="noreferrer" className="text-primary text-xs underline">
                    Certificate
                  </a>
                )}
              </div>
              {c.notes && (
                <div className="text-xs text-muted-foreground mt-1">{c.notes}</div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}