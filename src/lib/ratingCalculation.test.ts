import { describe, it, expect } from "vitest";
import {
  parseThreshold,
  ratingToLevel,
  levelToText,
  calculateRating,
  calculateOverallScore,
  getNextStatus,
  getStatusLabel,
  getNextStatusForWorkflow,
  isStageInWorkflow,
  RatingThresholds,
} from "./ratingCalculation";

describe("parseThreshold", () => {
  describe("with asRatio=true (default)", () => {
    it("returns null for null/undefined/empty values", () => {
      expect(parseThreshold(null)).toBeNull();
      expect(parseThreshold(undefined)).toBeNull();
      expect(parseThreshold("")).toBeNull();
    });

    it("returns number values directly if <= 1", () => {
      expect(parseThreshold(0.95)).toBe(0.95);
      expect(parseThreshold(1)).toBe(1);
    });

    it("converts percentage strings to ratios", () => {
      expect(parseThreshold("95%")).toBe(0.95);
      expect(parseThreshold("100%")).toBe(1);
      expect(parseThreshold("99.95%")).toBe(0.9995);
    });

    it("handles comma decimal separators", () => {
      expect(parseThreshold("99,95%")).toBe(0.9995);
    });

    it("converts bare string numbers > 1 to ratios (assumes percentage)", () => {
      expect(parseThreshold("95")).toBe(0.95);
      expect(parseThreshold("100")).toBe(1);
    });

    it("returns raw numeric values as-is (only strings are parsed for %)", () => {
      // Raw numbers are returned directly - parseThreshold only converts strings
      expect(parseThreshold(95)).toBe(95);
      expect(parseThreshold(110)).toBe(110);
    });

    it("returns values <= 1 as-is (already ratios)", () => {
      expect(parseThreshold("0.95")).toBe(0.95);
      expect(parseThreshold(0.9)).toBe(0.9);
    });

    it("returns NaN values as null", () => {
      expect(parseThreshold("invalid")).toBeNull();
      expect(parseThreshold("abc%")).toBeNull();
    });
  });

  describe("with asRatio=false (absolute numbers)", () => {
    it("returns number values as-is", () => {
      expect(parseThreshold(5, false)).toBe(5);
      expect(parseThreshold(100, false)).toBe(100);
    });

    it("parses string numbers without converting", () => {
      expect(parseThreshold("5", false)).toBe(5);
      expect(parseThreshold("100", false)).toBe(100);
    });

    it("removes % but keeps value", () => {
      expect(parseThreshold("95%", false)).toBe(95);
    });
  });

  describe("with comparison operators", () => {
    it("parses '>98' as 98 (absolute mode)", () => {
      expect(parseThreshold(">98", false)).toBe(98);
    });

    it("parses '<94' as 94 (absolute mode)", () => {
      expect(parseThreshold("<94", false)).toBe(94);
    });

    it("parses '>=100' as 100 (absolute mode)", () => {
      expect(parseThreshold(">=100", false)).toBe(100);
    });

    it("parses '<=50' as 50 (absolute mode)", () => {
      expect(parseThreshold("<=50", false)).toBe(50);
    });

    it("parses '>98%' as 0.98 (ratio mode)", () => {
      expect(parseThreshold(">98%", true)).toBe(0.98);
    });

    it("parses '<=99.5%' as 0.995 (ratio mode)", () => {
      expect(parseThreshold("<=99.5%", true)).toBe(0.995);
    });

    it("parses '>98' as 0.98 (ratio mode - bare number > 1 assumed %)", () => {
      expect(parseThreshold(">98", true)).toBe(0.98);
    });

    it("handles spaces after operator", () => {
      expect(parseThreshold("> 98", false)).toBe(98);
      expect(parseThreshold("<= 50%", false)).toBe(50);
    });
  });
});

