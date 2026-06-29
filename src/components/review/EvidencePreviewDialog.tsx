import { useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Download, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { isPreviewableEvidence } from '@/lib/storageDownload';
import { toast } from 'sonner';

type EvidencePreviewDetail = { url: string; fileName: string | null };

function downloadDirect(url: string, fileName?: string | null) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  if (fileName) a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/**
 * If `url` points to /storage/v1/object/public/<bucket>/<path>, mint a short-
 * lived signed URL (private buckets have no public endpoint). Returns the
 * original URL when it is not a storage URL.
 */
export async function resolveDownloadableUrl(url: string): Promise<string> {
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match) return url;
  const [, bucket, path] = match;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(decodeURIComponent(path), 300);
  if (error || !data?.signedUrl) {
    throw new Error(error?.message || 'Could not prepare file URL');
  }
  return data.signedUrl;
}

/**
 * Global provider that listens for `evidence-preview` custom events dispatched
 * by `openStorageFile()` and renders a modal preview for PDF / image files.
 * Other file types are handled directly by `openStorageFile()` (download).
 */
export function EvidencePreviewProvider() {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<EvidencePreviewDetail | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<EvidencePreviewDetail>;
      if (!ce.detail?.url) return;
      ce.preventDefault();
      setDetail(ce.detail);
      setOpen(true);
    };
    window.addEventListener('evidence-preview', handler as EventListener);
    return () => window.removeEventListener('evidence-preview', handler as EventListener);
  }, []);

  useEffect(() => {
    if (!open || !detail) return;
    let cancelled = false;
    let createdUrl: string | null = null;
    setLoading(true);
    setError(null);
    setBlobUrl(null);

    (async () => {
      try {
        const match = detail.url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
        const kindNow = isPreviewableEvidence(detail.fileName ?? detail.url);
        if (kindNow === 'office') {
          // Office files render via Microsoft's public Office viewer, which
          // needs an externally reachable URL — blob URLs won't work. Use a
          // short-lived signed URL when the source is a private bucket,
          // otherwise pass the public URL through unchanged.
          if (match) {
            const [, bucket, path] = match;
            const { data, error: sErr } = await supabase.storage
              .from(bucket)
              .createSignedUrl(decodeURIComponent(path), 600);
            if (sErr || !data?.signedUrl) throw new Error(sErr?.message || 'Could not sign URL');
            createdUrl = data.signedUrl;
          } else {
            createdUrl = detail.url;
          }
        } else if (match) {
          const [, bucket, path] = match;
          const { data, error: dlErr } = await supabase.storage
            .from(bucket)
            .download(decodeURIComponent(path));
          if (dlErr || !data) throw new Error(dlErr?.message || 'Download failed');
          createdUrl = URL.createObjectURL(data);
        } else {
          // Non-storage URL — use directly
          createdUrl = detail.url;
        }
        if (!cancelled) setBlobUrl(createdUrl);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (createdUrl && createdUrl.startsWith('blob:')) {
        setTimeout(() => URL.revokeObjectURL(createdUrl!), 60_000);
      }
    };
  }, [open, detail]);

  const kind = detail ? isPreviewableEvidence(detail.fileName ?? detail.url) : null;
  const displayName = detail?.fileName || detail?.url.split('/').pop()?.split('?')[0] || 'Evidence';

  const handleDownload = async () => {
    if (!detail) return;
    try {
      // Prefer the URL we already resolved for preview (blob: for pdf/image,
      // signed https: for office). Falls back to signing detail.url when the
      // user clicks before the preview finishes loading.
      if (blobUrl) {
        downloadDirect(blobUrl, displayName);
        return;
      }
      const url = await resolveDownloadableUrl(detail.url);
      downloadDirect(url, displayName);
    } catch (err) {
      toast.error((err as Error).message || 'Could not prepare file for download');
    }
  };

  const handleOpenNewTab = async () => {
    if (!detail) return;
    try {
      const url = blobUrl || (await resolveDownloadableUrl(detail.url));
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error((err as Error).message || 'Could not open file');
    }
  };

  const body = (
    <div className="flex flex-col h-full gap-3 min-h-0">
      <div className="flex items-center justify-end gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={handleOpenNewTab} disabled={!blobUrl && !detail?.url}>
          <ExternalLink className="h-4 w-4 mr-1" />
          Open in new tab
        </Button>
        <Button variant="default" size="sm" onClick={handleDownload} disabled={loading}>
          <Download className="h-4 w-4 mr-1" />
          Download
        </Button>
      </div>
      <div className="flex-1 min-h-0 flex items-center justify-center bg-muted/30 rounded-md overflow-auto">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground p-8">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading preview…
          </div>
        )}
        {!loading && error && (
          <div className="text-sm text-destructive p-8 text-center">
            Preview failed: {error}
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-1" /> Download instead
              </Button>
            </div>
          </div>
        )}
        {!loading && !error && blobUrl && kind === 'pdf' && (
          <iframe
            src={blobUrl}
            title={displayName}
            className="w-full h-full min-h-[65vh] border-0 bg-white"
          />
        )}
        {!loading && !error && blobUrl && kind === 'image' && (
          <img
            src={blobUrl}
            alt={displayName}
            className="max-w-full max-h-[80vh] object-contain"
          />
        )}
        {!loading && !error && blobUrl && kind === 'office' && (
          <iframe
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(blobUrl)}`}
            title={displayName}
            className="w-full h-full min-h-[65vh] border-0 bg-white"
          />
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle className="truncate text-base">{displayName}</DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-4 flex-1 overflow-hidden flex flex-col min-h-[70vh]">
            {body}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-5xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{displayName}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">{body}</div>
      </DialogContent>
    </Dialog>
  );
}