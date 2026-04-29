import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Download, FileText } from 'lucide-react';
import {
  useIncidentEvidence,
  getEvidenceSignedUrl,
  type EvidenceStage,
} from '@/hooks/useSafetyIncidentDetail';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { toast } from 'sonner';

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

  const open = async (path: string, id: string) => {
    setOpening(id);
    try {
      const url = await getEvidenceSignedUrl(path);
      window.open(url, '_blank', 'noopener');
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
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center justify-between bg-muted/40 rounded px-3 py-2 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="truncate">{r.file_name}</p>
              <p className="text-xs text-muted-foreground">
                {format(new Date(r.uploaded_at), 'dd MMM yyyy, HH:mm')}
                {r.size_bytes ? ` • ${Math.round(r.size_bytes / 1024)} KB` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline">{STAGE_LABEL[r.stage]}</Badge>
            <Button variant="ghost" size="icon" onClick={() => open(r.file_path, r.id)} disabled={opening === r.id}>
              {opening === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}