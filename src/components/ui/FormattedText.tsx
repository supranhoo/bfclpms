import React from 'react';
import { cn } from '@/lib/utils';
import { normalizeKpiText, splitKpiTextSegments, preWrapClass } from '@/lib/textFormatting';

interface FormattedTextProps {
  text: string | null | undefined;
  className?: string;
  as?: 'p' | 'span' | 'div';
  normalize?: boolean;
  bold?: boolean;
}

/**
 * Helper to render KPI text segments with bold markers as React nodes.
 */
export function renderBoldKpiText(text: string | null | undefined): React.ReactNode[] {
  return splitKpiTextSegments(text).map((seg, i) =>
    seg.bold
      ? React.createElement('strong', { key: i }, seg.text)
      : React.createElement(React.Fragment, { key: i }, seg.text)
  );
}

/**
 * Renders text with preserved line breaks.
 * Optionally normalizes KPI-style structured text and bolds section markers.
 */
export function FormattedText({ 
  text, 
  className, 
  as: Tag = 'p',
  normalize = true,
  bold = true,
}: FormattedTextProps) {
  if (bold && normalize) {
    return (
      <Tag className={cn(preWrapClass, className)}>
        {renderBoldKpiText(text)}
      </Tag>
    );
  }

  const displayText = normalize ? normalizeKpiText(text) : (text || '');
  
  return (
    <Tag className={cn(preWrapClass, className)}>
      {displayText}
    </Tag>
  );
}
