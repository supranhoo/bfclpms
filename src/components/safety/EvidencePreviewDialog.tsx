import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Download,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RotateCw,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  getEvidenceSignedUrl,
  type EvidenceRow,
  type EvidenceStage,
} from '@/hooks/useSafetyIncidentDetail';
import { cn } from '@/lib/utils';

const STAGE_LABEL: Record<EvidenceStage, string> = {
  report: 'Report',
  assignment: 'Assignment',
  investigation: 'Investigation',
  rca: 'RCA',
  capa: 'CAPA',
  verification: 'Verification',
};

type Kind = 'image' | 'pdf' | 'video' | 'office' | 'other';

function classify(row: EvidenceRow): Kind {
  const mime = (row.mime_type ?? '').toLowerCase();
  const name = (row.file_name ?? '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
  if (['xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt', 'csv'].includes(ext)) return 'office';
  return 'other';
}

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes && bytes !== 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function useUploaderNames(ids: string[]) {
  const sorted = useMemo(() => Array.from(new Set(ids)).filter(Boolean).sort(), [ids]);
  return useQuery({
    queryKey: ['safety', 'evidence-uploaders', sorted],
    enabled: sorted.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', sorted);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const r of data ?? []) {
        map[(r as { id: string }).id] =
          (r as { full_name?: string | null }).full_name ??
          (r as { email?: string | null }).email ??
          '';
      }
      return map;
    },
  });
}

export interface EvidencePreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: EvidenceRow[];
  initialId: string | null;
}

