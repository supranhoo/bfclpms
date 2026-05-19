# Cache & Query Keys — Safety Namespace

All Safety React Query keys begin with the literal `'safety'`. PMS keys
must never share that prefix. Invalidations must be scoped to the
sub-namespace; do **not** call `qc.invalidateQueries({ queryKey: ['safety'] })`.

## Observed namespaces

```
['safety', 'audit-log', filters]
['safety', 'user-roles', 'all' | 'me' | userId]
['safety', 'assets', { status, bucket, search, buId }]
['safety', 'asset', assetId]
['safety', 'asset-calibrations', assetId]
['safety', 'asset-evidence', assetId]
['safety', 'audits', 'templates', { activeOnly, search }]
['safety', 'audits', 'template', templateId]
['safety', 'audits', 'items', templateId]
['safety', 'audits', 'runs', { status, templateId }]
['safety', 'audits', 'run', runId]
['safety', 'audits', 'responses', runId]
['safety', 'permits', 'list', { status, type, search }]
['safety', 'permits', 'detail', permitId]
(+ incidents, drills, training, hours-worked, sla, settings, notifications)
```

## Cross-module bridge

`useSafetyRoles` invalidates `['modules']` after a role grant to refresh the
module-access cache. That is the only allowed Safety→non-Safety
invalidation and must stay scoped.

## Realtime

`useSafetyRealtimeSync` maps Postgres channels back to scoped query keys —
never to a global `['safety']` invalidation. Preserved as-is.

## Stop conditions

- Any `qc.invalidateQueries({ queryKey: ['safety'] })` (root-level blast).
- Any Safety key not prefixed with `'safety'`.
- Any PMS key prefixed with `'safety'`.