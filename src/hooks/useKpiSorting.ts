import { useState, useMemo } from 'react';
import { KPI } from '@/hooks/useKpis';

export type KpiSortField = 'category' | 'weightage' | 'kra' | 'final';
export type SortDirection = 'asc' | 'desc';

export interface KpiSortConfig {
  field: KpiSortField;
  direction: SortDirection;
}

export interface UseKpiSortingOptions {
  defaultField?: KpiSortField;
  defaultDirection?: SortDirection;
}

export function useKpiSorting<T extends Pick<KPI, 'id' | 'kra_categories' | 'weightage' | 'kra_name'>>(
  kpis: T[] | undefined,
  options: UseKpiSortingOptions = {},
  submissionMap?: Map<string, any>
) {
  const { defaultField = 'weightage', defaultDirection = 'desc' } = options;
  
  const [sortConfig, setSortConfig] = useState<KpiSortConfig>({
    field: defaultField,
    direction: defaultDirection,
  });

  const sortedKpis = useMemo(() => {
    if (!kpis) return [];
    
    return [...kpis].sort((a, b) => {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      
      switch (sortConfig.field) {
        case 'category': {
          const catA = a.kra_categories?.name?.toLowerCase() || '';
          const catB = b.kra_categories?.name?.toLowerCase() || '';
          const result = catA.localeCompare(catB);
          // Secondary sort by weightage desc within same category
          if (result === 0) {
            return (b.weightage || 0) - (a.weightage || 0);
          }
          return result * direction;
        }
        
        case 'weightage': {
          const weightA = a.weightage || 0;
          const weightB = b.weightage || 0;
          const result = weightA - weightB;
          // Secondary sort by category name within same weightage
          if (result === 0) {
            const catA = a.kra_categories?.name?.toLowerCase() || '';
            const catB = b.kra_categories?.name?.toLowerCase() || '';
            return catA.localeCompare(catB);
          }
          return result * direction;
        }
        
        case 'kra': {
          const kraA = a.kra_name?.toLowerCase() || '';
          const kraB = b.kra_name?.toLowerCase() || '';
          return kraA.localeCompare(kraB) * direction;
        }
        
        case 'final': {
          const scoreA = submissionMap?.get(a.id)?.final_score ?? -Infinity;
          const scoreB = submissionMap?.get(b.id)?.final_score ?? -Infinity;
          const result = scoreA - scoreB;
          if (result === 0) return (b.weightage || 0) - (a.weightage || 0);
          return result * direction;
        }
        
        default:
          return 0;
      }
    });
  }, [kpis, sortConfig, submissionMap]);

  const setSort = (field: KpiSortField) => {
    setSortConfig(prev => ({
      field,
      direction: prev.field === field && prev.direction === 'desc' ? 'asc' : 'desc',
    }));
  };

  const setSortWithDirection = (field: KpiSortField, direction: SortDirection) => {
    setSortConfig({ field, direction });
  };

  return {
    sortedKpis,
    sortConfig,
    setSort,
    setSortWithDirection,
  };
}
