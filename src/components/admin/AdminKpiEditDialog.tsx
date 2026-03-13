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
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
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
