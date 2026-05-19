import { useState, useEffect, useRef } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, Upload, X, FileText, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUploadLimits } from '@/hooks/useUploadLimits';
import { useAuth } from '@/contexts/AuthContext';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import {
  useOrgKpiEvidenceFiles,
  useUpsertOrgKpiEvidenceFiles,
  useResyncOrgKpiEvidence,
  type OrgKpiEvidenceFile,
} from '@/hooks/useOrgKpiEvidenceFiles';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  okvId: string | null;
  kpiName: string;
}

/**
 * Multi-file supporting manager for a single Org KPI value row.
 * Handles upload + per-file label/caption + resync to per-employee scorecards.
 */
export function OrgKpiEvidenceManagerSheet({ open, onOpenChange, okvId, kpiName }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { maxFileSizeMb, maxFileSizeBytes } = useUploadLimits();
  const { data: serverFiles, isLoading } = useOrgKpiEvidenceFiles(okvId);
  const upsert = useUpsertOrgKpiEvidenceFiles();
  const resync = useResyncOrgKpiEvidence();

  const [files, setFiles] = useState<OrgKpiEvidenceFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setFiles(serverFiles || []);
  }, [open, serverFiles]);

  const dirty = JSON.stringify(files) !== JSON.stringify(serverFiles || []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files || []);
    if (list.length === 0) return;
    setIsUploading(true);
    try {
      const additions: OrgKpiEvidenceFile[] = [];
      for (const file of list) {
        if (file.size > maxFileSizeBytes) {
          toast({ title: `${file.name} too large`, description: `Max ${maxFileSizeMb}MB`, variant: 'destructive' });
          continue;
        }
        const ext = file.name.split('.').pop();
        const sanitized = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 40);
        const path = `org-kpi-evidence/org-kpi-${Date.now()}_${sanitized}.${ext}`;
        const { error } = await supabase.storage.from('review-evidence').upload(path, file);
        if (error) { toast({ title: 'Upload failed', description: error.message, variant: 'destructive' }); continue; }
        const { data: { publicUrl } } = supabase.storage.from('review-evidence').getPublicUrl(path);
        additions.push({ url: publicUrl, label: file.name.replace(/\.[^.]+$/, ''), added_by: user?.id ?? null, added_at: new Date().toISOString() });
      }
      if (additions.length) setFiles(prev => [...prev, ...additions]);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleLabel = (idx: number, label: string) =>
    setFiles(prev => prev.map((f, i) => i === idx ? { ...f, label } : f));
  const handleRemove = (idx: number) =>
    setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!okvId) return;
    await upsert.mutateAsync({ okvId, files });
    toast({ title: 'Supporting files saved' });
  };

  const doResync = async (mode: 'append_only' | 'replace_with_stepback') => {
    if (!okvId) return;
    if (dirty) await upsert.mutateAsync({ okvId, files });
    await resync.mutateAsync({ okvId, mode });
    setConfirmReplace(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-base">Manage Supporting Files</SheetTitle>
            <SheetDescription className="text-xs">
              {kpiName}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-3 mt-4">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading files…
              </div>
            ) : files.length === 0 ? (
              <Alert>
                <AlertDescription className="text-xs">
                  No supporting files attached yet. Use the Upload button below to add one or more.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                {files.map((f, idx) => (
                  <div key={`${f.url}-${idx}`} className="border rounded-md p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <Input
                        value={f.label ?? ''}
                        onChange={(e) => handleLabel(idx, e.target.value)}
                        placeholder="Label / caption (e.g. Q1 audit certificate)"
                        className="h-8 text-xs"
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => openStorageFile(f.url, buildEvidenceFileName(f.url, f.label, 'Org_KPI'))}
                      >
                        View <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-destructive"
                        onClick={() => handleRemove(idx)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    {f.added_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Added {new Date(f.added_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileSelect}
                     accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" />
              <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={isUploading}>
                {isUploading ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Uploading…</>
                             : <><Upload className="h-3 w-3 mr-1" /> Add file(s)</>}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!dirty || upsert.isPending}>
                {upsert.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                Save changes
              </Button>
              {dirty && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Unsaved</Badge>}
            </div>

            <Separator />

            <div className="space-y-2">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5" /> Re-sync to employee dashboards
              </h4>
              <p className="text-xs text-muted-foreground">
                After propagation, employees see a snapshot of the supporting files. Use these actions
                to push updates without breaking the workflow.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!okvId || resync.isPending}
                  onClick={() => doResync('append_only')}
                >
                  {resync.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                  Append new files only
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={!okvId || resync.isPending}
                  onClick={() => setConfirmReplace(true)}
                >
                  Replace + step back
                </Button>
              </div>
              <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700" />
                <AlertDescription className="text-[11px] text-amber-800 dark:text-amber-300">
                  <strong>Append</strong> is safe at any stage — only adds new URLs.
                  <strong> Replace + step back</strong> overwrites employee evidence and returns any
                  rows past self-review back to self-review for re-acknowledgement.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDestructiveDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Replace supporting files and step back?"
        description="This will overwrite the supporting files on every mapped employee's scorecard and send rows that have advanced past self-review back to self-review for re-acknowledgement. The action is fully audited."
        confirmText="Replace + step back"
        onConfirm={() => doResync('replace_with_stepback')}
      />
    </>
  );
}