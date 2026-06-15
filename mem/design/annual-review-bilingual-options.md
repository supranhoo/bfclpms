---
name: Annual Review Bilingual Option Cards
description: Criterion option cards render bilingual "EN / translated" labels when current language differs from default; persisted score stays numeric
type: design
---
When a `TemplateCriterion` has authored `options[]`, `CriteriaScoringMatrix` renders a responsive radio-card grid (1/2/3 cols) instead of the 0–5 round buttons. Option labels use `tTemplateBilingual('option', opt.id, 'label', opt.label)` from `AnnualReviewI18nContext` — returns `"<English> / <translated>"` when `currentLanguage !== defaultLanguage` AND a translation exists, otherwise just the fallback. Names/descriptions stay single-language via `tTemplate`. Header badges (`Weight × Score = Total`) and the `Your Score` heading translate via `col.weight/col.score/col.total/criteria.your_score`. **The persisted score is always the numeric `option.score` (0–5)** — never the joined label string. Criteria without `options[]` keep the legacy 0–5 button row.

**Translation key shape (canonical):** `kind:id:field` — e.g. `option:o5:label`, `criterion:attendance:name`, `field:f1:label`. Writers (`CriterionOptionsDialog`, `TemplateEditorDialog`) and readers (`tTemplate`, `tTemplateBilingual`) must both use colon separators. Earlier dot-separated readers silently dropped every stored translation.