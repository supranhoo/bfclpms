import { useQuery } from '@tanstack/react-query';
import {
  searchActiveEmployeesForReview,
  type DirectoryEmployee,
} from '@/services/annualReview/employeeDirectory';

export function useEmployeeDirectorySearch(params: {
  query: string;
  cycleId: string | undefined;
  enabled?: boolean;
  limit?: number;
  offset?: number;
}) {
  const { query, cycleId, enabled = true, limit = 50, offset = 0 } = params;
  return useQuery<DirectoryEmployee[]>({
    queryKey: ['annual-review', 'directory-search', cycleId, query, limit, offset],
    queryFn: () =>
      searchActiveEmployeesForReview({ query, cycleId: cycleId!, limit, offset }),
    enabled: !!cycleId && enabled,
    staleTime: 15_000,
  });
}