import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Archive, Eye, Trash2 } from 'lucide-react';
import {
  useBackupRetentionPolicy,
  useUpdateBackupRetentionPolicy,
  useRunRetentionSweep,
  type RetentionPolicy,
  type RetentionSweepResult,
} from '@/hooks/useBackups';
import { DEFAULT_RETENTION_POLICY } from '@/lib/backup/retentionSelection';

function fmtBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function RetentionPolicyCard() {
  const { data: saved, isLoading } = useBackupRetentionPolicy();
  const update = useUpdateBackupRetentionPolicy();
  const runSweep = useRunRetentionSweep();

  const [form, setForm] = useState<RetentionPolicy>(DEFAULT_RETENTION_POLICY);
  const [initialized, setInitialized] = useState(false);
  const [preview, setPreview] = useState<RetentionSweepResult | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);

  useEffect(() => {
    if (saved && !initialized) {
      setForm(saved);
      setInitialized(true);
    }
  }, [saved, initialized]);

  const num = (v: string, fallback: number) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  const handleSave = () => update.mutate(form);

  const handlePreview = async () => {
    const r = await runSweep.mutateAsync({ preview: true });
    setPreview(r);
    setConfirmRun(true);
  };

  const handleConfirmRun = async () => {
    setConfirmRun(false);
    setPreview(null);
    await runSweep.mutateAsync({});
  };

  if (isLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="h-5 w-5" />
          Retention Policy
        </CardTitle>
        <CardDescription>
          Automatically prune old, failed, and partial backups to control storage usage.
          A daily sweep deletes snapshots according to the rules below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Enable */}
        <div className="flex items-center justify-between p-4 rounded-lg border">
          <div className="space-y-1">
            <Label htmlFor="ret-enabled" className="text-base font-medium">
              Enable Automatic Pruning
            </Label>
            <p className="text-sm text-muted-foreground">
              {form.enabled
                ? 'A daily sweep deletes backups matching the rules below.'
                : 'Automatic pruning is disabled. No backups will be deleted.'}
            </p>
          </div>
          <Switch
            id="ret-enabled"
            checked={form.enabled}
            onCheckedChange={(v) => setForm({ ...form, enabled: v })}
          />
        </div>

        {form.enabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border bg-muted/30">
            <div className="space-y-2">
              <Label htmlFor="kcd">Keep completed backups for (days)</Label>
              <Input
                id="kcd"
                type="number"
                min={0}
                value={form.keep_completed_days}
                onChange={(e) =>
                  setForm({ ...form, keep_completed_days: num(e.target.value, form.keep_completed_days) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kcm">Always keep at least (completed backups)</Label>
              <Input
                id="kcm"
                type="number"
                min={1}
                value={form.keep_completed_min_count}
                onChange={(e) =>
                  setForm({
                    ...form,
                    keep_completed_min_count: num(e.target.value, form.keep_completed_min_count),
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Floor wins over age. Recommended: ≥ 5.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="kpd">Keep partial backups for (days)</Label>
              <Input
                id="kpd"
                type="number"
                min={0}
                value={form.keep_partial_days}
                onChange={(e) =>
                  setForm({ ...form, keep_partial_days: num(e.target.value, form.keep_partial_days) })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="kfd">Keep failed backups for (days)</Label>
              <Input
                id="kfd"
                type="number"
                min={0}
                value={form.keep_failed_days}
                onChange={(e) =>
                  setForm({ ...form, keep_failed_days: num(e.target.value, form.keep_failed_days) })
                }
              />
            </div>

            <div className="sm:col-span-2 flex items-center justify-between p-3 rounded-md border bg-background">
              <div>
                <Label htmlFor="dry" className="font-medium">Dry run</Label>
                <p className="text-xs text-muted-foreground">
                  Log candidates but do not delete anything. Useful for testing a new policy.
                </p>
              </div>
              <Switch
                id="dry"
                checked={form.dry_run}
                onCheckedChange={(v) => setForm({ ...form, dry_run: v })}
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? 'Saving…' : 'Save Policy'}
          </Button>
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={runSweep.isPending || !form.enabled}
          >
            <Eye className="h-4 w-4 mr-2" />
            {runSweep.isPending ? 'Working…' : 'Run Now (Preview)'}
          </Button>
        </div>
      </CardContent>

      <AlertDialog open={confirmRun} onOpenChange={setConfirmRun}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Confirm retention sweep
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                {preview ? (
                  <>
                    <p>
                      <strong>{preview.candidate_count}</strong> backups match the current
                      policy and will be{' '}
                      <strong>{form.dry_run ? 'logged (dry run)' : 'permanently deleted'}</strong>.
                    </p>
                    {preview.candidate_count > 0 && (
                      <p className="text-sm">
                        Estimated storage freed:{' '}
                        <strong>
                          {fmtBytes(
                            preview.candidates.reduce(
                              (s, c) => s + (c.file_size_bytes ?? 0),
                              0,
                            ),
                          )}
                        </strong>
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Breakdown: completed={preview.candidates.filter((c) => c.reason === 'age_completed').length},
                      partial={preview.candidates.filter((c) => c.reason === 'age_partial').length},
                      failed={preview.candidates.filter((c) => c.reason === 'age_failed').length}
                    </p>
                  </>
                ) : (
                  <p>Loading preview…</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRun}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!preview || preview.candidate_count === 0}
            >
              {form.dry_run ? 'Run dry sweep' : 'Delete now'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}