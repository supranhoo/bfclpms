import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  listHierarchyCompletedReviews,
  type ListHierarchyArgs,
} from '@/services/annualReview/hierarchyCompleted';

export function useHierarchyCompletedReviews(args: ListHierarchyArgs | undefined) {
  return useQuery({
    queryKey: ['annualReview', 'hierarchyCompleted', args],
    enabled: !!args?.cycleId,
    queryFn: () => listHierarchyCompletedReviews(args!),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}