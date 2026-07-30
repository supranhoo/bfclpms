import { useEffect, useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, ExternalLink, ImageOff, Loader2 } from 'lucide-react';
import { createSignedSelfieUrl } from '@/services/annualReview/proxySubmission';
import type { AssistedSubmissionRow } from '@/services/annualReview/assistedSubmissions';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';

interface Props {
  row: AssistedSubmissionRow | null;
  onOpenChange: (open: boolean) => void;
  onOpenReview?: (instanceId: string) => void;
}

const SIGNED_URL_TTL_SEC = 300;

function EvidenceImage({ path, label }: { path: string | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    setLoading(true);
    // Signed URLs are minted only when the drawer opens — never for list rows.
    createSignedSelfieUrl(path, SIGNED_URL_TTL_SEC)
      .then((u) => { if (!cancelled) setUrl(u); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [path]);

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-md border bg-muted/40">
        {!path && (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <ImageOff className="h-6 w-6" />
            <span className="text-xs">Not captured</span>
          </div>
        )}
        {path && loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {path && !loading && url && (
          <img src={url} alt={label} className="h-full w-full object-cover" loading="lazy" />
        )}
        {path && !loading && !url && (
          <span className="px-3 text-center text-xs text-muted-foreground">
            Could not load evidence — the link may have expired. Close and reopen.
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * ADR-203 — read-only evidence viewer for one assisted submission.
 * Renders selfie / uploaded photograph via short-lived signed URLs plus the
 * exact declaration the assistant accepted.
 */
export function AssistedEvidenceDrawer({ row, onOpenChange, onOpenReview }: Props) {
  return (
    <Sheet open={!!row} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {row && (
          <>
            <SheetHeader>
              <SheetTitle className="text-left">
                {row.employee_name ?? 'Unknown employee'}
                {row.employee_code ? ` (${row.employee_code})` : ''}
              </SheetTitle>
              <SheetDescription className="text-left">
                Assisted submission evidence — read only.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-5">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Assisted by</dt>
                  <dd className="font-medium">
                    {row.proxy_name ?? '—'}{row.proxy_code ? ` (${row.proxy_code})` : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Role at capture</dt>
                  <dd className="font-medium">{row.proxy_role ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Captured at</dt>
                  <dd className="font-medium">{new Date(row.captured_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Review status now</dt>
                  <dd><AnnualReviewStatusBadge status={row.overall_status as never} /></dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Department</dt>
                  <dd className="font-medium">{row.department_name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Business unit</dt>
                  <dd className="font-medium">{row.business_unit_name ?? '—'}</dd>
                </div>
              </dl>

              {(!row.has_selfie || !row.has_photo) && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {!row.has_selfie && !row.has_photo
                      ? 'No photographic evidence was captured for this submission.'
                      : !row.has_selfie
                        ? 'No live selfie was captured — only an uploaded photograph is on record.'
                        : 'No photograph was uploaded — only a live selfie is on record.'}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-3">
                <EvidenceImage path={row.selfie_path} label="Live selfie" />
                <EvidenceImage path={row.photo_upload_path} label="Uploaded photograph" />
              </div>

              <Separator />

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Declaration accepted</p>
                <p className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-xs leading-relaxed">
                  {row.declaration_text?.trim() || 'No declaration text recorded.'}
                </p>
              </div>

              <div className="space-y-1 text-xs text-muted-foreground">
                <p><span className="font-medium">Device:</span> {row.user_agent || '—'}</p>
                <p><span className="font-medium">IP:</span> {row.ip || '—'}</p>
                <p><span className="font-medium">Audit id:</span> <span className="font-mono">{row.id}</span></p>
              </div>

              {onOpenReview && (
                <Button variant="outline" className="w-full" onClick={() => onOpenReview(row.instance_id)}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open full review
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
