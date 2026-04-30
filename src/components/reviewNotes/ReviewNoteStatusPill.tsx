import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, Loader2 } from 'lucide-react';
import type { ReviewNoteStatus } from '@/services/reviewNotes/reviewNotesService';

const styles: Record<ReviewNoteStatus, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const icons: Record<ReviewNoteStatus, React.ReactNode> = {
  pending: <Circle className="h-3 w-3" />,
  in_progress: <Loader2 className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3" />,
};

const labels: Record<ReviewNoteStatus, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function ReviewNoteStatusPill({ status }: { status: ReviewNoteStatus }) {
  return (
    <Badge variant="secondary" className={`${styles[status]} gap-1 text-xs font-medium`}>
      {icons[status]} {labels[status]}
    </Badge>
  );
}