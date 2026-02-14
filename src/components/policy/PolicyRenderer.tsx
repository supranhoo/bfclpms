import { useMemo } from 'react';

interface PolicyRendererProps {
  content: string;
}

interface TocEntry {
  id: string;
  text: string;
  level: number;
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function parseMarkdownLine(line: string): string {
  // Bold
  let html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">$1</code>');
  return html;
}

function renderContent(content: string): { html: string; toc: TocEntry[] } {
  const lines = content.split('\n');
  const toc: TocEntry[] = [];
  const outputLines: string[] = [];
  let inTable = false;
  let inCodeBlock = false;
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        outputLines.push('</code></pre>');
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        outputLines.push('<pre class="bg-muted/50 border border-border rounded-lg p-4 overflow-x-auto my-4"><code class="text-sm font-mono text-foreground whitespace-pre">');
      }
      continue;
    }
    if (inCodeBlock) {
      outputLines.push(line.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
      continue;
    }

    // Close list if current line is not a list item
    const isUnorderedItem = /^(\s*)[-*]\s+/.test(line);
    const isOrderedItem = /^(\s*)\d+\.\s+/.test(line);
    if (inList && !isUnorderedItem && !isOrderedItem && line.trim() !== '') {
      outputLines.push(listType === 'ul' ? '</ul>' : '</ol>');
      inList = false;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
    if (headingMatch) {
      if (inTable) { outputLines.push('</tbody></table></div>'); inTable = false; }
      const level = headingMatch[1].length;
      const text = headingMatch[2];
      const id = slugify(text);
      toc.push({ id, text, level });
      const sizes: Record<number, string> = {
        1: 'text-3xl font-bold mt-10 mb-4',
        2: 'text-2xl font-bold mt-8 mb-3',
        3: 'text-xl font-semibold mt-6 mb-2',
        4: 'text-lg font-semibold mt-4 mb-2',
      };
      outputLines.push(`<h${level} id="${id}" class="${sizes[level]} text-foreground scroll-mt-20">${parseMarkdownLine(text)}</h${level}>`);
      continue;
    }

    // Table rows
    if (line.includes('|') && line.trim().startsWith('|')) {
      const cells = line.split('|').filter(c => c.trim() !== '');
      // Separator row
      if (cells.every(c => /^[\s-:]+$/.test(c))) continue;

      if (!inTable) {
        inTable = true;
        outputLines.push('<div class="overflow-x-auto my-4"><table class="w-full border-collapse text-sm">');
        // First row is header
        outputLines.push('<thead><tr>');
        cells.forEach(c => outputLines.push(`<th class="border border-border bg-muted/50 px-3 py-2 text-left font-semibold text-foreground">${parseMarkdownLine(c.trim())}</th>`));
        outputLines.push('</tr></thead><tbody>');
        continue;
      }
      outputLines.push('<tr>');
      cells.forEach(c => outputLines.push(`<td class="border border-border px-3 py-2 text-muted-foreground">${parseMarkdownLine(c.trim())}</td>`));
      outputLines.push('</tr>');
      continue;
    } else if (inTable) {
      outputLines.push('</tbody></table></div>');
      inTable = false;
    }

    // Checkbox items
    if (/^[-*]\s+\[[ x]\]/.test(line.trim())) {
      const checked = line.includes('[x]');
      const text = line.replace(/^[-*]\s+\[[ x]\]\s*/, '');
      outputLines.push(`<div class="flex items-start gap-2 my-1"><span class="mt-1 ${checked ? 'text-primary' : 'text-muted-foreground'}">${checked ? '☑' : '☐'}</span><span class="text-muted-foreground">${parseMarkdownLine(text.trim())}</span></div>`);
      continue;
    }

    // Unordered list
    if (isUnorderedItem) {
      const text = line.replace(/^\s*[-*]\s+/, '');
      const indent = (line.match(/^(\s*)/)?.[1].length || 0) >= 2;
      if (!inList) { inList = true; listType = 'ul'; outputLines.push('<ul class="list-disc pl-6 my-2 space-y-1">'); }
      outputLines.push(`<li class="text-muted-foreground ${indent ? 'ml-4' : ''}">${parseMarkdownLine(text)}</li>`);
      continue;
    }

    // Ordered list
    if (isOrderedItem) {
      const text = line.replace(/^\s*\d+\.\s+/, '');
      if (!inList) { inList = true; listType = 'ol'; outputLines.push('<ol class="list-decimal pl-6 my-2 space-y-1">'); }
      outputLines.push(`<li class="text-muted-foreground">${parseMarkdownLine(text)}</li>`);
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      outputLines.push('<hr class="border-border my-6" />');
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      if (inList) { outputLines.push(listType === 'ul' ? '</ul>' : '</ol>'); inList = false; }
      continue;
    }

    // Paragraph
    outputLines.push(`<p class="text-muted-foreground leading-relaxed my-2">${parseMarkdownLine(line)}</p>`);
  }

  // Close open elements
  if (inTable) outputLines.push('</tbody></table></div>');
  if (inList) outputLines.push(listType === 'ul' ? '</ul>' : '</ol>');
  if (inCodeBlock) outputLines.push('</code></pre>');

  return { html: outputLines.join('\n'), toc };
}

export function PolicyTableOfContents({ toc, className }: { toc: TocEntry[]; className?: string }) {
  return (
    <nav className={className}>
      <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">Contents</h3>
      <ul className="space-y-1">
        {toc.filter(e => e.level <= 2).map(entry => (
          <li key={entry.id} className={entry.level === 2 ? 'ml-0' : ''}>
            <a
              href={`#${entry.id}`}
              className="block text-sm text-muted-foreground hover:text-primary transition-colors py-0.5 truncate"
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function PolicyRenderer({ content }: PolicyRendererProps) {
  const { html, toc } = useMemo(() => renderContent(content), [content]);

  return (
    <div className="flex gap-8">
      {/* Sticky TOC sidebar */}
      <aside className="hidden lg:block w-64 shrink-0">
        <div className="sticky top-24">
          <PolicyTableOfContents toc={toc} />
        </div>
      </aside>
      {/* Main content */}
      <div className="flex-1 min-w-0 max-w-4xl" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