describe("ratingToLevel", () => {
  it("returns blue for rating 5", () => {
    expect(ratingToLevel(5)).toBe("blue");
  });

  it("returns green for ratings 4-4.99", () => {
    expect(ratingToLevel(4)).toBe("green");
    expect(ratingToLevel(4.5)).toBe("green");
    expect(ratingToLevel(4.99)).toBe("green");
  });

  it("returns yellow for ratings 3-3.99", () => {
    expect(ratingToLevel(3)).toBe("yellow");
    expect(ratingToLevel(3.5)).toBe("yellow");
    expect(ratingToLevel(3.99)).toBe("yellow");
  });

  it("returns red for ratings < 3", () => {
    expect(ratingToLevel(2)).toBe("red");
    expect(ratingToLevel(2.5)).toBe("red");
    expect(ratingToLevel(2.99)).toBe("red");
    expect(ratingToLevel(1)).toBe("red");
    expect(ratingToLevel(0)).toBe("red");
    expect(ratingToLevel(1.99)).toBe("red");
  });
});

describe("levelToText", () => {
  it("returns correct text for each level", () => {
    expect(levelToText("blue")).toBe("Outstanding");
    expect(levelToText("green")).toBe("Exceeds Expectations");
    expect(levelToText("yellow")).toBe("Meets Expectations");
    expect(levelToText("red")).toBe("Below Expectations");
  });
});

