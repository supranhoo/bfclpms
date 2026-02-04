import { cn } from '@/lib/utils';
import { normalizeKpiText, preWrapClass } from '@/lib/textFormatting';

interface FormattedTextProps {
  text: string | null | undefined;
  className?: string;
  as?: 'p' | 'span' | 'div';
  normalize?: boolean; // Apply section marker normalization
}

/**
 * Renders text with preserved line breaks.
 * Optionally normalizes KPI-style structured text.
 */
export function FormattedText({ 
  text, 
  className, 
  as: Tag = 'p',
  normalize = true 
}: FormattedTextProps) {
  const displayText = normalize ? normalizeKpiText(text) : (text || '');
  
  return (
    <Tag className={cn(preWrapClass, className)}>
      {displayText}
    </Tag>
  );
}
