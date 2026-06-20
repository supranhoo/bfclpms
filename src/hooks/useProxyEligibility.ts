import { useQuery } from '@tanstack/react-query';
import { checkProxyEligibility } from '@/services/annualReview/proxySubmission';

export function useProxyEligibility(instanceId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['annual-review', 'proxy-eligibility', instanceId],
    queryFn: () => checkProxyEligibility(instanceId!),
    enabled: !!instanceId && enabled,
    staleTime: 30_000,
  });
}