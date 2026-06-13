import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SUPPORTED_LANGUAGES } from '@/lib/annualReview/constants';
import { Languages } from 'lucide-react';

export function LanguageSwitcher({
  value,
  onChange,
  available,
}: {
  value: string;
  onChange: (v: string) => void;
  available?: string[];
}) {
  const opts = SUPPORTED_LANGUAGES.filter((l) => !available || available.includes(l.code));
  return (
    <div className="flex items-center gap-2">
      <Languages className="h-4 w-4 text-muted-foreground" />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opts.map((l) => (
            <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}