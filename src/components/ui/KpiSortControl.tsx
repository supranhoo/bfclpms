import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { KpiSortField, SortDirection, KpiSortConfig } from '@/hooks/useKpiSorting';

interface KpiSortControlProps {
  sortConfig: KpiSortConfig;
  onSortChange: (field: KpiSortField) => void;
  compact?: boolean;
}

const sortLabels: Record<KpiSortField, string> = {
  category: 'Category',
  weightage: 'Weightage',
  kra: 'KRA Name',
  final: 'Final',
};

export function KpiSortControl({ sortConfig, onSortChange, compact = false }: KpiSortControlProps) {
  const getDirectionIcon = (field: KpiSortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
    }
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  if (compact) {
    return (
      <Select
        value={`${sortConfig.field}-${sortConfig.direction}`}
        onValueChange={(value) => {
          const [field] = value.split('-') as [KpiSortField];
          onSortChange(field);
        }}
      >
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <ArrowUpDown className="h-3 w-3 mr-1" />
          <SelectValue placeholder="Sort by..." />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="weightage-desc">Weightage (High→Low)</SelectItem>
          <SelectItem value="weightage-asc">Weightage (Low→High)</SelectItem>
          <SelectItem value="category-asc">Category (A→Z)</SelectItem>
          <SelectItem value="category-desc">Category (Z→A)</SelectItem>
          <SelectItem value="kra-asc">KRA Name (A→Z)</SelectItem>
          <SelectItem value="kra-desc">KRA Name (Z→A)</SelectItem>
          <SelectItem value="final-desc">Final Score (High→Low)</SelectItem>
          <SelectItem value="final-asc">Final Score (Low→High)</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1">Sort:</span>
      {(['weightage', 'category', 'final'] as KpiSortField[]).map((field) => (
        <Button
          key={field}
          variant={sortConfig.field === field ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 px-2 text-xs gap-1"
          onClick={() => onSortChange(field)}
        >
          {sortLabels[field]}
          {getDirectionIcon(field)}
        </Button>
      ))}
    </div>
  );
}
