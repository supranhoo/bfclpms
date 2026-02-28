import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { useMentionSearch, type MentionUser } from '@/hooks/useMentionSearch';
import { insertMention, parseMentions, renderMentionText } from '@/lib/mentionUtils';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2 } from 'lucide-react';

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  onMentionsChange?: (userIds: string[]) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}

export function MentionTextarea({
  value,
  onChange,
  onMentionsChange,
  placeholder,
  rows = 2,
  className,
}: MentionTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mentionQuery, setMentionQuery] = useState('');
  const [triggerStart, setTriggerStart] = useState<number | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const { results, isLoading } = useMentionSearch(showDropdown ? mentionQuery : '');

  // Detect @ trigger on input change
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value;
      const cursor = e.target.selectionStart ?? newValue.length;
      onChange(newValue);

      // Look backwards from cursor for an @ trigger
      const textBeforeCursor = newValue.slice(0, cursor);
      const atIndex = textBeforeCursor.lastIndexOf('@');

      if (atIndex >= 0) {
        const charBefore = atIndex > 0 ? textBeforeCursor[atIndex - 1] : ' ';
        const queryText = textBeforeCursor.slice(atIndex + 1);

        // Only trigger if @ is at start or preceded by whitespace, and query has no spaces at end
        if ((charBefore === ' ' || charBefore === '\n' || atIndex === 0) && !queryText.includes('\n')) {
          setTriggerStart(atIndex);
          setMentionQuery(queryText);
          setShowDropdown(true);
          setSelectedIndex(0);
          return;
        }
      }

      setShowDropdown(false);
      setMentionQuery('');
      setTriggerStart(null);
    },
    [onChange]
  );

  const selectUser = useCallback(
    (user: MentionUser) => {
      if (triggerStart === null) return;
      const cursor = textareaRef.current?.selectionStart ?? value.length;
      const { newText, newCursorPos } = insertMention(value, cursor, triggerStart, {
        id: user.id,
        name: user.full_name || user.email,
      });
      onChange(newText);
      setShowDropdown(false);
      setMentionQuery('');
      setTriggerStart(null);

      // Update mentioned user IDs
      const mentions = parseMentions(newText);
      onMentionsChange?.(mentions.map((m) => m.userId));

      // Restore cursor
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      });
    },
    [triggerStart, value, onChange, onMentionsChange]
  );

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showDropdown || results.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % results.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + results.length) % results.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectUser(results[selectedIndex]);
      } else if (e.key === 'Escape') {
        setShowDropdown(false);
      }
    },
    [showDropdown, results, selectedIndex, selectUser]
  );

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    if (showDropdown) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showDropdown]);

  const getInitials = (name: string | null) => {
    if (!name) return '?';
    return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const overlayRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (overlayRef.current && textareaRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  return (
    <div className="relative">
      {/* Visual overlay - renders formatted text behind transparent textarea */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        className={cn(
          'absolute inset-0 min-h-[80px] w-full rounded-md px-3 py-2 text-sm pointer-events-none overflow-hidden whitespace-pre-wrap break-words',
          className
        )}
      >
        {value ? renderMentionText(value) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
        placeholder={value ? undefined : placeholder}
        rows={rows}
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm text-transparent caret-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 relative z-10',
          className
        )}
      />

      {showDropdown && (mentionQuery.length >= 1 || isLoading) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-64 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {isLoading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : results.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No users found</p>
          ) : (
            results.map((user, i) => (
              <button
                key={user.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer',
                  i === selectedIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectUser(user);
                }}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <Avatar className="h-5 w-5">
                  <AvatarFallback className="text-[9px]">{getInitials(user.full_name)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 text-left">
                  <span className="block truncate font-medium text-xs">
                    {user.full_name || user.email}
                  </span>
                  {user.employee_code && (
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {user.employee_code}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
