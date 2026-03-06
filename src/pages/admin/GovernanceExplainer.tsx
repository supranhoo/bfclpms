import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Calendar, Lock, Users, Zap, ScrollText, HelpCircle, ChevronRight, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { GOVERNANCE_STAGES, STAGE_LABELS, PERMISSION_KEYS, PERMISSION_LABELS } from '@/hooks/useReviewPeriodGovernance';

const STAGE_DESCRIPTIONS: Record<string, { summary: string; details: string }> = {
  planning: {
    summary: 'KRAs are created, assigned, and weighted.',
    details: 'During Planning, administrators assign KRAs/KPIs to employees, set targets, define rating scales, and configure weightages. Employees can view but not act on their scorecards.',
  },
  self_review: {
    summary: 'Employees submit self-assessments.',
    details: 'Employees log achieved values, upload evidence, and submit self-review scores. Once submitted, they cannot modify their entries unless explicitly sent back by a reviewer.',
  },
  manager_review: {
    summary: 'Managers evaluate and score their direct reports.',
    details: 'Managers review employee submissions, adjust scores with justification, add observations, and forward scorecards. Multi-level review chains are supported.',
  },
  calibration: {
    summary: 'Leadership aligns ratings across teams.',
    details: 'Senior management and HR review aggregated scores to ensure fairness and consistency across departments. Bell-curve analysis and cross-team comparisons happen here.',
  },
  approval: {
    summary: 'Final sign-off on all ratings.',
    details: 'Authorized approvers give final approval to calibrated ratings. Once approved, ratings become the official record for the period.',
  },
  closed: {
    summary: 'Period is archived — all actions are frozen.',
    details: 'No further edits, submissions, or approvals are possible. The period becomes a historical record. Only administrators can revert to a previous stage if corrections are needed.',
  },
};

const PERMISSION_DETAILS: Record<string, string> = {
  edit_kpi: 'Create, modify, or delete KRA/KPI definitions, targets, and weightages.',
  submit_self_review: 'Allow employees to enter achieved values and submit their self-review.',
  submit_manager_review: 'Allow managers to score, comment on, and forward employee reviews.',
  approve: 'Allow authorized users to give final approval to reviewed scorecards.',
  edit_scores: 'Allow post-submission score adjustments (e.g., during calibration).',
  add_comments: 'Allow adding observations, remarks, or evidence to KPIs.',
  view_only: 'When enabled, the user can only view data — all other actions are blocked.',
};

const LOCK_HIERARCHY = [
  { level: 'Employee', icon: Users, description: 'Locks a specific employee\'s scorecard. Highest priority — overrides all other locks.' },
  { level: 'Department', icon: Users, description: 'Locks all employees within a department. Overridden by employee-level locks.' },
  { level: 'Role', icon: Shield, description: 'Locks actions for a specific role (e.g., "manager" can\'t submit reviews). Overridden by department and employee locks.' },
  { level: 'Global', icon: Lock, description: 'Locks the entire review period for everyone. Lowest priority — overridden by all specific locks.' },
];

const FAQ_ITEMS = [
  {
    q: 'What happens when a period is moved to "Closed"?',
    a: 'All permissions are revoked system-wide. No user — including admins — can edit scores, submit reviews, or add comments through the normal UI. The period becomes a read-only archive. An admin can revert to a previous stage if corrections are needed.',
  },
  {
    q: 'Can I unlock a single employee while the period is globally locked?',
    a: 'Yes. Employee-level locks have the highest priority. You can create an employee-specific unlock that grants them specific permissions even while the global lock is active.',
  },
  {
    q: 'How do auto-lock rules work?',
    a: 'Auto-lock rules trigger automatically based on conditions you define — for example, "Lock self-review submissions 3 days after the deadline" or "Lock manager review when the stage advances to Calibration." Rules are evaluated continuously and create locks in the audit log when triggered.',
  },
  {
    q: 'What gets recorded in the audit log?',
    a: 'Every governance action is logged: stage transitions, lock/unlock operations, permission changes, auto-rule triggers, and manual overrides. Each entry records who performed the action, when, and what changed.',
  },
  {
    q: 'Can I revert a stage after advancing?',
    a: 'Yes, administrators can revert to any previous stage using the Stage Controller. This is an audited action and will be recorded in the governance audit log. Reverting does not undo data — it simply reopens the permissions associated with that stage.',
  },
  {
    q: 'Do locks affect admin users?',
    a: 'Admin users always retain full access in the governance admin panel. However, role-based locks can restrict admin actions on the review UI if explicitly configured. The recommended approach is to use the "Global Lock" for period-wide freezes and employee locks for exceptions.',
  },
];

