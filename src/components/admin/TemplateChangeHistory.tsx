import { useTemplateChangeHistory } from '@/hooks/useKpiTemplates';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, History, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface TemplateChangeHistoryProps {
  templateId: string | null;
  templateTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TemplateChangeHistory({ templateId, templateTitle, isOpen, onClose }: TemplateChangeHistoryProps) {
  const { data: history, isLoading } = useTemplateChangeHistory(isOpen ? templateId : null);

  return (
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
                  <div className="text-sm">
                    <span className="font-medium">{entry.kpis_updated}</span> KPIs updated across{' '}
                    <span className="font-medium">{entry.employees_affected}</span> employees
                    {entry.scope === 'selected' && (
                      <Badge variant="secondary" className="ml-2 text-xs">Selected</Badge>
                    )}
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
  );
}
