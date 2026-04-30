import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createReviewNote,
  deleteReviewNote,
  listReviewNotes,
  setReviewNoteStatus,
  updateReviewNote,
  type ListFilters,
  type ReviewActionNote,
  type ReviewActionNoteInput,
  type ReviewNoteStatus,
} from '@/services/reviewNotes/reviewNotesService';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const KEY = ['review-action-notes'] as const;

export function useReviewNotesList(filters: ListFilters = {}) {
  return useQuery({
    queryKey: [...KEY, filters],
    queryFn: () => listReviewNotes(filters),
    staleTime: 30_000,
  });
}

export function useCreateReviewNote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (input: ReviewActionNoteInput) => {
      if (!user?.id) throw new Error('Not authenticated');
      return createReviewNote(input, user.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: 'Note added', description: 'Review note saved.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not save note', description: e.message, variant: 'destructive' }),
  });
}

export function useUpdateReviewNote() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<ReviewActionNoteInput> & { status?: ReviewNoteStatus } }) =>
      updateReviewNote(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) =>
      toast({ title: 'Update failed', description: e.message, variant: 'destructive' }),
  });
}

export function useSetReviewNoteStatus() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewNoteStatus }) => setReviewNoteStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: Error) =>
      toast({ title: 'Status change failed', description: e.message, variant: 'destructive' }),
  });
}

export function useDeleteReviewNote() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => deleteReviewNote(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast({ title: 'Note deleted' });
    },
    onError: (e: Error) =>
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' }),
  });
}

export type { ReviewActionNote };