export function EvidencePreviewDialog({
  open,
  onOpenChange,
  items,
  initialId,
}: EvidencePreviewDialogProps) {
  const [index, setIndex] = useState(0);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  const { data: uploaderMap = {} } = useUploaderNames(items.map((i) => i.uploaded_by));

  // Sync index with initialId when dialog opens or items change
  useEffect(() => {
    if (!open) return;
    const i = initialId ? items.findIndex((x) => x.id === initialId) : 0;
    setIndex(i >= 0 ? i : 0);
  }, [open, initialId, items]);

  const current = items[index];
  const kind = current ? classify(current) : 'other';

  // Fetch signed URL whenever the current item changes
  useEffect(() => {
    if (!open || !current) {
      setSignedUrl(null);
      return;
    }
    let cancelled = false;
    setLoadingUrl(true);
    setUrlError(null);
    setSignedUrl(null);
    setZoom(1);
    setRotation(0);
    getEvidenceSignedUrl(current.file_path)
      .then((u) => {
        if (!cancelled) setSignedUrl(u);
      })
      .catch((e: Error) => {
        if (!cancelled) setUrlError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoadingUrl(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, current?.id, current?.file_path]);

  const goPrev = useCallback(() => {
    setIndex((i) => (items.length === 0 ? 0 : (i - 1 + items.length) % items.length));
  }, [items.length]);
  const goNext = useCallback(() => {
    setIndex((i) => (items.length === 0 ? 0 : (i + 1) % items.length));
  }, [items.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(z + 0.25, 5));
      else if (e.key === '-' || e.key === '_') setZoom((z) => Math.max(z - 0.25, 0.25));
      else if (e.key === '0') {
        setZoom(1);
        setRotation(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, goPrev, goNext]);

  const download = async () => {
    if (!current || !signedUrl) return;
    try {
      const a = document.createElement('a');
      a.href = signedUrl;
      a.download = current.file_name;
      a.rel = 'noopener';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!current) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogTitle>No preview</DialogTitle>
          <DialogDescription>No evidence file selected.</DialogDescription>
        </DialogContent>
      </Dialog>
    );
  }

  const uploader = uploaderMap[current.uploaded_by] || current.uploaded_by.slice(0, 8);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[96vw] sm:max-w-5xl lg:max-w-6xl p-0 gap-0 h-[92vh] sm:h-[88vh] flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b px-3 sm:px-4 py-2 shrink-0">
          <div className="min-w-0 flex-1">
            <DialogTitle className="truncate text-base">{current.file_name}</DialogTitle>
            <DialogDescription className="truncate text-xs">
              {items.length > 1 ? `${index + 1} of ${items.length} • ` : ''}
              {STAGE_LABEL[current.stage]}
            </DialogDescription>
          </div>
          <div className="flex items-center gap-1 shrink-0 pr-8">
            {kind === 'image' && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setZoom((z) => Math.max(z - 0.25, 0.25))}
                  aria-label="Zoom out"
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <span className="text-xs tabular-nums w-10 text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setZoom((z) => Math.min(z + 0.25, 5))}
                  aria-label="Zoom in"
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setRotation((r) => (r + 90) % 360)}
                  aria-label="Rotate"
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={download}
              disabled={!signedUrl}
              className="gap-1"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Viewer */}
          <div className="relative flex-1 bg-muted/30 flex items-center justify-center overflow-hidden min-h-[40vh]">
            {items.length > 1 && (
              <>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full shadow"
                  onClick={goPrev}
                  aria-label="Previous evidence"
                >
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full shadow"
                  onClick={goNext}
                  aria-label="Next evidence"
                >
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </>
            )}

            {loadingUrl && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Loading preview…</span>
              </div>
            )}

            {!loadingUrl && urlError && (
              <div className="flex flex-col items-center gap-2 text-destructive p-4 text-center">
                <AlertCircle className="h-6 w-6" />
                <p className="text-sm">{urlError}</p>
              </div>
            )}

            {!loadingUrl && !urlError && signedUrl && (
              <>
                {kind === 'image' && (
                  <ScrollArea className="h-full w-full">
                    <div className="min-h-full min-w-full flex items-center justify-center p-4">
                      <img
                        src={signedUrl}
                        alt={current.file_name}
                        className="max-w-none transition-transform duration-150 select-none"
                        style={{
                          transform: `scale(${zoom}) rotate(${rotation}deg)`,
                          transformOrigin: 'center center',
                        }}
                        draggable={false}
                      />
                    </div>
                  </ScrollArea>
                )}

                {kind === 'pdf' && (
                  <iframe
                    src={signedUrl}
                    title={current.file_name}
                    className="h-full w-full border-0 bg-background"
                  />
                )}

                {kind === 'video' && (
                  <video
                    src={signedUrl}
                    controls
                    className="max-h-full max-w-full bg-black"
                  >
                    Your browser does not support the video tag.
                  </video>
                )}

                {(kind === 'office' || kind === 'other') && (
                  <div className="flex flex-col items-center gap-3 text-center p-6 max-w-md">
                    <FileText className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      In-app preview isn't available for this file type. Download the file to
                      view it in its native application.
                    </p>
                    <Button onClick={download} className="gap-1">
                      <Download className="h-4 w-4" />
                      Download file
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Info panel */}
          <aside className="w-full lg:w-72 shrink-0 border-t lg:border-t-0 lg:border-l bg-background">
            <ScrollArea className="h-full max-h-[28vh] lg:max-h-none">
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    File details
                  </h3>
                  <dl className="space-y-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Name</dt>
                      <dd className="break-words">{current.file_name}</dd>
                    </div>
                    {current.original_file_name &&
                      current.original_file_name !== current.file_name && (
                        <div>
                          <dt className="text-xs text-muted-foreground">Original name</dt>
                          <dd className="break-words font-mono text-xs">
                            {current.original_file_name}
                          </dd>
                        </div>
                      )}
                    <div>
                      <dt className="text-xs text-muted-foreground">Category</dt>
                      <dd>
                        <Badge variant="outline">{STAGE_LABEL[current.stage]}</Badge>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Size</dt>
                      <dd>{formatBytes(current.size_bytes)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Type</dt>
                      <dd className="break-all text-xs">{current.mime_type ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Uploaded by</dt>
                      <dd className="break-words">{uploader}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Uploaded at</dt>
                      <dd>{format(new Date(current.uploaded_at), 'dd MMM yyyy, HH:mm')}</dd>
                    </div>
                  </dl>
                </div>

                {items.length > 1 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      All evidence ({items.length})
                    </h3>
                    <ul className="space-y-1">
                      {items.map((it, i) => {
                        const k = classify(it);
                        return (
                          <li key={it.id}>
                            <button
                              type="button"
                              onClick={() => setIndex(i)}
                              className={cn(
                                'w-full text-left flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted/60 transition-colors',
                                i === index && 'bg-muted font-medium',
                              )}
                            >
                              <span className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded bg-muted text-[10px] uppercase">
                                {k === 'image' ? 'IMG' : k === 'pdf' ? 'PDF' : k === 'video' ? 'VID' : 'DOC'}
                              </span>
                              <span className="truncate flex-1">{it.file_name}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            </ScrollArea>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}