import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AdminKpiEditorForm } from '@/components/admin/AdminKpiEditorForm';
import { KPI } from '@/hooks/useKpis';

interface AdminKpiEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
}

export function AdminKpiEditDialog({ isOpen, onClose, kpi }: AdminKpiEditDialogProps) {
  if (!kpi) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="w-[96vw] max-w-[1200px] max-h-[92vh] grid-cols-[minmax(0,1fr)] [&>*]:min-w-0 overflow-x-hidden overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Admin KPI Editor</DialogTitle>
          <DialogDescription>
            Edit all KPI fields. Changes will be logged for audit purposes.
          </DialogDescription>
        </DialogHeader>
        <AdminKpiEditorForm kpi={kpi} onSaved={onClose} onCancel={onClose} />
      </DialogContent>
    </Dialog>
  );
}
