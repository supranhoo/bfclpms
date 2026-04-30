import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { StickyNote } from 'lucide-react';
import { useReviewNoteAccess } from '@/hooks/useReviewNoteAccess';
import { AddReviewNoteSheet } from './AddReviewNoteSheet';
import type { ReviewNoteCategory } from '@/services/reviewNotes/reviewNotesService';

interface Props {
  subjectEmployeeId: string;
  subjectName?: string;
  kpiId?: string | null;
  kpiName?: string | null;
  periodId?: string | null;
  defaultCategory?: ReviewNoteCategory;
  variant?: 'icon' | 'compact';
  className?: string;
}

/**
 * Inline "+ Note" trigger. Renders nothing if the current user can't create notes.
 * Visibility is fully driven by useReviewNoteAccess() — no hardcoded role checks.
 */
export function ReviewNoteTrigger({
  subjectEmployeeId,
  subjectName,
  kpiId,
  kpiName,
  periodId,
  defaultCategory,
  variant = 'icon',
  className,
}: Props) {
  const { canCreate } = useReviewNoteAccess();
  const [open, setOpen] = useState(false);

  if (!canCreate || !subjectEmployeeId) return null;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setOpen(true);
  };

  return (
    <>
      {variant === 'icon' ? (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className={`h-7 w-7 text-muted-foreground hover:text-primary ${className ?? ''}`}
          onClick={handleClick}
          title="Add review note"
          aria-label="Add review note"
        >
          <StickyNote className="h-4 w-4" />
        </Button>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={`h-8 gap-1.5 ${className ?? ''}`}
          onClick={handleClick}
        >
          <StickyNote className="h-3.5 w-3.5" /> Note
        </Button>
      )}

      <AddReviewNoteSheet
        open={open}
        onOpenChange={setOpen}
        subjectEmployeeId={subjectEmployeeId}
        subjectName={subjectName}
        kpiId={kpiId}
        kpiName={kpiName}
        periodId={periodId}
        defaultCategory={defaultCategory}
      />
    </>
  );
}