import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Download, FileText, Pencil, Check, X, Eye } from 'lucide-react';
import {
  useIncidentEvidence,
  getEvidenceSignedUrl,
  useRenameIncidentEvidence,
  type EvidenceStage,
} from '@/hooks/useSafetyIncidentDetail';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { EvidencePreviewDialog } from './EvidencePreviewDialog';

const STAGE_LABEL: Record<EvidenceStage, string> = {
  report: 'Report',
  assignment: 'Assignment',
  investigation: 'Investigation',
  rca: 'RCA',
  capa: 'CAPA',
  verification: 'Verification',
};

export function EvidenceList({ incidentId }: { incidentId: string }) {
  const { data: rows = [], isLoading } = useIncidentEvidence(incidentId);
  const [opening, setOpening] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const { user } = useAuth();
  const rename = useRenameIncidentEvidence(incidentId);

  const open = async (path: string, id: string, displayName: string) => {
    setOpening(id);
    try {
      const url = await getEvidenceSignedUrl(path);
      // Force the browser to use the (possibly renamed) display name.
      // Anchor-with-download works for same-origin; signed Supabase URLs
      // open in a new tab when download attribute isn't honored cross-origin,
      // so we fall back to window.open in that case.
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

  const startEdit = (id: string, current: string) => {
    setEditingId(id);
    setEditValue(current);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };
  const submitEdit = (id: string) => {
    const next = editValue.trim();
    if (!next) return;
    rename.mutate(
      { evidenceId: id, newName: next },
      { onSuccess: () => cancelEdit() },
    );
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
          const canRename = !!user && r.uploaded_by === user.id;
          const isEditing = editingId === r.id;
          const original = r.original_file_name ?? r.file_name;
          const wasRenamed = original && original !== r.file_name;
          return (
            <li
              key={r.id}
              className="flex items-center justify-between bg-muted/40 rounded px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileText className="h-4 w-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            submitEdit(r.id);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                        autoFocus
                        maxLength={200}
                        className="h-7 text-sm"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={rename.isPending || !editValue.trim()}
                        onClick={() => submitEdit(r.id)}
                      >
                        {rename.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        disabled={rename.isPending}
                        onClick={cancelEdit}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <p className="truncate flex items-center gap-1.5">
                        {wasRenamed ? (
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
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Badge variant="outline">{STAGE_LABEL[r.stage]}</Badge>
                {canRename && !isEditing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => startEdit(r.id, r.file_name)}
                    aria-label="Rename evidence"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {!isEditing && (
                  <>
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
                  </>
                )}
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