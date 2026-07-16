import { useEffect, useLayoutEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SpeakButton } from '@/components/annual-review/SpeakButton';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';
import type { SelfReviewField } from '@/types/annualReview';

/**
 * Auto-growing textarea: syncs height to scrollHeight so the full answer
 * is visible without an internal scrollbar. Min height ≈ 3 rows.
 */
function AutoGrowTextarea(props: {
  id: string;
  value: string;
  placeholder: string;
  disabled?: boolean;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(() => {
    resize();
  }, [props.value, props.readOnly, props.disabled]);

  useEffect(() => {
    const onResize = () => resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <Textarea
      ref={ref}
      id={props.id}
      rows={3}
      placeholder={props.placeholder}
      value={props.value}
      disabled={props.disabled}
      readOnly={props.readOnly}
      onChange={
        props.readOnly || !props.onChange
          ? undefined
          : (e) => props.onChange!(e.target.value)
      }
      className="resize-none overflow-hidden min-h-[5.25rem]"
      style={{ overflowY: 'hidden' }}
    />
  );
}

/**
 * SSOT for rendering the template's `self_review_fields` (Qualitative
 * Responses) — one card, one code path. Used by both:
 *   - `/annual-review` (employee self page) — editable, writes into draft.
 *   - `/annual-review/team/:id` (reviewer detail page) — editable in
 *     proxy-self mode, read-only for every downstream reviewer so
 *     they can read the employee's answers.
 *
 * Every surface accepting self-stage input MUST render this card so
 * required qualitative fields are never silently skipped (see
 * POLICY §AR-SELF-QUALITATIVE).
 */
export interface SelfReviewFieldsCardProps {
  fields: SelfReviewField[];
  values: Record<string, string>;
  readOnly?: boolean;
  onChange?: (id: string, value: string) => void;
  title?: string;
}

export function SelfReviewFieldsCard({
  fields,
  values,
  readOnly = false,
  onChange,
  title,
}: SelfReviewFieldsCardProps) {
  const { t, tTemplate } = useAnnualReviewI18n();
  if (!fields?.length) return null;
  const heading = title ?? t('section.qualitative', 'Qualitative Responses');

  return (
    <Card>
      <CardHeader><CardTitle>{heading}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {fields.map((f) => {
          const label = tTemplate('field', f.id, 'label', f.label);
          const placeholder = tTemplate('field', f.id, 'placeholder', f.placeholder ?? '');
          const value = values?.[f.id] ?? '';
          return (
            <div key={f.id} className="space-y-1">
              <div className="flex items-center gap-2">
                <Label htmlFor={`self-field-${f.id}`}>
                  {label}
                  {f.required && <span className="text-destructive"> *</span>}
                </Label>
                <SpeakButton text={label} />
              </div>
              <AutoGrowTextarea
                id={`self-field-${f.id}`}
                placeholder={placeholder}
                value={value}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={
                  readOnly || !onChange ? undefined : (v) => onChange(f.id, v)
                }
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}