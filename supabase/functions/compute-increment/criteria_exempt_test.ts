import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Source-level invariants for the criteria-exemption semantics.
// The engine must:
//  1) NOT short-circuit exempt employees into a terminal "excluded" bucket.
//  2) Skip the absent/LWP/disciplinary/training criteria block when exempt.
//  3) Still flow through PMS-score → slab → confirmation-increment rules.
//  4) Persist `criteria_exempt` + `exemption_reason` on increment_run_items.
//  5) Summary must expose `criteria_exempt` counter and drop `excluded`.

const src = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

Deno.test("exemption bypasses criteria block but not ge or score", () => {
  // criteria loop must be gated by !isCriteriaExempt
  assertStringIncludes(src, "criteria.length && !isCriteriaExempt");
  // exempt flag is set from exclusions list
  assertStringIncludes(src, "const isCriteriaExempt = exclusions.has(p.id)");
});

Deno.test("excluded bucket removed from summary; criteria_exempt added", () => {
  // Old terminal 'excluded' branch must be gone
  assertEquals(src.includes("eligibility = 'excluded'"), false);
  assertEquals(src.includes("countExcluded"), false);
  // New counter and summary key present
  assertStringIncludes(src, "countCriteriaExempt");
  assertStringIncludes(src, "criteria_exempt: countCriteriaExempt");
});

Deno.test("run item carries criteria_exempt + exemption_reason", () => {
  assertStringIncludes(src, "criteria_exempt: isCriteriaExempt");
  assertStringIncludes(src, "exemption_reason: exemptionReason");
});