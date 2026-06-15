---
name: Annual Review Bilingual Option Cards
description: Criterion option cards render bilingual "EN / translated" labels when current language differs from default; persisted score stays numeric
type: design
---
When a `TemplateCriterion` has authored `options[]`, `CriteriaScoringMatrix` renders a responsive radio-card grid (1/2/3 cols) instead of the 0–5 round buttons. Option labels use `tTemplateBilingual('option', opt.id, 'label', opt.label)` from `AnnualReviewI18nContext` — returns `"<English> / <translated>"` when `currentLanguage !== defaultLanguage` AND a translation exists, otherwise just the fallback. Names/descriptions stay single-language via `tTemplate`. Header badges (`Weight × Score = Total`) and the `Your Score` heading translate via `col.weight/col.score/col.total/criteria.your_score`. **The persisted score is always the numeric `option.score` (0–5)** — never the joined label string. Criteria without `options[]` keep the legacy 0–5 button row.