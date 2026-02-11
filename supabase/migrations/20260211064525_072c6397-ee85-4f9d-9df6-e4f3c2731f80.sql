
-- Fix target_value: Excel decimals like 1.02 should be 102 for percentage KPIs
UPDATE kpis SET target_value = target_value * 100 
WHERE uom = '%' AND target_value > 1 AND target_value <= 2;

-- Fix r0 thresholds with decimal percentage strings like "1.02%"
UPDATE kpis SET r0 = CONCAT(ROUND(CAST(REPLACE(r0, '%', '') AS NUMERIC) * 100, 2), '%')
WHERE uom = '%' AND r0 LIKE '%.%' AND r0 LIKE '%!%%' ESCAPE '!'
  AND CAST(REPLACE(r0, '%', '') AS NUMERIC) > 0 
  AND CAST(REPLACE(r0, '%', '') AS NUMERIC) <= 2;

-- Fix r1 thresholds
UPDATE kpis SET r1 = CONCAT(ROUND(CAST(REPLACE(r1, '%', '') AS NUMERIC) * 100, 2), '%')
WHERE uom = '%' AND r1 LIKE '%.%' AND r1 LIKE '%!%%' ESCAPE '!'
  AND CAST(REPLACE(r1, '%', '') AS NUMERIC) > 0 
  AND CAST(REPLACE(r1, '%', '') AS NUMERIC) <= 2;

-- Fix r2 thresholds
UPDATE kpis SET r2 = CONCAT(ROUND(CAST(REPLACE(r2, '%', '') AS NUMERIC) * 100, 2), '%')
WHERE uom = '%' AND r2 LIKE '%.%' AND r2 LIKE '%!%%' ESCAPE '!'
  AND CAST(REPLACE(r2, '%', '') AS NUMERIC) > 0 
  AND CAST(REPLACE(r2, '%', '') AS NUMERIC) <= 2;

-- Fix r3 thresholds
UPDATE kpis SET r3 = CONCAT(ROUND(CAST(REPLACE(r3, '%', '') AS NUMERIC) * 100, 2), '%')
WHERE uom = '%' AND r3 LIKE '%.%' AND r3 LIKE '%!%%' ESCAPE '!'
  AND CAST(REPLACE(r3, '%', '') AS NUMERIC) > 0 
  AND CAST(REPLACE(r3, '%', '') AS NUMERIC) <= 2;

-- Fix r4 thresholds
UPDATE kpis SET r4 = CONCAT(ROUND(CAST(REPLACE(r4, '%', '') AS NUMERIC) * 100, 2), '%')
WHERE uom = '%' AND r4 LIKE '%.%' AND r4 LIKE '%!%%' ESCAPE '!'
  AND CAST(REPLACE(r4, '%', '') AS NUMERIC) > 0 
  AND CAST(REPLACE(r4, '%', '') AS NUMERIC) <= 2;

-- Fix r5 thresholds
UPDATE kpis SET r5 = CONCAT(ROUND(CAST(REPLACE(r5, '%', '') AS NUMERIC) * 100, 2), '%')
WHERE uom = '%' AND r5 LIKE '%.%' AND r5 LIKE '%!%%' ESCAPE '!'
  AND CAST(REPLACE(r5, '%', '') AS NUMERIC) > 0 
  AND CAST(REPLACE(r5, '%', '') AS NUMERIC) <= 2;