export default function GovernanceExplainer() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/review-periods">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Period Governance — Explainer</h1>
          <p className="text-muted-foreground">A complete guide to lifecycle stages, locks, permissions, and automation.</p>
        </div>
      </div>

      {/* 1. Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> What is Governance?
          </CardTitle>
          <CardDescription>
            Why review period governance exists and what it controls.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Review Period Governance is the <strong className="text-foreground">central control system</strong> that manages who can do what, and when, during a performance review cycle. It ensures that:
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Reviews follow a structured lifecycle from planning to closure.</li>
            <li>Permissions are enforced at every level — globally, by role, department, or individual employee.</li>
            <li>Deadlines and stage transitions are automated where possible.</li>
            <li>Every change is audited for compliance and transparency.</li>
          </ul>
        </CardContent>
      </Card>

      {/* 2. Lifecycle Stages */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" /> Lifecycle Stages
          </CardTitle>
          <CardDescription>
            Every review period moves through 6 sequential stages.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Visual pipeline */}
          <div className="flex flex-wrap items-center gap-1">
            {GOVERNANCE_STAGES.map((stage, i) => (
              <div key={stage} className="flex items-center gap-1">
                <Badge variant="outline" className="whitespace-nowrap">
                  {STAGE_LABELS[stage]}
                </Badge>
                {i < GOVERNANCE_STAGES.length - 1 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </div>
            ))}
          </div>

          <Separator />

          {/* Stage details */}
          <Accordion type="multiple" className="w-full">
            {GOVERNANCE_STAGES.map((stage) => (
              <AccordionItem key={stage} value={stage}>
                <AccordionTrigger className="text-sm">
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">{STAGE_LABELS[stage]}</Badge>
                    <span className="text-muted-foreground">{STAGE_DESCRIPTIONS[stage].summary}</span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {STAGE_DESCRIPTIONS[stage].details}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* 3. Lock Hierarchy */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" /> Lock Hierarchy
          </CardTitle>
          <CardDescription>
            Specific locks always override broader locks. The most specific lock wins.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <strong>Key rule:</strong> Employee &gt; Department &gt; Role &gt; Global. A lock at a more specific level always takes precedence over a broader one.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            {LOCK_HIERARCHY.map((item, i) => (
              <div key={item.level} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {i + 1}
                </div>
                <div>
                  <p className="font-medium text-sm text-foreground">{item.level} Lock</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground italic">
            Example: If the global lock freezes everything, but an employee-level lock explicitly allows "Self Review," that employee can still submit their self-review.
          </p>
        </CardContent>
      </Card>

      {/* 4. Permission Types */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Permission Types
          </CardTitle>
          <CardDescription>
            7 granular permissions control every action in the review process.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Permission</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {PERMISSION_KEYS.map((key) => (
                <TableRow key={key}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{PERMISSION_LABELS[key]}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {PERMISSION_DETAILS[key]}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 4b. Role Permission Matrix — How It Works */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" /> Role Permission Matrix — How It Works
          </CardTitle>
          <CardDescription>
            A detailed guide to the role × permission grid and how status is determined.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* What it is */}
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              The <strong className="text-foreground">Role Permission Matrix</strong> is a grid where each row represents a system role and each column represents a permission.
              Toggle switches allow administrators to enable or disable individual permissions per role for the active review period.
            </p>
          </div>

          {/* Role reference */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">The 7 System Roles</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[130px]">Role</TableHead>
                  <TableHead>Typical Responsibility</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { role: 'Admin', desc: 'Full system control. Manages settings, users, governance, and all review operations.' },
                  { role: 'Manager', desc: 'Reviews and scores direct reports. Forwards scorecards through the workflow.' },
                  { role: 'Employee', desc: 'Submits self-review data — achieved values, evidence, and self-scores.' },
                  { role: 'Auditor', desc: 'Independently verifies scores and evidence for assigned employees or KPIs.' },
                  { role: 'Management', desc: 'Senior leadership. Participates in calibration and final approvals.' },
                  { role: 'HR PMS', desc: 'HR team member responsible for PMS administration and compliance.' },
                  { role: 'Skip Level', desc: 'Reviews employees one level below their direct reports for additional oversight.' },
                ].map(item => (
                  <TableRow key={item.role}>
                    <TableCell><Badge variant="outline" className="text-xs">{item.role}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.desc}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Separator />

          {/* Status calculation */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">How "Full Access" vs "Restricted" Is Calculated</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>The status badge next to each role is determined by this logic:</p>
              <ul className="list-disc pl-6 space-y-1 text-xs">
                <li>A role shows <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs mx-1">Full Access</Badge> when <strong className="text-foreground">all 6 operational permissions</strong> are ON and <strong className="text-foreground">View Only is OFF</strong>.</li>
                <li>A role shows <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs mx-1">Restricted</Badge> when <strong className="text-foreground">any operational permission is OFF</strong>, <em>or</em> <strong className="text-foreground">View Only is ON</strong>.</li>
              </ul>
              <p className="text-xs italic mt-2">
                The 6 operational permissions are: Edit KPI, Self Review, Manager Review, Approve, Edit Scores, and Add Comments. "View Only" is a special override — it is not counted as a missing permission when it is OFF.
              </p>
            </div>
          </div>

          <Separator />

          {/* Admin exception */}
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertDescription>
              <strong>Admin Exception:</strong> The Admin row's toggles are always disabled. Admins retain full access regardless of the matrix configuration. This prevents accidental lockout of the system administrator.
            </AlertDescription>
          </Alert>

          {/* View Only */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">View Only — Special Behavior</p>
            <div className="p-3 rounded-lg border bg-muted/30 text-sm text-muted-foreground space-y-1">
              <p>When <strong className="text-foreground">View Only</strong> is toggled ON for a role:</p>
              <ul className="list-disc pl-6 text-xs space-y-1">
                <li>All other permissions are effectively overridden — the role can only <em>view</em> data, not act on it.</li>
                <li>The status immediately changes to "Restricted" regardless of other toggles.</li>
                <li>This is useful for roles that should monitor the process without participating (e.g., Auditor during Self Review).</li>
              </ul>
            </div>
          </div>

          <Separator />

          {/* Saving & enforcement */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Saving &amp; Enforcement</p>
            <ul className="list-disc pl-6 text-xs text-muted-foreground space-y-1">
              <li>Clicking <strong className="text-foreground">Save Permissions</strong> creates or updates <em>role-level locks</em> in the lock hierarchy (priority level 3 — above Global, below Department and Employee).</li>
              <li>Saved permissions are enforced server-side via the <code className="text-foreground bg-muted px-1 rounded">check_review_period_permission</code> function, which evaluates the lock hierarchy before allowing any action.</li>
              <li>Every save is recorded in the governance audit log with the changed permissions and the administrator who made the change.</li>
            </ul>
          </div>

          <Separator />

          {/* Example scenarios */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Example Scenarios</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="font-medium text-foreground text-xs mb-1">Restrict Employees During Manager Review</p>
                <p className="text-xs text-muted-foreground">
                  Turn OFF "Self Review" and "Edit KPI" for the Employee role. Employees can still view their scorecards but cannot modify submissions while managers are reviewing.
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="font-medium text-foreground text-xs mb-1">Set Auditors to View Only</p>
                <p className="text-xs text-muted-foreground">
                  Toggle "View Only" ON for the Auditor role. Auditors can inspect all data but cannot add comments or modify scores — ideal during the Calibration stage.
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="font-medium text-foreground text-xs mb-1">Lock Down Approvals</p>
                <p className="text-xs text-muted-foreground">
                  Turn OFF "Approve" for all roles except Management. Only senior leadership can give final sign-off on calibrated ratings.
                </p>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <p className="font-medium text-foreground text-xs mb-1">Open All Permissions for Planning</p>
                <p className="text-xs text-muted-foreground">
                  During the Planning stage, ensure all operational permissions are ON for Manager and HR PMS so they can collaboratively build scorecards.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 5. Auto-Lock Rules */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" /> Auto-Lock Rules
          </CardTitle>
          <CardDescription>
            Automate lock enforcement based on deadlines or events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Auto-lock rules allow you to define conditions that automatically trigger lock operations:</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="p-3 rounded-lg border bg-muted/30">
              <p className="font-medium text-foreground text-xs mb-1">Deadline-Based</p>
              <p className="text-xs">e.g., "Lock self-review 3 days after deadline." Evaluated continuously against the current date.</p>
            </div>
            <div className="p-3 rounded-lg border bg-muted/30">
              <p className="font-medium text-foreground text-xs mb-1">Event-Based</p>
              <p className="text-xs">e.g., "Lock manager review when stage advances to Calibration." Triggered by stage transitions.</p>
            </div>
          </div>
          <p className="text-xs italic">
            All auto-lock actions are recorded in the audit log with the trigger reason.
          </p>
        </CardContent>
      </Card>

      {/* 6. Audit Trail */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5 text-primary" /> Audit Trail
          </CardTitle>
          <CardDescription>
            Every governance action is permanently recorded.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>The governance audit log captures:</p>
          <ul className="list-disc pl-6 space-y-1 text-xs">
            <li><strong className="text-foreground">Stage transitions</strong> — who advanced/reverted and when</li>
            <li><strong className="text-foreground">Lock operations</strong> — creation, modification, and removal of locks at any level</li>
            <li><strong className="text-foreground">Permission changes</strong> — which permissions were toggled and by whom</li>
            <li><strong className="text-foreground">Auto-rule triggers</strong> — which rule fired and what lock it created</li>
            <li><strong className="text-foreground">Manual overrides</strong> — any exceptional actions taken by administrators</li>
          </ul>
        </CardContent>
      </Card>

      {/* 7. FAQ */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" /> Frequently Asked Questions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            {FAQ_ITEMS.map((item, i) => (
              <AccordionItem key={i} value={`faq-${i}`}>
                <AccordionTrigger className="text-sm text-left">{item.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground">
                  {item.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
}
