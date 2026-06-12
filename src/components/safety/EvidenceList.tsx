import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Download, FileText, Eye } from 'lucide-react';
import {
  useIncidentEvidence,
  getEvidenceSignedUrl,
  type EvidenceStage,
} from '@/hooks/useSafetyIncidentDetail';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { EvidencePreviewDialog } from './EvidencePreviewDialog';
import { EVIDENCE_STAGE_DISPLAY_LABEL } from '@/lib/safetyEvidenceNaming';

const STAGE_LABEL: Record<EvidenceStage, string> = EVIDENCE_STAGE_DISPLAY_LABEL;

export function EvidenceList({ incidentId }: { incidentId: string }) {
  const { data: rows = [], isLoading } = useIncidentEvidence(incidentId);
  const [opening, setOpening] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const open = async (path: string, id: string, displayName: string) => {
    setOpening(id);
    try {
      const url = await getEvidenceSignedUrl(path);
      const a = document.createElement('a');
      a.href = url;
      a.download = displayName;
      a.rel = 'noopener';
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setOpening(null);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No evidence uploaded yet.</p>;
  }
  return (
    <TooltipProvider>
      <ul className="space-y-2">
        {rows.map((r) => {
          const original = r.original_file_name ?? null;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between bg-muted/40 rounded px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate flex items-center gap-1.5">
                    {original && original !== r.file_name ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() => setPreviewId(r.id)}
                            className="truncate text-left hover:underline focus:underline focus:outline-none text-primary"
                          >
                            {r.file_name}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          Original: <span className="font-mono">{original}</span>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPreviewId(r.id)}
                        className="truncate text-left hover:underline focus:underline focus:outline-none text-primary"
                      >
                        {r.file_name}
                      </button>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(r.uploaded_at), 'dd MMM yyyy, HH:mm')}
                    {r.size_bytes ? ` • ${Math.round(r.size_bytes / 1024)} KB` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline">{STAGE_LABEL[r.stage]}</Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setPreviewId(r.id)}
                  aria-label="Preview evidence"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => open(r.file_path, r.id, r.file_name)}
                  disabled={opening === r.id}
                  aria-label="Download evidence"
                >
                  {opening === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <EvidencePreviewDialog
        open={previewId !== null}
        onOpenChange={(o) => { if (!o) setPreviewId(null); }}
        items={rows}
        initialId={previewId}
      />
    </TooltipProvider>
  );
}