import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useBundleAssignmentLogs, TemplateBundle } from '@/hooks/useTemplateBundles';
import { History, User, Calendar, FileText } from 'lucide-react';
import { format } from 'date-fns';

interface BundleHistoryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bundle?: TemplateBundle | null;
}

export function BundleHistoryDialog({ isOpen, onClose, bundle }: BundleHistoryDialogProps) {
  const { data: logs, isLoading } = useBundleAssignmentLogs(bundle?.id);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Assignment History
          </DialogTitle>
          <DialogDescription>
            {bundle ? `History for "${bundle.name}"` : 'All bundle assignments'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : logs?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No assignments yet</p>
              <p className="text-sm">Bundle assignments will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs?.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium truncate">
                          {log.profiles?.full_name || log.profiles?.email || 'Unknown Employee'}
                        </span>
                        {log.profiles?.employee_code && (
                          <Badge variant="outline" className="text-xs">
                            {log.profiles.employee_code}
                          </Badge>
                        )}
                      </div>
                      
                      {!bundle && log.template_bundles && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                          <FileText className="h-3 w-3" />
                          <span>{log.template_bundles.name}</span>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          <span>{format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}</span>
                        </div>
                        <span>•</span>
                        <span>{log.review_period} {log.review_year}</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <Badge variant="secondary" className="mb-1">
                        {log.kpis_created} KPIs
                      </Badge>
                      {log.assigned_by_profile && (
                        <p className="text-xs text-muted-foreground">
                          by {log.assigned_by_profile.full_name || log.assigned_by_profile.email}
                        </p>
                      )}
                    </div>
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
