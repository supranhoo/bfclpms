

## Plan: Formal ADR System + Enhanced POLICY.md Invariants

### Overview
Two complementary changes: (1) create a `docs/adr/` directory with a formal ADR template and migrate existing §29–§49 invariants into individual ADR files, and (2) add a "Decision Context & Alternatives Considered" section to each invariant in POLICY.md.

### Changes

**1. Create `docs/adr/ADR-TEMPLATE.md`**

Standard ADR template with fields:
- **ADR Number / Title**
- **Status**: Accepted | Superseded | Deprecated
- **Date**
- **Context**: Problem statement and background
- **Decision**: What was decided
- **Alternatives Considered**: Each alternative with reason for rejection
- **Consequences**: Positive, negative, and neutral impacts
- **Related**: Links to POLICY.md section, code files

**2. Create individual ADR files for each existing invariant (§29–§49)**

21 files: `docs/adr/ADR-029.md` through `docs/adr/ADR-049.md`. Each migrates the existing Rule/Rationale/Invariant into the formal template and adds reconstructed "Alternatives Considered" based on the rationale text. Examples:

| ADR | Title | Key Alternative Rejected |
|-----|-------|--------------------------|
| 029 | Scope-Aware Propagation Validation | Check only top-level field (breaks scoped KPIs) |
| 030 | Org KPI Audit Log Completeness | Client-side-only logging (unreliable, bypassable) |
| 033 | Rollback Cascade-Clear | Clear only stages after target using `>` (leaves stale target data) |
| 034 | Admin Edit Final Score Recomputation | Gate recomputation behind advance_status toggle (leaves stale final_score) |
| 040 | Single-Source Query Notifications | Dual insert from frontend + trigger (duplicates, inconsistent metadata) |
| 042 | Dynamic Program Config Tabs | Hardcoded tabs in component (requires deployment for changes) |

**3. Add "Decision Context" to each §29–§49 in `POLICY.md`**

After each existing **Invariant** paragraph, add:

```markdown
**Decision Context & Alternatives Considered:**
- *Alternative A: [description]* — Rejected because [reason].
- *Alternative B: [description]* — Rejected because [reason].
- *Chosen approach:* [brief restatement linking to ADR-0XX].
```

**4. Add ADR index to `POLICY.md`**

New section **§50 — Architectural Decision Record Index** with a table linking ADR numbers to §section numbers and file paths.

**5. Update `DOCUMENTATION.md`** — v2.15.59

### Files Created/Modified

| File | Change |
|------|--------|
| `docs/adr/ADR-TEMPLATE.md` | New — formal ADR template |
| `docs/adr/ADR-029.md` through `ADR-049.md` | New — 21 individual ADR files |
| `POLICY.md` | Add Decision Context to §29–§49; add §50 ADR Index |
| `DOCUMENTATION.md` | v2.15.59 |

### Risk
- **None** — purely documentation; zero code or schema changes
- Existing invariant text is preserved verbatim; new sections are additive

