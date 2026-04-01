

## The Step-Back Dialog UI is Already Built

The `AdminStatusStepBackDialog` component is fully implemented and deployed. Here is what the dialog looks like:

```text
┌──────────────────────────────────────────┐
│  ↩ Step Back KPI Status                  │
│  Move this KPI backward in the workflow. │
│  Select a target stage and provide a     │
│  mandatory reason for the audit trail.   │
├──────────────────────────────────────────┤
│  ┌────────────────────────────────────┐  │
│  │ KRA: [KRA Name]                    │  │
│  │ KPI: [KPI Name]                    │  │
│  │ Employee: [Employee Name]          │  │
│  └────────────────────────────────────┘  │
│                                          │
│  Target Stage                            │
│  ┌──────────┐     ┌──────────────────┐  │
│  │ Approved  │ ← ← │ ▼ KRA Set      ▼│  │
│  └──────────┘     │   Manager Check  │  │
│   (current)       │   Skip Level     │  │
│                   │   Auditor Check   │  │
│                   └──────────────────┘  │
│                    (dropdown selector)   │
│                                          │
│  ┌─ ⚠ RED BORDER ─────────────────────┐ │
│  │ ☐ Clear all review data (full reset)│ │
│  │   Deletes all scores, remarks,      │ │
│  │   evidence, achieved values. Resets  │ │
│  │   KPI to KRA Set with clean slate.  │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  ℹ If this is a multi-month KPI,        │
│    all sibling months will be reverted.  │
│                                          │
│  Reason for Step Back *                  │
│  ┌─────────────────────────────────────┐ │
│  │ Explain why this KPI needs to be    │ │
│  │ moved back...                       │ │
│  └─────────────────────────────────────┘ │
│                                          │
│         [Cancel]  [Confirm Step Back]    │
│                                          │
│  (Button turns red "Confirm Full Reset"  │
│   when checkbox is ticked)               │
└──────────────────────────────────────────┘
```

### How to Access

1. Go to **Admin KPI Dashboard**
2. Find any KPI row (including approved ones)
3. Click the **Step Back** button (↩ icon) in the actions column
4. The dialog opens with the above layout

### No Implementation Needed

All three features from the plan are already coded and deployed:
- Target stage dropdown selector
- Full reset checkbox with data wipe
- Multi-month sibling auto-reversion

