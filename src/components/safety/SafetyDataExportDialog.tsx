import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DATASETS, fetchDatasetRows, rowsToCsv, triggerCsvDownload, MAX_EXPORT_ROWS, type DatasetKey } from '@/lib/safetyDataExport';

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export default function SafetyDataExportDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [dataset, setDataset] = useState<DatasetKey>('incidents');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetched, setFetched] = useState(0);
  const [capped, setCapped] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setBusy(false); setFetched(0); setCapped(false); setError(null); };

  const handleExport = async () => {
    reset();
    setBusy(true);
    try {
      const { rows, columns, capped } = await fetchDatasetRows(dataset, {
        from: from || undefined,
        to: to || undefined,
        onProgress: (p) => setFetched(p.fetched),
      });
      setCapped(capped);
      if (rows.length === 0) {
        toast({ title: 'No rows', description: 'Dataset returned 0 rows for the chosen filters.' });
        setBusy(false);
        return;
      }
      const csv = rowsToCsv(columns, rows);
      triggerCsvDownload(`safety-${dataset}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast({ title: 'Export complete', description: `${rows.length.toLocaleString()} row(s) downloaded.` });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export Safety data</DialogTitle>
          <DialogDescription>
            Downloads RLS-filtered rows as CSV. Hard cap of {MAX_EXPORT_ROWS.toLocaleString()} rows per export.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Dataset</Label>
            <Select value={dataset} onValueChange={(v) => setDataset(v as DatasetKey)} disabled={busy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DATASETS.map((d) => (
                  <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="export-from">From (optional)</Label>
              <Input id="export-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="export-to">To (optional)</Label>
              <Input id="export-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy} />
            </div>
          </div>

          {busy && (
            <div className="text-xs text-muted-foreground">
              Fetched {fetched.toLocaleString()} row(s)…
            </div>
          )}

          {capped && !busy && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Result was capped at {MAX_EXPORT_ROWS.toLocaleString()} rows. Narrow the date range for a complete export.
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={handleExport} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}