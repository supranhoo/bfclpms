import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
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
import { Database, Download, RotateCcw, HardDrive, Clock, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import {
  useBackupLogs,
  useTriggerBackup,
  useTriggerRestore,
  useAutoBackupSetting,
  useDownloadBackup,
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

  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

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

  if (isLoading || autoBackup.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Backups
          </CardTitle>
          <CardDescription>
            Create full database backups and restore from previous snapshots. Backups include all tables except authentication data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Auto-backup toggle */}
          <div className="flex items-center justify-between p-4 rounded-lg border">
            <div className="space-y-1">
              <Label htmlFor="auto-backup" className="text-base font-medium">
                Scheduled Weekly Backup
              </Label>
              <p className="text-sm text-muted-foreground">
                Automatically create a backup every Sunday at 2:00 AM UTC.
              </p>
            </div>
            <Switch
              id="auto-backup"
              checked={autoBackup.enabled}
              onCheckedChange={autoBackup.toggle}
              disabled={autoBackup.isToggling}
            />
          </div>

          {/* Manual backup button */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => triggerBackup.mutate()}
              disabled={triggerBackup.isPending}
            >
              <HardDrive className={`h-4 w-4 mr-2 ${triggerBackup.isPending ? 'animate-pulse' : ''}`} />
              {triggerBackup.isPending ? 'Creating Backup...' : 'Backup Now'}
            </Button>
            <span className="text-sm text-muted-foreground">
              Creates an immediate full database snapshot.
            </span>
          </div>
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
                      <Badge variant={backup.backup_type === 'scheduled' ? 'secondary' : 'outline'}>
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
                            : 'destructive'
                        }
                      >
                        {backup.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{formatBytes(backup.file_size_bytes)}</TableCell>
                    <TableCell>{backup.tables_count ?? '—'}</TableCell>
                    <TableCell>{backup.total_rows ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {backup.status === 'completed' && backup.file_path && (
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
                        {backup.status === 'failed' && backup.error_message && (
                          <span className="text-xs text-destructive max-w-[200px] truncate" title={backup.error_message}>
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
    </div>
  );
}
