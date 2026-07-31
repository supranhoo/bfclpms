---
name: Annual Review Rating Slab
description: Final Rating (/5) = total_score/20 and admin-configurable increment slab bands used by the Annual Review Report (ADR-212)
type: feature
---
Final Rating (/5) = `annual_review_instances.total_score / 20`, 2 dp. Null score ⇒ null
rating ⇒ null slab (never 0%).

Increment slabs live in `public.annual_review_rating_slabs` (admin/HR PMS editable via
Annual Review → Settings → Rating Slabs). Matching is half-open `[from, to)`, so exact
boundaries go to the HIGHER band (2.00→4%, 2.50→6%, 3.00→8%, 3.50→12%, 4.00→16%,
4.50→20%; below 2 = 0%). Top band is open-ended (`rating_to NULL`).

SSOT: `src/lib/annualReview/ratingSlab.ts` — used by the Detail tab, Comprehensive tab,
both Excel exports and the admin editor. Never hardcode percentages in components.
See ADR-212 / POLICY §AR-RATING-SLAB.