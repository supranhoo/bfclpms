import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Database, Download, RotateCcw, HardDrive, Clock, AlertTriangle, Upload, CalendarClock, X } from 'lucide-react';
import { format } from 'date-fns';
import { SafetyDrillCard } from '@/components/admin/SafetyDrillCard';
import {
  useBackupLogs,
  useTriggerBackup,
  useTriggerRestore,
  useAutoBackupSetting,
  useDownloadBackup,
  useUploadAndRestore,
  useBackupSchedule,
  useUpdateBackupSchedule,
  type BackupSchedule,
} from '@/hooks/useBackups';

function formatBytes(bytes: number | null): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BackupRestoreTab() {
  const { data: backups, isLoading } = useBackupLogs();
  const triggerBackup = useTriggerBackup();
  const triggerRestore = useTriggerRestore();
  const downloadBackup = useDownloadBackup();
  const autoBackup = useAutoBackupSetting();
  const uploadRestore = useUploadAndRestore();
  const { data: savedSchedule, isLoading: scheduleLoading } = useBackupSchedule();
  const updateSchedule = useUpdateBackupSchedule();

  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [confirmUploadRestore, setConfirmUploadRestore] = useState(false);
  const [restoreWarnings, setRestoreWarnings] = useState<string[]>([]);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const [frequency, setFrequency] = useState<BackupSchedule['frequency']>('weekly');
  const [day, setDay] = useState('sunday');
  const [hour, setHour] = useState(2);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [scheduleInitialized, setScheduleInitialized] = useState(false);

  // Sync local state from saved schedule once loaded
  if (savedSchedule && !scheduleInitialized) {
    setFrequency(savedSchedule.frequency);
    setDay(savedSchedule.day);
    setHour(savedSchedule.hour);
    setDayOfMonth(savedSchedule.dayOfMonth);
    setScheduleInitialized(true);
  }

  const handleRestoreClick = (id: string) => {
    setRestoreId(id);
    setConfirmRestore(true);
  };

  const handleRestoreConfirm = () => {
    if (restoreId) {
      triggerRestore.mutate(restoreId);
    }
    setConfirmRestore(false);
    setRestoreId(null);
  };

  // Track restore results for warnings display
  useEffect(() => {
    if (triggerRestore.data?.errors?.length) {
      setRestoreWarnings(triggerRestore.data.errors);
    }
  }, [triggerRestore.data]);

  useEffect(() => {
    if (uploadRestore.data?.errors?.length) {
      setRestoreWarnings(uploadRestore.data.errors);
    }
  }, [uploadRestore.data]);

  const handleUploadFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadFile(file);
    setConfirmUploadRestore(true);
    if (uploadInputRef.current) uploadInputRef.current.value = '';
  };

  const handleUploadRestoreConfirm = () => {
    if (uploadFile) {
      uploadRestore.mutate(uploadFile);
    }
    setConfirmUploadRestore(false);
    setUploadFile(null);
  };

  const scheduleSummary = (() => {
    const h = String(hour).padStart(2, '0') + ':00 UTC';
    if (frequency === 'daily') return `Every day at ${h}`;
    if (frequency === 'weekly') return `Every ${day.charAt(0).toUpperCase() + day.slice(1)} at ${h}`;
    if (frequency === 'monthly') return `${dayOfMonth}${dayOfMonth === 1 ? 'st' : dayOfMonth === 2 ? 'nd' : dayOfMonth === 3 ? 'rd' : 'th'} of every month at ${h}`;
    return '';
  })();

  const handleSaveSchedule = () => {
    updateSchedule.mutate({ frequency, day, hour, dayOfMonth, enabled: autoBackup.enabled });
  };

  if (isLoading || autoBackup.isLoading || scheduleLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scheduled Backup Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            Scheduled Backup
          </CardTitle>
          <CardDescription>
            Configure automatic database backups on a recurring schedule.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Enable/disable toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="space-y-1">
              <Label htmlFor="auto-backup" className="text-base font-medium">
                Enable Scheduled Backup
              </Label>
              <p className="text-sm text-muted-foreground">
                {autoBackup.enabled ? scheduleSummary : 'Scheduled backups are disabled.'}
              </p>
            </div>
            <Switch
              id="auto-backup"
              checked={autoBackup.enabled}
              onCheckedChange={autoBackup.toggle}
              disabled={autoBackup.isToggling}
            />
          </div>

          {/* Schedule config (shown when enabled) */}
          {autoBackup.enabled && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-lg border bg-muted/30">
              {/* Frequency */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Frequency</Label>
                <Select value={frequency} onValueChange={(v) => setFrequency(v as BackupSchedule['frequency'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Day of week (weekly only) */}
              {frequency === 'weekly' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Day of Week</Label>
                  <Select value={day} onValueChange={setDay}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => (
                        <SelectItem key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Day of month (monthly only) */}
              {frequency === 'monthly' && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Day of Month</Label>
                  <Select value={String(dayOfMonth)} onValueChange={(v) => setDayOfMonth(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                        <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Hour */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Time (UTC)</Label>
                <Select value={String(hour)} onValueChange={(v) => setHour(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                      <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}:00</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Save button */}
              <div className="flex items-end">
                <Button
                  onClick={handleSaveSchedule}
                  disabled={updateSchedule.isPending}
                  className="w-full"
                >
                  {updateSchedule.isPending ? 'Saving...' : 'Save Schedule'}
                </Button>
              </div>
            </div>
          )}

        </CardContent>
      </Card>

      {/* Manual Backup & Restore Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Manual Backup & Restore
          </CardTitle>
          <CardDescription>
            Create on-demand snapshots or restore from an external backup file. Backups include all tables except authentication data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-1">
              <Button
                onClick={() => { triggerBackup.resetProgress(); triggerBackup.mutate(); }}
                disabled={triggerBackup.isPending}
              >
                <HardDrive className={`h-4 w-4 mr-2 ${triggerBackup.isPending ? 'animate-pulse' : ''}`} />
                {triggerBackup.isPending ? 'Creating Backup...' : 'Backup Now'}
              </Button>
              {triggerBackup.isPending && triggerBackup.progress.phase === 'batching' && (
                <span className="text-xs text-muted-foreground">
                  Batch {triggerBackup.progress.currentBatch}/{triggerBackup.progress.totalBatches} — {triggerBackup.progress.tablesProcessed} tables processed
                </span>
              )}
              {triggerBackup.isPending && triggerBackup.progress.phase === 'finalizing' && (
                <span className="text-xs text-muted-foreground">Finalizing backup...</span>
              )}
            </div>
            <input
              ref={uploadInputRef}
              type="file"
              className="hidden"
              accept=".json"
              onChange={handleUploadFileSelect}
            />
            <Button
              variant="outline"
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadRestore.isPending}
            >
              <Upload className={`h-4 w-4 mr-2 ${uploadRestore.isPending ? 'animate-pulse' : ''}`} />
              {uploadRestore.isPending ? 'Restoring...' : 'Upload & Restore'}
            </Button>
          </div>

          {/* Restore Warnings Alert */}
          {restoreWarnings.length > 0 && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="flex items-center justify-between">
                <span>Restore completed with {restoreWarnings.length} warning{restoreWarnings.length !== 1 ? 's' : ''}</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setRestoreWarnings([])}>
                  <X className="h-3 w-3" />
                </Button>
              </AlertTitle>
              <AlertDescription>
                <ul className="mt-2 space-y-1 text-xs list-disc pl-4">
                  {restoreWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Backup History
          </CardTitle>
          <CardDescription>
            {backups?.length ?? 0} backup{(backups?.length ?? 0) !== 1 ? 's' : ''} available
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!backups || backups.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No backups yet. Create your first backup above.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Tables</TableHead>
                  <TableHead>Rows</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {backups.map((backup) => (
                  <TableRow key={backup.id}>
                    <TableCell className="font-medium">
                      {format(new Date(backup.created_at), 'dd MMM yyyy, hh:mm a')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={backup.backup_type === 'scheduled' ? 'secondary' : backup.backup_type === 'uploaded' ? 'default' : 'outline'}>
                        {backup.backup_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          backup.status === 'completed'
                            ? 'default'
                            : backup.status === 'running'
                            ? 'secondary'
                            : backup.status === 'completed_with_errors'
                            ? 'outline'
                            : 'destructive'
                        }
                        className={
                          backup.status === 'completed_with_errors'
                            ? 'border-amber-500 text-amber-700 dark:text-amber-400'
                            : undefined
                        }
                        title={
                          backup.status === 'completed_with_errors' && backup.error_message
                            ? backup.error_message
                            : undefined
                        }
                      >
                        {backup.status === 'completed_with_errors' ? 'completed (warnings)' : backup.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatBytes(backup.file_size_bytes)}</TableCell>
                    <TableCell>{backup.tables_count ?? '—'}</TableCell>
                    <TableCell>{backup.total_rows ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {(backup.status === 'completed' || backup.status === 'completed_with_errors') && backup.file_path && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadBackup.mutate(backup.file_path!)}
                              disabled={downloadBackup.isPending}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestoreClick(backup.id)}
                              disabled={triggerRestore.isPending}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {(backup.status === 'failed' || backup.status === 'completed_with_errors') && backup.error_message && (
                          <span
                            className={`text-xs max-w-[200px] truncate ${
                              backup.status === 'completed_with_errors'
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-destructive'
                            }`}
                            title={backup.error_message}
                          >
                            {backup.error_message}
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Restore Confirmation Dialog */}
      <AlertDialog open={confirmRestore} onOpenChange={setConfirmRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Restore Database
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>This will replace ALL current data</strong> with the data from this backup.
              </p>
              <p>
                This action cannot be undone. All changes made since this backup was created will be lost.
                User authentication data will not be affected.
              </p>
              <p className="text-destructive font-medium">
                Are you absolutely sure you want to proceed?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRestoreConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Restore Database
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Upload & Restore Confirmation Dialog */}
      <AlertDialog open={confirmUploadRestore} onOpenChange={setConfirmUploadRestore}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Restore from Uploaded File
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>This will replace ALL current data</strong> with data from the uploaded file
                {uploadFile ? ` "${uploadFile.name}"` : ''}.
              </p>
              <p>
                This action cannot be undone. All current data will be lost.
                User authentication data will not be affected.
              </p>
              <p className="text-destructive font-medium">
                Are you absolutely sure you want to proceed?
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUploadRestoreConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Upload & Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Phase 1.5 — Safety backup→restore sandbox drill */}
      <SafetyDrillCard />
    </div>
  );
}
