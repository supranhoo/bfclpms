import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SpeakButton } from '@/components/annual-review/SpeakButton';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';
import type { SelfReviewField } from '@/types/annualReview';

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
              <Textarea
                id={`self-field-${f.id}`}
                rows={3}
                placeholder={placeholder}
                value={value}
                disabled={readOnly}
                readOnly={readOnly}
                onChange={
                  readOnly || !onChange
                    ? undefined
                    : (e) => onChange(f.id, e.target.value)
                }
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}