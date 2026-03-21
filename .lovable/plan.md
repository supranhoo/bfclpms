

## Implementing: Pending Self-Reviews Admin Page with Manager/Skip-Level KRA Penalty

### Summary
Build a new admin page at `/admin/pending-reviews` with two tabs:
- **Tab 1**: Employee KPIs stuck at `kra_set` past the configurable deadline (default 10th of following month)
- **Tab 2**: Employee KPIs stuck at `team_review` — triggers penalty on manager/skip-level manager's KRA "Implementation of common - policies / systems / processes"

Configurable settings for deadline day and auto-remark texts.

### Implementation Steps

#### 1. Insert System Settings (data-only, via insert tool)
Insert 3 rows into `system_settings`:
- `pending_review_deadline_day` → `10`
- `pending_review_auto_remark` → `"KPI not self reviewed by due date, score given by system"`
- `manager_penalty_auto_remark` → `"KRA of team not reviewed by due date"`

#### 2. New Hook: `src/hooks/usePendingSelfReviews.ts`
- Fetches KPIs where `status = 'kra_set'`, `is_org_level = false`, frequency is Monthly/Daily/Weekly, past deadline
- Fetches KPIs where `status = 'team_review'` (same exclusions) for manager penalty tab
- Joins `profiles` for employee name, code, department; joins `departments` for department name
- For Tab 2: resolves `reporting_manager_id` and skip-level manager via `get_skip_level_manager`
- Mutation: bulk auto-score (update `kpis` status to `approved`, `final_score = 0`, `final_rating = 'red'`; upsert `review_submissions`; insert audit logs)
- Mutation: manager penalty (find manager's KPI by `kra_name`, zero-score it similarly)
- Reads configurable deadline/remark settings from `system_settings`

#### 3. New Page: `src/pages/admin/PendingSelfReviews.tsx`
- Settings panel at top: editable deadline day, employee remark, manager remark (with Save button using `useUpdateSystemSetting`)
- Two tabs with tables showing overdue KPIs
- Checkbox selection + "Auto-Score Selected" / "Auto-Score All" / "Penalize Managers" bulk buttons
- Columns: Employee Name, Code, Department, KPI Name, KRA, Review Period, Days Overdue

#### 4. Route & Sidebar
- `src/App.tsx`: Add lazy import and route `/admin/pending-reviews` inside admin ProtectedRoute
- `src/components/layout/AppSidebar.tsx`: Add `{ title: 'Pending Reviews', icon: ClipboardCheck, path: '/admin/pending-reviews', roles: ['admin'] }` to admin section

### No database schema changes needed
All tables and columns already exist. Only data inserts to `system_settings`.

