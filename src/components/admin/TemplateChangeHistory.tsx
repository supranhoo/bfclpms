import { useState } from 'react';
import { useTemplateChangeHistory, usePropagateTemplateChange, useUpdateKpiTemplate, TemplateChangeLog } from '@/hooks/useKpiTemplates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, History, ArrowRight, Undo2 } from 'lucide-react';
import { format } from 'date-fns';

interface TemplateChangeHistoryProps {
  templateId: string | null;
  templateTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TemplateChangeHistory({ templateId, templateTitle, isOpen, onClose }: TemplateChangeHistoryProps) {
  const { data: history, isLoading } = useTemplateChangeHistory(isOpen ? templateId : null);
  const propagate = usePropagateTemplateChange();
  const updateTemplate = useUpdateKpiTemplate();
  const [revertingEntry, setRevertingEntry] = useState<TemplateChangeLog | null>(null);

  const handleRevert = async () => {
    if (!revertingEntry || !templateId) return;

    // Reverse the fields_changed: swap old ↔ new
    const reversedFields: Record<string, { old: any; new: any }> = {};
    Object.entries(revertingEntry.fields_changed).forEach(([field, change]) => {
      reversedFields[field] = { old: change.new, new: change.old };
    });

    await propagate.mutateAsync({
      template_id: templateId,
      fields_changed: reversedFields,
      effective_month: revertingEntry.effective_month,
      effective_year: revertingEntry.effective_year,
      employee_ids: revertingEntry.scope === 'selected' ? revertingEntry.selected_employee_ids : undefined,
    });

    // Also update the template record itself to stay in sync
    const templatePatch: Record<string, any> = { id: templateId };
    Object.entries(reversedFields).forEach(([field, change]) => {
      templatePatch[field] = change.new;
    });
    try {
      await updateTemplate.mutateAsync(templatePatch as any);
    } catch {
      // Template update is best-effort; propagation already succeeded
    }

    setRevertingEntry(null);
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Change History — {templateTitle}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !history || history.length === 0 ? (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No propagation history yet.
              </p>
            ) : (
              <div className="space-y-4">
                {history.map((entry) => (
                  <div key={entry.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">
                        {entry.effective_month} {entry.effective_year}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(entry.created_at), 'dd MMM yyyy, HH:mm')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <span className="font-medium">{entry.kpis_updated}</span> KPIs updated across{' '}
                        <span className="font-medium">{entry.employees_affected}</span> employees
                        {entry.scope === 'selected' && (
                          <Badge variant="secondary" className="ml-2 text-xs">Selected</Badge>
                        )}
                        {entry.changed_by_name && (
                          <span className="text-xs text-muted-foreground ml-2">by {entry.changed_by_name}</span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs gap-1 shrink-0"
                        onClick={() => setRevertingEntry(entry)}
                      >
                        <Undo2 className="h-3 w-3" />
                        Revert
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {Object.entries(entry.fields_changed).map(([field, change]) => (
                        <div key={field} className="text-xs flex items-center gap-1 text-muted-foreground">
                          <span className="capitalize font-medium">{field.replace(/_/g, ' ')}</span>
                          <span className="line-through">{String(change.old ?? '—')}</span>
                          <ArrowRight className="h-3 w-3" />
                          <span className="text-foreground">{String(change.new ?? '—')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Revert Confirmation */}
      <AlertDialog open={!!revertingEntry} onOpenChange={() => setRevertingEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revert Propagation</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the changes from{' '}
              <strong>{revertingEntry?.effective_month} {revertingEntry?.effective_year}</strong>,
              restoring the original values for{' '}
              <strong>{Object.keys(revertingEntry?.fields_changed || {}).length}</strong> field(s)
              across affected KPIs. Continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRevert} disabled={propagate.isPending}>
              {propagate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Revert Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
