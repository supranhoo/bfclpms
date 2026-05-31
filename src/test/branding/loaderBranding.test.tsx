import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageLoadingOverlay } from '@/components/ui/PageLoadingOverlay';
import { parseHexSetting, DEFAULT_ROCKET_COLOR } from '@/hooks/useBrandingSettings';

// The overlay calls useBrandingSettings() which talks to Supabase via React
// Query. Stub it to a known empty state so we can prove the `branding` prop
// override fully drives the rendered card.
vi.mock('@/hooks/useBrandingSettings', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    useBrandingSettings: () => ({
      companyName: '',
      tagline: '',
      showLogo: false,
      logoUrl: '',
      rocketColor: '#C2410C',
      isLoading: false,
    }),
  };
});

describe('PageLoadingOverlay branding', () => {
  it('renders the bare card when no branding is configured', () => {
    render(<PageLoadingOverlay open variant="inline" />);
    expect(screen.getByText('Please wait')).toBeInTheDocument();
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('renders the company name when configured', () => {
    render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{ companyName: 'ACME Corp' }}
      />,
    );
    expect(screen.getByText('ACME Corp')).toBeInTheDocument();
  });

  it('renders the tagline only when set', () => {
    const { rerender } = render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{ companyName: 'ACME', tagline: '' }}
      />,
    );
    expect(screen.queryByText('Performance Suite')).not.toBeInTheDocument();

    rerender(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{ companyName: 'ACME', tagline: 'Performance Suite' }}
      />,
    );
    expect(screen.getByText('Performance Suite')).toBeInTheDocument();
  });

  it('hides the logo when toggle is off, even if logoUrl is provided', () => {
    render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{
          companyName: 'ACME',
          showLogo: false,
          logoUrl: 'https://example.com/logo.png',
        }}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the logo when toggle is on AND a logoUrl exists', () => {
    render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{
          companyName: 'ACME',
          showLogo: true,
          logoUrl: 'https://example.com/logo.png',
        }}
      />,
    );
    const img = screen.getByRole('img') as HTMLImageElement;
    expect(img.src).toBe('https://example.com/logo.png');
  });

  it('returns null when open=false', () => {
    const { container } = render(<PageLoadingOverlay open={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('applies the configured rocket color to the SVG body', () => {
    const { container } = render(
      <PageLoadingOverlay
        open
        variant="inline"
        branding={{ rocketColor: '#FF8800' }}
      />,
    );
    const bodyPath = container.querySelector('path[d^="M60 18"]');
    expect(bodyPath?.getAttribute('fill')).toBe('#FF8800');
  });

  it('falls back to the default rocket color when none is provided', () => {
    const { container } = render(<PageLoadingOverlay open variant="inline" />);
    const bodyPath = container.querySelector('path[d^="M60 18"]');
    expect(bodyPath?.getAttribute('fill')).toBe(DEFAULT_ROCKET_COLOR);
  });
});

describe('parseHexSetting', () => {
  it('accepts valid 6-digit hex', () => {
    expect(parseHexSetting('"#C2410C"', '#000000')).toBe('#C2410C');
  });
  it('accepts valid 3-digit hex', () => {
    expect(parseHexSetting('#abc', '#000000')).toBe('#abc');
  });
  it('falls back on missing value', () => {
    expect(parseHexSetting(null, '#123456')).toBe('#123456');
    expect(parseHexSetting('', '#123456')).toBe('#123456');
  });
  it('falls back on invalid hex', () => {
    expect(parseHexSetting('orange', '#123456')).toBe('#123456');
    expect(parseHexSetting('#zzz', '#123456')).toBe('#123456');
    expect(parseHexSetting('#12345', '#123456')).toBe('#123456');
  });
});