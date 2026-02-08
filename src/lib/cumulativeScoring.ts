/**
 * Cumulative Scoring Utilities
 * 
 * Functions for calculating aggregated scores, trends, and performance metrics
 * across multiple review periods.
 */

export type TrendDirection = 'improving' | 'declining' | 'stable';

export interface PeriodScore {
  period: string;
  year: number;
  score: number | null;
  weightage?: number;
}

export interface AggregatedKpi {
  kpi_name: string;
  kra_name: string;
  category_id: string;
  employee_id: string;
  avgScore: number | null;
  totalSubmissions: number;
  periodScores: PeriodScore[];
  trend: TrendDirection;
  weightage: number;
}

export interface CategoryCumulative {
  categoryId: string;
  categoryName: string;
  avgScore: number;
  trend: TrendDirection;
  kpiCount: number;
  totalWeightage: number;
}

/**
 * Calculate weighted average score across periods
 * @param periodScores Array of period scores with optional weightage
 * @returns Weighted average score or null if no valid scores
 */
export function calculateCumulativeScore(
  periodScores: Array<{ score: number | null; weightage?: number }>
): number | null {
  const validScores = periodScores.filter(ps => ps.score !== null && ps.score !== undefined);
  
  if (validScores.length === 0) return null;
  
  // Check if all scores have weightage
  const hasWeightage = validScores.every(ps => ps.weightage !== undefined && ps.weightage > 0);
  
  if (hasWeightage) {
    const totalWeight = validScores.reduce((sum, ps) => sum + (ps.weightage || 0), 0);
    if (totalWeight === 0) return null;
    
    const weightedSum = validScores.reduce(
      (sum, ps) => sum + (ps.score! * (ps.weightage || 0)), 
      0
    );
    return Math.round((weightedSum / totalWeight) * 100) / 100;
  }
  
  // Simple average if no weightage
  const sum = validScores.reduce((acc, ps) => acc + ps.score!, 0);
  return Math.round((sum / validScores.length) * 100) / 100;
}

/**
 * Determine performance trend based on recent scores
 * Uses linear regression slope to determine direction
 * @param periodScores Array of scores in chronological order
 * @returns Trend direction: 'improving', 'declining', or 'stable'
 */
export function calculateTrend(periodScores: (number | null)[]): TrendDirection {
  // Filter out null values and get at least 2 data points
  const validScores = periodScores.filter((s): s is number => s !== null);
  
  if (validScores.length < 2) return 'stable';
  
  // Use last 3 periods for trend calculation (or all if less than 3)
  const recentScores = validScores.slice(-3);
  
  if (recentScores.length < 2) return 'stable';
  
  // Calculate simple linear regression slope
  const n = recentScores.length;
  const xSum = (n * (n - 1)) / 2; // Sum of 0, 1, 2, ...
  const xSquaredSum = (n * (n - 1) * (2 * n - 1)) / 6;
  const ySum = recentScores.reduce((a, b) => a + b, 0);
  const xySum = recentScores.reduce((sum, score, i) => sum + (i * score), 0);
  
  const slope = (n * xySum - xSum * ySum) / (n * xSquaredSum - xSum * xSum);
  
  // Determine threshold for "stable" (within 10% variance)
  const avgScore = ySum / n;
  const threshold = avgScore * 0.1; // 10% of average
  
  if (Math.abs(slope) < threshold / n) return 'stable';
  return slope > 0 ? 'improving' : 'declining';
}

/**
 * Calculate trend from PeriodScore array (with proper chronological ordering)
 */
export function calculateTrendFromPeriodScores(periodScores: PeriodScore[]): TrendDirection {
  // Sort by year and month chronologically
  const MONTH_ORDER = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  
  const sorted = [...periodScores].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_ORDER.indexOf(a.period) - MONTH_ORDER.indexOf(b.period);
  });
  
  return calculateTrend(sorted.map(ps => ps.score));
}

/**
 * Calculate cumulative performance for a specific category
 */
export function calculateCategoryCumulative(
  aggregatedKpis: AggregatedKpi[],
  categoryId: string,
  categoryName: string = ''
): CategoryCumulative {
  const categoryKpis = aggregatedKpis.filter(kpi => kpi.category_id === categoryId);
  
  if (categoryKpis.length === 0) {
    return {
      categoryId,
      categoryName,
      avgScore: 0,
      trend: 'stable',
      kpiCount: 0,
      totalWeightage: 0,
    };
  }
  
  const totalWeightage = categoryKpis.reduce((sum, kpi) => sum + kpi.weightage, 0);
  
  // Calculate weighted average of KPI scores
  const validKpis = categoryKpis.filter(kpi => kpi.avgScore !== null);
  let avgScore = 0;
  
  if (validKpis.length > 0 && totalWeightage > 0) {
    const weightedSum = validKpis.reduce(
      (sum, kpi) => sum + (kpi.avgScore! * kpi.weightage), 
      0
    );
    avgScore = Math.round((weightedSum / totalWeightage) * 100) / 100;
  }
  
  // Calculate overall trend from all period scores
  const allPeriodScores = categoryKpis.flatMap(kpi => kpi.periodScores);
  const trend = calculateTrendFromPeriodScores(allPeriodScores);
  
  return {
    categoryId,
    categoryName,
    avgScore,
    trend,
    kpiCount: categoryKpis.length,
    totalWeightage,
  };
}

/**
 * Calculate overall cumulative score across all categories
 */
export function calculateOverallCumulativeScore(
  aggregatedKpis: AggregatedKpi[]
): { score: number | null; trend: TrendDirection; kpiCount: number } {
  const validKpis = aggregatedKpis.filter(kpi => kpi.avgScore !== null);
  
  if (validKpis.length === 0) {
    return { score: null, trend: 'stable', kpiCount: 0 };
  }
  
  const totalWeightage = validKpis.reduce((sum, kpi) => sum + kpi.weightage, 0);
  
  let score: number | null = null;
  if (totalWeightage > 0) {
    const weightedSum = validKpis.reduce(
      (sum, kpi) => sum + (kpi.avgScore! * kpi.weightage), 
      0
    );
    score = Math.round((weightedSum / totalWeightage) * 100) / 100;
  }
  
  // Overall trend from all KPIs
  const allPeriodScores = aggregatedKpis.flatMap(kpi => kpi.periodScores);
  const trend = calculateTrendFromPeriodScores(allPeriodScores);
  
  return {
    score,
    trend,
    kpiCount: aggregatedKpis.length,
  };
}

/**
 * Get score for a specific period from aggregated KPI
 */
export function getScoreForPeriod(
  periodScores: PeriodScore[],
  month: string,
  year: number
): number | null {
  const match = periodScores.find(ps => ps.period === month && ps.year === year);
  return match?.score ?? null;
}

/**
 * Format trend for display
 */
export function formatTrendLabel(trend: TrendDirection): string {
  switch (trend) {
    case 'improving': return 'Improving';
    case 'declining': return 'Declining';
    case 'stable': return 'Stable';
  }
}
