import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AR_SETTING_KEYS,
  getShowReviewerNamesInStepper,
  setShowReviewerNamesInStepper,
} from '@/services/annualReview/annualReviewSettings';

const KEY = ['annual-review-settings', AR_SETTING_KEYS.showReviewerNamesInStepper] as const;

/** Returns the current "show reviewer names in stepper" flag (default false). */
export function useShowReviewerNamesInStepper() {
  return useQuery({
    queryKey: KEY,
    queryFn: getShowReviewerNamesInStepper,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetShowReviewerNamesInStepper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) => setShowReviewerNamesInStepper(value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}