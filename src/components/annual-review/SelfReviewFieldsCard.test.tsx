import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SelfReviewFieldsCard } from './SelfReviewFieldsCard';
import { AnnualReviewI18nProvider } from './AnnualReviewI18nContext';
import type { SelfReviewField } from '@/types/annualReview';

const FIELDS: SelfReviewField[] = [
  { id: 'best_work', label: 'Best work?', required: true, placeholder: 'Write…' },
  { id: 'daily_problems', label: 'Daily problems?', required: false, placeholder: '' },
];

function wrap(ui: React.ReactNode) {
  return (
    <AnnualReviewI18nProvider currentLanguage="en" defaultLanguage="en" displayMode="bilingual">
      {ui}
    </AnnualReviewI18nProvider>
  );
}

describe('SelfReviewFieldsCard', () => {
  it('renders nothing when there are no fields', () => {
    const { container } = render(wrap(<SelfReviewFieldsCard fields={[]} values={{}} />));
    expect(container.firstChild).toBeNull();
  });

  it('renders every field with required asterisk', () => {
    render(wrap(<SelfReviewFieldsCard fields={FIELDS} values={{}} onChange={() => {}} />));
    expect(screen.getByText('Best work?')).toBeInTheDocument();
    expect(screen.getByText('Daily problems?')).toBeInTheDocument();
    // required asterisk is a sibling span inside the label
    expect(screen.getByText('Best work?').parentElement?.textContent).toContain('*');
  });

  it('calls onChange with (id, value) when edited', () => {
    const onChange = vi.fn();
    render(wrap(<SelfReviewFieldsCard fields={FIELDS} values={{}} onChange={onChange} />));
    fireEvent.change(screen.getByPlaceholderText('Write…'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalledWith('best_work', 'hello');
  });

  it('is fully read-only when readOnly=true and never calls onChange', () => {
    const onChange = vi.fn();
    render(
      wrap(
        <SelfReviewFieldsCard
          fields={FIELDS}
          values={{ best_work: 'saved answer' }}
          readOnly
          onChange={onChange}
        />,
      ),
    );
    const ta = screen.getByDisplayValue('saved answer') as HTMLTextAreaElement;
    expect(ta).toBeDisabled();
    fireEvent.change(ta, { target: { value: 'nope' } });
    expect(onChange).not.toHaveBeenCalled();
  });
});