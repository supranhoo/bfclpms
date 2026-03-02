
-- Fix 3 binary org KPIs with incorrect HR PMS ratings
-- Root cause: numeric threshold logic was applied to binary KPIs at HR PMS level

-- 1. Badal Kumar Ravi: LTI KPI - hr_pms and final score should be 5
UPDATE review_submissions 
SET hr_pms_score = 5, hr_pms_rating = 'blue', final_score = 5, final_rating = 'blue'
WHERE kpi_id = 'adc3b9b9-fcc7-4ca9-aa83-436946eec6c7';

-- 2. Monu Kumar Soni: Safety Observations KPI - hr_pms and final score should be 5
UPDATE review_submissions 
SET hr_pms_score = 5, hr_pms_rating = 'blue', final_score = 5, final_rating = 'blue'
WHERE kpi_id = '279e55e8-1197-41fa-b3b7-7ce97be173b0';

-- 3. Bhoopendra Kumar Sinha: LTI KPI - manager and hr_pms score should be 5
UPDATE review_submissions 
SET hr_pms_score = 5, hr_pms_rating = 'blue', manager_score = 5, manager_rating = 'blue'
WHERE kpi_id = '005e6990-e6a7-44cb-a65a-e4f0ccf60791';
