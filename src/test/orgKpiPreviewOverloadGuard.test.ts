import { describe, it, expect } from 'vitest';

/**
 * ADR-058 guard. The DB must expose exactly ONE
 * `preview_org_kpi_propagation` overload — the 4-arg form
 * `(uuid[], numeric, numeric, text)`. The legacy single-arg
 * `(uuid[])` overload was dropped because PostgREST could not
 * disambiguate the two and the Propagate dialog failed with
 * "could not choose the best candidate function".
 *
 * The frontend hook in src/hooks/usePreviewOrgKpiPropagation.ts
 * always sends all four parameters; this test pins that contract.
 */
describe('ADR-058 preview_org_kpi_propagation overload contract', () => {
  it('hook always passes all four named parameters', async () => {
    const src = await import('fs').then((fs) =>
      fs.readFileSync('src/hooks/usePreviewOrgKpiPropagation.ts', 'utf8'),
    );
    expect(src).toContain('p_kpi_ids');
    expect(src).toContain('p_new_value');
    expect(src).toContain('p_new_self_score');
    expect(src).toContain('p_overwrite_policy');
  });
});