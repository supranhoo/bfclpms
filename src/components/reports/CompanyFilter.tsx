import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Building2 } from 'lucide-react';
import type { CompanyOption } from '@/hooks/useCompanyFilter';

interface CompanyFilterProps {
  companies: CompanyOption[];
  selectedCompanyId: string;
  onCompanyChange: (companyId: string) => void;
  className?: string;
}

export function CompanyFilter({ companies, selectedCompanyId, onCompanyChange, className }: CompanyFilterProps) {
  if (companies.length <= 1) return null;

  return (
    <Select value={selectedCompanyId} onValueChange={onCompanyChange}>
      <SelectTrigger className={className ?? 'w-[180px] h-8 text-xs'}>
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
          <SelectValue placeholder="All Companies" />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Companies</SelectItem>
        {companies.map(c => (
          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
