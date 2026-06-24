import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AR_SETTING_KEYS,
  getShowReviewerNamesInStepper,
  setShowReviewerNamesInStepper,
  getAutoReassignHrOnBuHeadChange,
  setAutoReassignHrOnBuHeadChange,
} from '@/services/annualReview/annualReviewSettings';

const KEY = ['annual-review-settings', AR_SETTING_KEYS.showReviewerNamesInStepper] as const;
const AUTO_HR_KEY = ['annual-review-settings', AR_SETTING_KEYS.autoReassignHrOnBuHeadChange] as const;

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

/** Returns the "auto re-assign HR Final on HR BU Head change" toggle (default false). */
export function useAutoReassignHrOnBuHeadChange() {
  return useQuery({
    queryKey: AUTO_HR_KEY,
    queryFn: getAutoReassignHrOnBuHeadChange,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSetAutoReassignHrOnBuHeadChange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) => setAutoReassignHrOnBuHeadChange(value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AUTO_HR_KEY });
    },
  });
}