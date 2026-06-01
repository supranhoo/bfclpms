import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateIncrementRunItem } from '@/hooks/useIncrementRuns';
import { Loader2 } from 'lucide-react';
import { MultiFileUpload } from '@/components/ui/MultiFileUpload';
import { FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const WORD_DOC_TYPES = {
  'application/msword': { ext: 'doc', icon: FileText },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: 'docx',
    icon: FileText,
  },
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  row: any | null;
}

/**
 * Safe admin override of an increment_run_items row.
 * Only the 5 allowed override fields are editable. Identity, AY, run ID,
 * PMS score source, and core configuration fields stay read-only.
 */
export function IncrementResultEditDialog({ open, onOpenChange, row }: Props) {
  const update = useUpdateIncrementRunItem();
  const [eligiblePercent, setEligiblePercent] = useState<string>('');
  const [incrementAmount, setIncrementAmount] = useState<string>('');
  const [revisedSalary, setRevisedSalary] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [status, setStatus] = useState<string>('');
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? '');
    });
  }, []);

  useEffect(() => {
    if (!row) return;
    setEligiblePercent(row.eligible_percent != null ? String(row.eligible_percent) : '');
    setIncrementAmount(row.increment_amount != null ? String(row.increment_amount) : '');
    setRevisedSalary(row.revised_salary != null ? String(row.revised_salary) : '');
    setRemarks(row.remarks ?? '');
    setStatus(row.eligibility_status ?? 'eligible');
    setEvidenceUrls(Array.isArray(row.evidence_urls) ? row.evidence_urls : []);
  }, [row]);

  if (!row) return null;

  const submit = async () => {
    const numOrNull = (v: string) =>
      v.trim() === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
    await update.mutateAsync({
      id: row.id,
      patch: {
        eligible_percent: numOrNull(eligiblePercent),
        increment_amount: numOrNull(incrementAmount),
        revised_salary: numOrNull(revisedSalary),
        remarks: remarks.trim() || null,
        eligibility_status: status as any,
        evidence_urls: evidenceUrls,
      },
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Calculated Row</DialogTitle>
          <DialogDescription>
            Override admin-safe fields only. Identity, PMS score, slab, and configuration
            stay locked. Saved as a manual edit.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            {row.employee?.full_name ?? row.employee_id}
            {row.employee?.employee_code ? ` · ${row.employee.employee_code}` : ''}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Eligibility</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eligible">eligible</SelectItem>
                  <SelectItem value="ineligible">ineligible</SelectItem>
                  <SelectItem value="excluded">excluded</SelectItem>
                  <SelectItem value="no_score">no_score</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Eligible %</Label>
              <Input
                type="number"
                step="0.01"
                value={eligiblePercent}
                onChange={(e) => setEligiblePercent(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Increment Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={incrementAmount}
                onChange={(e) => setIncrementAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Revised Salary</Label>
              <Input
                type="number"
                step="0.01"
                value={revisedSalary}
                onChange={(e) => setRevisedSalary(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="Reason for override (optional)"
            />
          </div>
          {currentUserId && (
            <MultiFileUpload
              userId={currentUserId}
              contextId={row.id}
              folder="increment-overrides"
              existingUrls={evidenceUrls}
              onUploadComplete={setEvidenceUrls}
              maxFiles={10}
              label="Supporting Evidence"
              extraAcceptedTypes={WORD_DOC_TYPES}
              helperText="Supported: JPG, PNG, PDF, Word, Excel, screenshots. Paste with Ctrl+V."
              pasteFilenameFor={(file) => {
                if (!file.type.startsWith('image/')) return null;
                // Pasted screenshots typically arrive as 'image.png'.
                if (file.name && file.name !== 'image.png') return null;
                const ext = file.type === 'image/jpeg' ? 'jpg' : 'png';
                const code = row.employee?.employee_code ?? row.employee_id?.slice(0, 8) ?? 'emp';
                return `increment-override-evidence-${code}-${Date.now()}.${ext}`;
              }}
            />
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={update.isPending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}