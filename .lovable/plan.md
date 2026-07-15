# Reporting Manager Remap — Facility Management

## Scope (per your answers)
- Update **only** `profiles.reporting_manager_id`.
- Do **not** change department, functional manager, or any other field.
- Skip the three ambiguous names (Kameshwar Rao, Brij Bhishan Mahato, Manabendra Jena).
- Skip the UUID `eefdb036…` (belongs to Love Sahrawat, not Kameshwar Rao).

## Employees to remap (10)
All are currently under Bijay Kumar Mandal (101906) → move to **Umesh Kumar Singh (100600)** `455f85a8-c345-4938-a77f-00598719e0ae`.

| Emp Code | Name |
|---|---|
| 101786 | Saroj Devi |
| 100823 | Dilip Mahli |
| 100602 | Pran Topno |
| 100668 | Rahul Kumar Prajapati |
| 100751 | Milon Das |
| 100819 | Usha Devi |
| 100797 | Jugal Lohra |
| 100816 | Dashrath Mahli |
| 100877 | Keshwa Kumari |
| 100822 | Vigan Devi |
| 100455 | Dhaneshwar Mahato |

## Rows explicitly NOT touched
- Kameshwar Rao / Kameshwar Rai — skipped
- Brij Bhishan Mahato / Brij Bhushan Mahto — skipped
- Manabendra Jena / Manabendra Jana — skipped
- Love Sahrawat (`eefdb036…`) — skipped

## Execution
Single data UPDATE via the insert tool (data change, not schema):

```sql
UPDATE public.profiles
SET reporting_manager_id = '455f85a8-c345-4938-a77f-00598719e0ae',
    updated_at = now()
WHERE employee_code IN (
  '101786','100823','100602','100668','100751',
  '100819','100797','100816','100877','100822','100455'
);
```

## Risk & Impact
- **Data:** 11 rows updated (one field). No schema change. Reversible by restoring prior `reporting_manager_id = a58ce3a2-…` (Bijay Kumar Mandal).
- **Workflow:** Future PMS reviews, notifications, and dashboards for these 11 employees will route through Umesh Kumar Singh. Existing in-flight review submissions are keyed to the reviewer at submission time and are not rewritten.
- **RLS / Security:** Manager-scoped visibility shifts from Bijay to Umesh accordingly.
- **UI:** No UI changes.

## Rollback
```sql
UPDATE public.profiles
SET reporting_manager_id = 'a58ce3a2-7520-40c9-99d8-7c4415ae31c8'
WHERE employee_code IN ('101786','100823','100602','100668','100751','100819','100797','100816','100877','100822','100455');
```