describe("calculateRating", () => {
  const defaultThresholds: RatingThresholds = {
    r5: "100%",
    r4: "95%",
    r3: "90%",
    r2: "80%",
    r1: "70%",
    r0: "0%",
  };

  describe("numeric UOM - Higher is Better (ratio mode)", () => {
    it("returns rating 5 when achieved >= 100% of target", () => {
      const result = calculateRating(100, 100, defaultThresholds, "Higher is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(5);
      expect(result.ratingLevel).toBe("blue");
      expect(result.percentage).toBe(100);
    });

    it("returns rating 4 when achieved is 95-99% of target", () => {
      const result = calculateRating(97, 100, defaultThresholds, "Higher is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(4);
      expect(result.ratingLevel).toBe("green");
    });

    it("returns rating 3 when achieved is 90-94% of target", () => {
      const result = calculateRating(92, 100, defaultThresholds, "Higher is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(3);
      expect(result.ratingLevel).toBe("yellow");
    });

    it("returns rating 2 when achieved is 80-89% of target", () => {
      const result = calculateRating(85, 100, defaultThresholds, "Higher is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(2);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns rating 1 when achieved is 70-79% of target", () => {
      const result = calculateRating(75, 100, defaultThresholds, "Higher is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(1);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns rating 0 when achieved is < 70% of target", () => {
      const result = calculateRating(50, 100, defaultThresholds, "Higher is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(0);
      expect(result.ratingLevel).toBe("red");
    });

    it("calculates weighted score correctly", () => {
      const result = calculateRating(100, 100, defaultThresholds, "Higher is Better", 20, 'numeric', null, null, 'ratio');
      expect(result.weightedScore).toBe(100); // 20 * 5
    });

    it("handles exceeding target (>100%)", () => {
      const result = calculateRating(120, 100, defaultThresholds, "Higher is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(5);
      expect(result.percentage).toBe(120);
    });
  });

  describe("numeric UOM - Higher is Better (absolute mode - default)", () => {
    const absoluteThresholds: RatingThresholds = {
      r5: "100",
      r4: "95",
      r3: "90",
      r2: "80",
      r1: "70",
    };

    it("returns rating 5 when achieved >= R5 threshold", () => {
      const result = calculateRating(105, 100, absoluteThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(5);
      expect(result.ratingLevel).toBe("blue");
    });

    it("returns rating 4 when achieved >= R4 but < R5", () => {
      const result = calculateRating(97, 100, absoluteThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(4);
    });

    it("returns rating 3 when achieved >= R3 but < R4", () => {
      const result = calculateRating(92, 100, absoluteThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(3);
    });

    it("returns rating 2 when achieved >= R2 but < R3", () => {
      const result = calculateRating(85, 100, absoluteThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(2);
    });

    it("returns rating 1 when achieved >= R1 but < R2", () => {
      const result = calculateRating(75, 100, absoluteThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(1);
    });

    it("returns rating 0 when achieved < R1", () => {
      const result = calculateRating(50, 100, absoluteThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(0);
    });

    it("handles exceeding highest threshold", () => {
      const result = calculateRating(120, 100, absoluteThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(5);
    });
  });

  describe("numeric UOM - Lower is Better (absolute mode)", () => {
    const absoluteThresholds: RatingThresholds = {
      r5: "90",
      r4: "95",
      r3: "100",
      r2: "105",
      r1: "110",
    };

    it("returns rating 5 when achieved <= R5 threshold", () => {
      const result = calculateRating(88, 100, absoluteThresholds, "Lower is Better", 10, 'numeric', null, null, 'absolute');
      expect(result.rating).toBe(5);
    });

    it("returns rating 4 when achieved <= R4 but > R5", () => {
      const result = calculateRating(93, 100, absoluteThresholds, "Lower is Better", 10, 'numeric', null, null, 'absolute');
      expect(result.rating).toBe(4);
    });

    it("returns rating 0 when achieved > R1", () => {
      const result = calculateRating(115, 100, absoluteThresholds, "Lower is Better", 10, 'numeric', null, null, 'absolute');
      expect(result.rating).toBe(0);
    });
  });

  describe("numeric UOM - Lower is Better (ratio mode)", () => {
    const lowerBetterThresholds: RatingThresholds = {
      r5: "100%",
      r4: "110%",
      r3: "120%",
      r2: "130%",
      r1: "140%",
    };

    it("returns rating 5 when achieved equals target (ratio = 1)", () => {
      // Use 'ratio' mode for legacy percentage-based thresholds
      const result = calculateRating(10, 10, lowerBetterThresholds, "Lower is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(5);
    });

    it("returns higher rating when achieved is lower than target", () => {
      // achieved = 8, target = 10, ratio = 10/8 = 1.25 (125%)
      const result = calculateRating(8, 10, lowerBetterThresholds, "Lower is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(5); // 1.25 >= 1.0 threshold
    });

    it("returns lower rating when achieved exceeds target", () => {
      // achieved = 15, target = 10, ratio = 10/15 = 0.67
      const result = calculateRating(15, 10, lowerBetterThresholds, "Lower is Better", 10, 'numeric', null, null, 'ratio');
      expect(result.rating).toBe(0); // ratio < 1.0
    });
  });

  describe("target = 0 (absolute threshold comparison)", () => {
    const absoluteThresholds: RatingThresholds = {
      r5: "1",
      r4: "2",
      r3: "3",
      r2: "4",
      r1: "5",
    };

    it("compares achieved directly against thresholds (lower = better)", () => {
      const result = calculateRating(1, 0, absoluteThresholds, "Lower is Better", 10);
      expect(result.rating).toBe(5);
    });

    it("returns rating 3 for achieved = 3", () => {
      const result = calculateRating(3, 0, absoluteThresholds, "Lower is Better", 10);
      expect(result.rating).toBe(3);
    });

    it("returns rating 0 for achieved > highest threshold", () => {
      const result = calculateRating(10, 0, absoluteThresholds, "Lower is Better", 10);
      expect(result.rating).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("returns zero rating for null achieved value", () => {
      const result = calculateRating(null, 100, defaultThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(0);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns zero rating for undefined achieved value", () => {
      const result = calculateRating(undefined, 100, defaultThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(0);
    });

    it("returns zero rating for empty string achieved value", () => {
      const result = calculateRating("", 100, defaultThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(0);
    });

    it("handles string achieved values", () => {
      const result = calculateRating("95", 100, defaultThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(4);
    });

    it("returns zero for NaN achieved values", () => {
      const result = calculateRating("invalid", 100, defaultThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(0);
    });

    it("handles null thresholds gracefully", () => {
      const partialThresholds: RatingThresholds = {
        r5: null,
        r4: "95%",
        r3: "90%",
        r2: null,
        r1: null,
      };
      const result = calculateRating(97, 100, partialThresholds, "Higher is Better", 10);
      expect(result.rating).toBe(4);
    });
  });

  describe("qualitative UOM - binary", () => {
    it("returns rating 5 for Yes value", () => {
      const result = calculateRating("Yes", null, defaultThresholds, "Higher is Better", 10, "binary");
      expect(result.rating).toBe(5);
      expect(result.ratingLevel).toBe("blue");
    });

    it("returns rating 0 for No value", () => {
      const result = calculateRating("No", null, defaultThresholds, "Higher is Better", 10, "binary");
      expect(result.rating).toBe(0);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns zero for null binary value", () => {
      const result = calculateRating(null, null, defaultThresholds, "Higher is Better", 10, "binary");
      expect(result.rating).toBe(0);
    });
  });

  describe("qualitative UOM - tiered", () => {
    const tieredOptions = [
      { label: "Excellent", rating: 5, definition: "Outstanding performance" },
      { label: "Good", rating: 4, definition: "Above average" },
      { label: "Satisfactory", rating: 3, definition: "Meets expectations" },
      { label: "Poor", rating: 1, definition: "Needs improvement" },
    ];

    it("returns correct rating for tiered option", () => {
      const result = calculateRating(
        "Good",
        null,
        defaultThresholds,
        "Higher is Better",
        10,
        "tiered",
        tieredOptions
      );
      expect(result.rating).toBe(4);
      // Note: scoreToRatingLevel in qualitativeUom maps rating 4 to 'green'
      expect(result.ratingLevel).toBe("green");
    });

    it("returns zero for unmatched tiered value", () => {
      const result = calculateRating(
        "Unknown",
        null,
        defaultThresholds,
        "Higher is Better",
        10,
        "tiered",
        tieredOptions
      );
      expect(result.rating).toBe(0);
    });

    it("calculates weighted score for tiered", () => {
      const result = calculateRating(
        "Satisfactory",
        null,
        defaultThresholds,
        "Higher is Better",
        20,
        "tiered",
        tieredOptions
      );
      expect(result.weightedScore).toBe(60); // 20 * 3
    });
  });

  describe("Date UOM", () => {
    const dateThresholds: RatingThresholds = {
      r5: "1",
      r4: "2",
      r3: "3",
      r2: "4",
      r1: "5",
    };

    it("returns rating 5 for value 0 (completed before review month)", () => {
      const result = calculateRating(0, null, dateThresholds, "Lower is Better", 10, "numeric", null, "Date");
      expect(result.rating).toBe(5);
      expect(result.ratingLevel).toBe("blue");
    });

    it("returns rating 5 for day 1", () => {
      const result = calculateRating(1, null, dateThresholds, "Lower is Better", 10, "numeric", null, "Date");
      expect(result.rating).toBe(5);
    });

    it("returns rating 0 for day 6+", () => {
      const result = calculateRating(6, null, dateThresholds, "Lower is Better", 10, "numeric", null, "Date");
      expect(result.rating).toBe(0);
    });

    it("returns rating 0 for null value", () => {
      const result = calculateRating(null, null, dateThresholds, "Lower is Better", 10, "numeric", null, "Date");
      expect(result.rating).toBe(0);
    });
  });
});

describe("calculateOverallScore", () => {
  it("calculates weighted average correctly", () => {
    const kpiResults = [
      { rating: 5, weightage: 30 },
      { rating: 4, weightage: 40 },
      { rating: 3, weightage: 30 },
    ];
    const result = calculateOverallScore(kpiResults);
    // (5*30 + 4*40 + 3*30) / 100 = (150 + 160 + 90) / 100 = 4.0
    expect(result.overallRating).toBe(4);
    expect(result.overallLevel).toBe("green");
  });

  it("returns zero for empty results", () => {
    const result = calculateOverallScore([]);
    expect(result.overallRating).toBe(0);
    expect(result.overallLevel).toBe("red");
  });

  it("returns zero when total weightage is 0", () => {
    const kpiResults = [
      { rating: 5, weightage: 0 },
      { rating: 4, weightage: 0 },
    ];
    const result = calculateOverallScore(kpiResults);
    expect(result.overallRating).toBe(0);
  });

  it("handles single KPI", () => {
    const kpiResults = [{ rating: 4, weightage: 100 }];
    const result = calculateOverallScore(kpiResults);
    expect(result.overallRating).toBe(4);
    expect(result.overallLevel).toBe("green");
  });

  it("rounds to 2 decimal places", () => {
    const kpiResults = [
      { rating: 5, weightage: 33 },
      { rating: 4, weightage: 33 },
      { rating: 3, weightage: 34 },
    ];
    const result = calculateOverallScore(kpiResults);
    expect(result.overallRating).toBe(3.99);
  });
});

describe("getNextStatus", () => {
  it("returns correct next status for each stage", () => {
    expect(getNextStatus("kra_set")).toBe("self_review");
    expect(getNextStatus("self_review")).toBe("manager_check");
    expect(getNextStatus("manager_check")).toBe("audit");
    expect(getNextStatus("audit")).toBe("management_review");
    expect(getNextStatus("management_review")).toBe("approved");
  });

  it("returns null for approved status", () => {
    expect(getNextStatus("approved")).toBeNull();
  });

  it("returns null for unknown status", () => {
    expect(getNextStatus("unknown")).toBeNull();
  });
});

describe("getStatusLabel", () => {
  it("returns correct labels for each status", () => {
    expect(getStatusLabel("kra_set")).toBe("KRA Set");
    expect(getStatusLabel("self_review")).toBe("Self Review");
    expect(getStatusLabel("manager_check")).toBe("Manager Review");
    expect(getStatusLabel("audit")).toBe("Audit Review");
    expect(getStatusLabel("approved")).toBe("Approved");
  });

  it("returns status itself for unknown status", () => {
    expect(getStatusLabel("unknown")).toBe("unknown");
  });
});

describe("getNextStatusForWorkflow", () => {
  const workflow = ["kra_set", "self_review", "manager_check", "approved"];

  it("returns next stage in workflow", () => {
    expect(getNextStatusForWorkflow("kra_set", workflow)).toBe("self_review");
    expect(getNextStatusForWorkflow("self_review", workflow)).toBe("manager_check");
    expect(getNextStatusForWorkflow("manager_check", workflow)).toBe("approved");
  });

  it("returns null for last stage", () => {
    expect(getNextStatusForWorkflow("approved", workflow)).toBeNull();
  });

  it("returns null for status not in workflow", () => {
    expect(getNextStatusForWorkflow("audit", workflow)).toBeNull();
  });
});

describe("isStageInWorkflow", () => {
  const workflow = ["kra_set", "self_review", "manager_check", "approved"];

  it("returns true for stages in workflow", () => {
    expect(isStageInWorkflow("kra_set", workflow)).toBe(true);
    expect(isStageInWorkflow("self_review", workflow)).toBe(true);
  });

  it("returns false for stages not in workflow", () => {
    expect(isStageInWorkflow("audit", workflow)).toBe(false);
    expect(isStageInWorkflow("unknown", workflow)).toBe(false);
  });
});

describe("calculateRating with Date UOM", () => {
  const dateThresholds: RatingThresholds = {
    r5: "5",    // By 5th day = Rating 5
    r4: "10",   // By 10th day = Rating 4
    r3: "15",   // By 15th day = Rating 3
    r2: "20",   // By 20th day = Rating 2
    r1: "31",   // By end of month = Rating 1
    r0: null,
  };

  it("returns rating 5 for day <= R5 threshold", () => {
    const result = calculateRating(5, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result.rating).toBe(5);
    expect(result.ratingLevel).toBe("blue");
  });

  it("returns rating 4 for day between R5 and R4", () => {
    const result = calculateRating(8, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result.rating).toBe(4);
    expect(result.ratingLevel).toBe("green");
  });

  it("returns rating 3 for day between R4 and R3", () => {
    const result = calculateRating(12, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result.rating).toBe(3);
    expect(result.ratingLevel).toBe("yellow");
  });

  it("returns rating 2 for day between R3 and R2", () => {
    const result = calculateRating(18, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result.rating).toBe(2);
    expect(result.ratingLevel).toBe("red");
  });

  it("returns rating 1 for day between R2 and R1", () => {
    const result = calculateRating(25, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result.rating).toBe(1);
    expect(result.ratingLevel).toBe("red");
  });

  it("calculates weighted score correctly for Date UOM", () => {
    const result = calculateRating(3, null, dateThresholds, "Higher is Better", 20, "numeric", null, "Date");
    expect(result.rating).toBe(5);
    expect(result.weightedScore).toBe(100); // 20 * 5
  });

  it("returns zero for invalid day values (but 0 is valid for pre-month)", () => {
    // 0 is now valid — means "completed before review month"
    expect(calculateRating(0, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date").rating).toBe(5);
    expect(calculateRating(32, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date").rating).toBe(0);
    expect(calculateRating(-1, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date").rating).toBe(0);
  });

  it("returns zero for null achieved value", () => {
    const result = calculateRating(null, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result.rating).toBe(0);
    expect(result.ratingLevel).toBe("red");
  });

  it("handles string day values", () => {
    const result = calculateRating("7", null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result.rating).toBe(4);
  });

  it("returns percentage as 0 for Date UOM", () => {
    const result = calculateRating(5, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result.percentage).toBe(0);
  });

  it("ignores target value for Date UOM", () => {
    // Target value should not affect Date UOM calculation
    const result1 = calculateRating(5, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    const result2 = calculateRating(5, 100, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    expect(result1.rating).toBe(result2.rating);
  });

  it("ignores criteria parameter for Date UOM", () => {
    // Date UOM always uses "Lower is Better" logic (earlier = higher rating)
    const result1 = calculateRating(5, null, dateThresholds, "Higher is Better", 10, "numeric", null, "Date");
    const result2 = calculateRating(5, null, dateThresholds, "Lower is Better", 10, "numeric", null, "Date");
    expect(result1.rating).toBe(result2.rating);
  });
});

describe("calculateRating with Percentage (%) UOM", () => {
  describe("Lower is Better", () => {
    const thresholds: RatingThresholds = {
      r5: "99",     // ≤ 99% = Rating 5
      r4: "99.5",   // ≤ 99.5% = Rating 4
      r3: "100",    // ≤ 100% = Rating 3
      r2: "100.5",  // ≤ 100.5% = Rating 2
      r1: "101",    // ≤ 101% = Rating 1
      r0: null,
    };

    it("returns rating 5 when achieved ≤ R5 threshold", () => {
      const result = calculateRating(98.5, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(5);
      expect(result.ratingLevel).toBe("blue");
    });

    it("returns rating 4 when achieved between R5 and R4", () => {
      const result = calculateRating(99.3, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(4);
      expect(result.ratingLevel).toBe("green");
    });

    it("returns rating 3 when achieved between R4 and R3", () => {
      const result = calculateRating(99.8, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(3);
      expect(result.ratingLevel).toBe("yellow");
    });

    it("returns rating 2 when achieved between R3 and R2", () => {
      // Target (95) is passed but should be IGNORED - only achieved value matters
      const result = calculateRating(100.4, 95, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(2);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns rating 1 when achieved between R2 and R1", () => {
      const result = calculateRating(100.8, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(1);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns rating 0 when achieved > R1 threshold", () => {
      const result = calculateRating(102, 100, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(0);
      expect(result.ratingLevel).toBe("red");
    });

    it("ignores target value completely", () => {
      // Target should NOT affect the calculation at all
      const result1 = calculateRating(99, null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      const result2 = calculateRating(99, 50, thresholds, "Lower is Better", 10, "numeric", null, "%");
      const result3 = calculateRating(99, 200, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result1.rating).toBe(result2.rating);
      expect(result2.rating).toBe(result3.rating);
      expect(result1.rating).toBe(5);
    });

    describe("R0 threshold (Maintenance Cost Control regression)", () => {
      // Repaired master data: R5=99, R4=99.5, R3=100, R2=100.5, R1=101, R0=>101
      const repaired: RatingThresholds = {
        r5: "99%", r4: "99.5%", r3: "100%", r2: "100.5%", r1: "101%", r0: ">101%",
      };

      it("explicitly returns 0 when achieved exceeds R0 (>101%)", () => {
        const result = calculateRating(105, 100, repaired, "Lower is Better", 10, "numeric", null, "%");
        expect(result.rating).toBe(0);
      });

      it("returns 1 at exactly 101% (R1 boundary)", () => {
        const result = calculateRating(101, 100, repaired, "Lower is Better", 10, "numeric", null, "%");
        expect(result.rating).toBe(1);
      });

      it("returns 2 at 100.5% (R2 — repaired from typo R2=1)", () => {
        const result = calculateRating(100.5, 100, repaired, "Lower is Better", 10, "numeric", null, "%");
        expect(result.rating).toBe(2);
      });

      it("with corrupted R2=1 typo, value 100.3 still falls through to R1 (regression guard)", () => {
        const corrupted: RatingThresholds = {
          r5: "99%", r4: "99.5%", r3: "100%", r2: "1%", r1: "101%", r0: ">101%",
        };
        // 100.3 is > R3(100), > R2(1) [broken cascade], <= R1(101) → R1
        const result = calculateRating(100.3, 100, corrupted, "Lower is Better", 10, "numeric", null, "%");
        expect(result.rating).toBe(1);
      });
    });
  });

  describe("Higher is Better", () => {
    const thresholds: RatingThresholds = {
      r5: "101",    // ≥ 101% = Rating 5
      r4: "100.5",  // ≥ 100.5% = Rating 4
      r3: "100",    // ≥ 100% = Rating 3
      r2: "99.5",   // ≥ 99.5% = Rating 2
      r1: "99",     // ≥ 99% = Rating 1
      r0: null,
    };

    it("returns rating 5 when achieved ≥ R5 threshold", () => {
      const result = calculateRating(102, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(5);
      expect(result.ratingLevel).toBe("blue");
    });

    it("returns rating 4 when achieved between R5 and R4", () => {
      const result = calculateRating(100.7, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(4);
      expect(result.ratingLevel).toBe("green");
    });

    it("returns rating 3 when achieved between R4 and R3", () => {
      const result = calculateRating(100.2, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(3);
      expect(result.ratingLevel).toBe("yellow");
    });

    it("returns rating 2 when achieved between R3 and R2", () => {
      const result = calculateRating(99.7, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(2);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns rating 1 when achieved between R2 and R1", () => {
      const result = calculateRating(99.2, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(1);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns rating 0 when achieved < R1 threshold", () => {
      const result = calculateRating(98, 100, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(0);
      expect(result.ratingLevel).toBe("red");
    });

    it("ignores target value completely", () => {
      const result1 = calculateRating(101, null, thresholds, "Higher is Better", 10, "numeric", null, "%");
      const result2 = calculateRating(101, 50, thresholds, "Higher is Better", 10, "numeric", null, "%");
      const result3 = calculateRating(101, 200, thresholds, "Higher is Better", 10, "numeric", null, "%");
      expect(result1.rating).toBe(result2.rating);
      expect(result2.rating).toBe(result3.rating);
      expect(result1.rating).toBe(5);
    });
  });

  describe("edge cases", () => {
    const thresholds: RatingThresholds = {
      r5: "99",
      r4: "100",
      r3: "101",
      r2: "102",
      r1: "103",
      r0: null,
    };

    it("calculates weighted score correctly", () => {
      const result = calculateRating(98, null, thresholds, "Lower is Better", 20, "numeric", null, "%");
      expect(result.rating).toBe(5);
      expect(result.weightedScore).toBe(100); // 20 * 5
    });

    it("returns percentage as 0 for % UOM (not applicable)", () => {
      const result = calculateRating(98, null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.percentage).toBe(0);
      expect(result.achievedWeight).toBe(0);
    });

    it("handles string achieved values", () => {
      const result = calculateRating("98.5", null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(5);
    });

    it("handles threshold values with % sign", () => {
      const thresholdsWithPercent: RatingThresholds = {
        r5: "99%",
        r4: "100%",
        r3: "101%",
        r2: "102%",
        r1: "103%",
        r0: null,
      };
      const result = calculateRating(98, null, thresholdsWithPercent, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(5);
    });

    it("handles boundary values exactly (Lower is Better uses <=)", () => {
      // Exactly at boundary
      expect(calculateRating(99, null, thresholds, "Lower is Better", 10, "numeric", null, "%").rating).toBe(5);
      expect(calculateRating(100, null, thresholds, "Lower is Better", 10, "numeric", null, "%").rating).toBe(4);
      expect(calculateRating(101, null, thresholds, "Lower is Better", 10, "numeric", null, "%").rating).toBe(3);
    });

    it("handles boundary values exactly (Higher is Better uses >=)", () => {
      const higherThresholds: RatingThresholds = {
        r5: "103",
        r4: "102",
        r3: "101",
        r2: "100",
        r1: "99",
        r0: null,
      };
      expect(calculateRating(103, null, higherThresholds, "Higher is Better", 10, "numeric", null, "%").rating).toBe(5);
      expect(calculateRating(102, null, higherThresholds, "Higher is Better", 10, "numeric", null, "%").rating).toBe(4);
      expect(calculateRating(101, null, higherThresholds, "Higher is Better", 10, "numeric", null, "%").rating).toBe(3);
    });

    it("returns zero for null achieved value", () => {
      const result = calculateRating(null, null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(0);
      expect(result.ratingLevel).toBe("red");
    });

    it("returns zero for empty string achieved value", () => {
      const result = calculateRating("", null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(0);
    });

    it("returns zero for invalid string achieved value", () => {
      const result = calculateRating("invalid", null, thresholds, "Lower is Better", 10, "numeric", null, "%");
      expect(result.rating).toBe(0);
    });

    it("recognizes 'percentage' as alias for %", () => {
      const result = calculateRating(98, null, thresholds, "Lower is Better", 10, "numeric", null, "percentage");
      expect(result.rating).toBe(5);
    });

    it("recognizes 'Percentage' (case-insensitive) as alias for %", () => {
      const result = calculateRating(98, null, thresholds, "Lower is Better", 10, "numeric", null, "Percentage");
      expect(result.rating).toBe(5);
    });

    it("handles fractional values correctly", () => {
      const preciseThresholds: RatingThresholds = {
        r5: "99.05",
        r4: "99.5",
        r3: "100",
        r2: "100.5",
        r1: "101",
        r0: null,
      };
      expect(calculateRating(99.05, null, preciseThresholds, "Lower is Better", 10, "numeric", null, "%").rating).toBe(5);
      expect(calculateRating(99.06, null, preciseThresholds, "Lower is Better", 10, "numeric", null, "%").rating).toBe(4);
    });
  });
});
