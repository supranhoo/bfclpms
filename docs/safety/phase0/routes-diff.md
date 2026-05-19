# Routes Diff — Production vs Prototype

## Production `/safety/*` tree (frozen)

Source: `src/App.tsx` (lazy-loaded under `SafetyLayout` + `SafetyModuleRoute`).

```
/safety
  /                              SafetyHome
  /incidents                     SafetyIncidents
  /incidents/new                 SafetyIncidentNew
  /incidents/:id                 SafetyIncidentDetail
  /permits                       SafetyPermits
  /permits/new                   SafetyPermitNew
  /permits/:id                   SafetyPermitDetail
  /training                      SafetyTraining
  /training/admin                SafetyTrainingAdmin
  /assets                        SafetyAssets
  /assets/new                    SafetyAssetNew
  /assets/:id                    SafetyAssetDetail
  /audits                        SafetyAudits
  /audits/templates              SafetyAuditTemplates
  /audits/runs/new               SafetyAuditRunNew
  /audits/runs/:id               SafetyAuditRunDetail
  /audits/scoreboard             SafetyAuditScoreboard
  /emergency                     SafetyEmergency
  /emergency/drills/new          SafetyDrillNew
  /emergency/drills/:id          SafetyDrillDetail
  /emergency/contacts            SafetyEmergencyContacts
  /analytics                     SafetyAnalytics
  /settings                      SafetySettings
  /settings/hours-worked         SafetyHoursWorked
  /settings/permit-types         SafetyPermitTypeConfig
  /settings/sla                  SafetySlaMonitor
  /settings/users                SafetyUsers
  /settings/audit                SafetyAuditLog
```

## Prototype-derived candidates (additive only)

| Path | Source | Disposition |
|---|---|---|
| `/safety/settings/import` | prototype admin import | **Candidate** (Phase 6, additive child) |
| `/safety/settings/flags` | prototype | **Rejected** — flags admin lives inside existing Settings page (Phase 5) |
| `/safety/incidents/:id/rca` | prototype RCA standalone | **Rejected** — RCA stays a panel inside `SafetyIncidentDetail` |
| `/safety/dashboard` | prototype | **Rejected** — `SafetyHome` is the canonical dashboard |

## Stop conditions

- Any rename of the paths above is a route-rewrite and triggers an immediate halt.
- No prototype shallow-tree (`/safety/<page>` collapsing nested settings) may be merged.