import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/safety/ConfirmDestructiveDialog';
import { Plus, Pencil, Trash2, ArrowLeft, GraduationCap, Users } from 'lucide-react';
import {
  useSafetySops,
  useSafetySop,
  useSafetyQuizForSop,
  useSafetyQuizQuestions,
  useSopAssignments,
  useUpsertSop,
  useDeleteSop,
  useUpsertQuiz,
  useUpsertQuestion,
  useDeleteQuestion,
  useAssignSopToRole,
  type SafetyQuizQuestionRow,
  type SafetyQuizRow,
} from '@/hooks/useSafetyTraining';
import { isValidMinReadSeconds, isValidPassThreshold } from '@/lib/safetyTraining';
import type { SafetyAppRole } from '@/lib/safetyRoles';

/** Admin view — switches between SOP list and SOP editor. */
export default function SafetyTrainingAdmin() {
  const [editingId, setEditingId] = useState<string | null>(null);
  if (editingId) return <SopEditor sopId={editingId} onBack={() => setEditingId(null)} />;
  return <SopList onEdit={setEditingId} />;
}

/* ─────────────────────────────────────────────────────────── List ─── */

function SopList({ onEdit }: { onEdit: (id: string) => void }) {
  const { data, isLoading } = useSafetySops({ activeOnly: false });
  const upsert = useUpsertSop();
  const remove = useDeleteSop();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  async function handleCreate() {
    if (!code.trim() || !title.trim()) {
      toast({ variant: 'destructive', title: 'Code and title are required.' });
      return;
    }
    try {
      const sop = await upsert.mutateAsync({
        code: code.trim(),
        title: title.trim(),
        body_md: '',
      });
      setOpen(false);
      setCode('');
      setTitle('');
      onEdit(sop.id);
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not create SOP',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <GraduationCap className="h-6 w-6 text-primary" />
            Training & SOPs (Admin)
          </h1>
          <p className="text-sm text-muted-foreground">
            Create SOPs, build quizzes, and assign training to roles.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-1" /> New SOP
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create new SOP</DialogTitle>
              <DialogDescription>
                You'll be able to edit content, add a quiz, and assign training afterwards.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Code</Label>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. SOP-HOTWORK-001" />
              </div>
              <div>
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hot Work Permit Procedure" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={upsert.isPending}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No SOPs yet. Create the first one to get started.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data!.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">{s.title}</span>
                    <Badge variant="outline">v{s.version}</Badge>
                    <span className="text-xs text-muted-foreground">{s.code}</span>
                    {!s.is_active && <Badge variant="secondary">Inactive</Badge>}
                  </div>
                  {s.category && (
                    <div className="text-xs text-muted-foreground mt-1">{s.category}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => onEdit(s.id)}>
                    <Pencil className="h-3 w-3 mr-1" /> Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmDelete(s.id)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDestructiveDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete SOP?"
        description="This will permanently delete the SOP, its quiz, and all assignments + attempts."
        confirmLabel="Delete SOP"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete);
            toast({ title: 'SOP deleted' });
          } catch (e: unknown) {
            toast({
              variant: 'destructive',
              title: 'Delete failed',
              description: e instanceof Error ? e.message : String(e),
            });
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}

/* ────────────────────────────────────────────────────────── Editor ─── */

function SopEditor({ sopId, onBack }: { sopId: string; onBack: () => void }) {
  const { data: sop } = useSafetySop(sopId);
  const { data: quiz } = useSafetyQuizForSop(sopId);
  const upsertSop = useUpsertSop();
  const upsertQuiz = useUpsertQuiz();
  const { toast } = useToast();

  if (!sop) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to SOP list
        </Button>
      </div>

      {/* SOP fields */}
      <Card>
        <CardHeader>
          <CardTitle>SOP details</CardTitle>
          <CardDescription>
            {sop.code} · v{sop.version}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SopFields
            sop={sop}
            onSave={async (patch) => {
              try {
                await upsertSop.mutateAsync({ id: sop.id, ...patch });
                toast({ title: 'SOP saved' });
              } catch (e: unknown) {
                toast({
                  variant: 'destructive',
                  title: 'Save failed',
                  description: e instanceof Error ? e.message : String(e),
                });
              }
            }}
            saving={upsertSop.isPending}
          />
        </CardContent>
      </Card>

      {/* Quiz */}
      <Card>
        <CardHeader>
          <CardTitle>Quiz</CardTitle>
          <CardDescription>
            One quiz per SOP. Workers must score at least the pass mark to complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuizFields
            sopId={sop.id}
            quiz={quiz ?? null}
            onSave={async (patch) => {
              try {
                await upsertQuiz.mutateAsync({
                  id: quiz?.id,
                  sop_id: sop.id,
                  ...patch,
                });
                toast({ title: 'Quiz saved' });
              } catch (e: unknown) {
                toast({
                  variant: 'destructive',
                  title: 'Save failed',
                  description: e instanceof Error ? e.message : String(e),
                });
              }
            }}
            saving={upsertQuiz.isPending}
          />
        </CardContent>
      </Card>

      {/* Questions */}
      {quiz && (
        <Card>
          <CardHeader>
            <CardTitle>Questions</CardTitle>
            <CardDescription>Workers see options without the correct answer.</CardDescription>
          </CardHeader>
          <CardContent>
            <QuestionEditor quizId={quiz.id} />
          </CardContent>
        </Card>
      )}

      {/* Assignment */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Assign to role
          </CardTitle>
          <CardDescription>
            Bulk-assign this SOP to every active user holding the chosen Safety role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AssignmentForm sopId={sop.id} hasQuiz={!!quiz} />
        </CardContent>
      </Card>

      <SopAssignmentsList sopId={sop.id} />
    </div>
  );
}

function SopFields({
  sop,
  onSave,
  saving,
}: {
  sop: { code: string; title: string; version: number; category: string | null; body_md: string; min_read_seconds: number; is_active: boolean };
  onSave: (patch: {
    code: string;
    title: string;
    version: number;
    category: string | null;
    body_md: string;
    min_read_seconds: number;
    is_active: boolean;
  }) => void;
  saving: boolean;
}) {
  const [code, setCode] = useState(sop.code);
  const [title, setTitle] = useState(sop.title);
  const [version, setVersion] = useState(sop.version);
  const [category, setCategory] = useState(sop.category ?? '');
  const [bodyMd, setBodyMd] = useState(sop.body_md);
  const [minRead, setMinRead] = useState(sop.min_read_seconds);
  const [isActive, setIsActive] = useState(sop.is_active);
  const { toast } = useToast();

  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label>Code</Label>
          <Input value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label>Version</Label>
          <Input
            type="number"
            min={1}
            value={version}
            onChange={(e) => setVersion(Math.max(1, parseInt(e.target.value || '1', 10)))}
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Category</Label>
          <Input
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. PPE, Hot Work, Confined Space"
          />
        </div>
      </div>
      <div>
        <Label>Body (Markdown / plain text)</Label>
        <Textarea
          rows={10}
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          className="font-mono text-sm"
        />
      </div>
      <div className="grid sm:grid-cols-2 gap-3 items-end">
        <div>
          <Label>Minimum reading time (seconds)</Label>
          <Input
            type="number"
            min={10}
            max={7200}
            value={minRead}
            onChange={(e) => setMinRead(parseInt(e.target.value || '0', 10))}
          />
        </div>
        <div className="flex items-center gap-3">
          <Switch checked={isActive} onCheckedChange={setIsActive} id="sop-active" />
          <Label htmlFor="sop-active">Active (visible to workers)</Label>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={saving}
          onClick={() => {
            if (!code.trim() || !title.trim()) {
              toast({ variant: 'destructive', title: 'Code and title are required.' });
              return;
            }
            if (!isValidMinReadSeconds(minRead)) {
              toast({
                variant: 'destructive',
                title: 'Reading time must be 10–7200 seconds.',
              });
              return;
            }
            onSave({
              code: code.trim(),
              title: title.trim(),
              version,
              category: category.trim() || null,
              body_md: bodyMd,
              min_read_seconds: minRead,
              is_active: isActive,
            });
          }}
        >
          Save SOP
        </Button>
      </div>
    </div>
  );
}

function QuizFields({
  sopId,
  quiz,
  onSave,
  saving,
}: {
  sopId: string;
  quiz: SafetyQuizRow | null;
  onSave: (patch: {
    pass_threshold: number;
    time_limit_seconds: number | null;
    max_attempts: number;
    randomize: boolean;
    is_active: boolean;
  }) => void;
  saving: boolean;
}) {
  const [pass, setPass] = useState(quiz?.pass_threshold ?? 80);
  const [timeLimit, setTimeLimit] = useState<number | ''>(quiz?.time_limit_seconds ?? '');
  const [maxAttempts, setMaxAttempts] = useState(quiz?.max_attempts ?? 3);
  const [randomize, setRandomize] = useState(quiz?.randomize ?? true);
  const [isActive, setIsActive] = useState(quiz?.is_active ?? true);
  const { toast } = useToast();
  void sopId; // sopId is used in parent's onSave wrapper

  return (
    <div className="grid gap-4">
      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <Label>Pass mark (%)</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={pass}
            onChange={(e) => setPass(parseInt(e.target.value || '0', 10))}
          />
        </div>
        <div>
          <Label>Max attempts</Label>
          <Input
            type="number"
            min={1}
            value={maxAttempts}
            onChange={(e) => setMaxAttempts(Math.max(1, parseInt(e.target.value || '1', 10)))}
          />
        </div>
        <div>
          <Label>Time limit (sec, optional)</Label>
          <Input
            type="number"
            min={0}
            value={timeLimit}
            onChange={(e) => {
              const v = e.target.value;
              setTimeLimit(v === '' ? '' : Math.max(0, parseInt(v, 10)));
            }}
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={randomize} onCheckedChange={setRandomize} id="quiz-rand" />
          <Label htmlFor="quiz-rand">Randomize question order per attempt</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={isActive} onCheckedChange={setIsActive} id="quiz-active" />
          <Label htmlFor="quiz-active">Active</Label>
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          disabled={saving}
          onClick={() => {
            if (!isValidPassThreshold(pass)) {
              toast({ variant: 'destructive', title: 'Pass mark must be 1–100.' });
              return;
            }
            onSave({
              pass_threshold: pass,
              time_limit_seconds: timeLimit === '' || timeLimit === 0 ? null : timeLimit,
              max_attempts: maxAttempts,
              randomize,
              is_active: isActive,
            });
          }}
        >
          {quiz ? 'Save quiz' : 'Create quiz'}
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────── Question editor ─── */

function QuestionEditor({ quizId }: { quizId: string }) {
  const { data, isLoading } = useSafetyQuizQuestions(quizId);
  const upsert = useUpsertQuestion();
  const remove = useDeleteQuestion();
  const { toast } = useToast();

  const [editing, setEditing] = useState<SafetyQuizQuestionRow | null>(null);
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function openNew() {
    setEditing(null);
    setOpen(true);
  }
  function openEdit(q: SafetyQuizQuestionRow) {
    setEditing(q);
    setOpen(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openNew}>
          <Plus className="h-4 w-4 mr-1" /> Add question
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-20" />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">No questions yet.</p>
      ) : (
        <div className="grid gap-2">
          {data!.map((q, i) => (
            <div key={q.id} className="border rounded-md p-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {i + 1}. {q.prompt}
                </div>
                <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                  {q.options.map((opt, idx) => (
                    <li key={idx} className={idx === q.correct_index ? 'text-primary font-medium' : ''}>
                      {String.fromCharCode(65 + idx)}. {opt}
                      {idx === q.correct_index ? '  ✓' : ''}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(q)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setConfirmDelete(q.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <QuestionDialog
        open={open}
        onOpenChange={setOpen}
        quizId={quizId}
        existing={editing}
        onSave={async (payload) => {
          try {
            await upsert.mutateAsync(payload);
            setOpen(false);
            toast({ title: editing ? 'Question updated' : 'Question added' });
          } catch (e: unknown) {
            toast({
              variant: 'destructive',
              title: 'Save failed',
              description: e instanceof Error ? e.message : String(e),
            });
          }
        }}
      />

      <ConfirmDestructiveDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Delete question?"
        description="This will permanently remove the question."
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!confirmDelete) return;
          try {
            await remove.mutateAsync(confirmDelete);
            toast({ title: 'Question deleted' });
          } catch (e: unknown) {
            toast({
              variant: 'destructive',
              title: 'Delete failed',
              description: e instanceof Error ? e.message : String(e),
            });
          } finally {
            setConfirmDelete(null);
          }
        }}
      />
    </div>
  );
}

function QuestionDialog({
  open,
  onOpenChange,
  quizId,
  existing,
  onSave,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  quizId: string;
  existing: SafetyQuizQuestionRow | null;
  onSave: (input: {
    id?: string;
    quiz_id: string;
    prompt: string;
    options: string[];
    correct_index: number;
    weight: number;
    sort_order: number;
  }) => void;
}) {
  const [prompt, setPrompt] = useState(existing?.prompt ?? '');
  const [options, setOptions] = useState<string[]>(existing?.options ?? ['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(existing?.correct_index ?? 0);
  const [weight, setWeight] = useState(existing?.weight ?? 1);
  const { toast } = useToast();

  // Reset when opened with a different question
  useState(() => undefined);
  // Use effect-like reset using key on parent (we instead reset on open transition):
  if (open && (existing?.id ?? '') && prompt === '' && options.every((o) => !o)) {
    setPrompt(existing!.prompt);
    setOptions(existing!.options);
    setCorrectIndex(existing!.correct_index);
    setWeight(existing!.weight);
  }

  return (
    <Dialog open={open} onOpenChange={(b) => {
      if (!b) {
        setPrompt('');
        setOptions(['', '', '', '']);
        setCorrectIndex(0);
        setWeight(1);
      }
      onOpenChange(b);
    }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? 'Edit question' : 'New question'}</DialogTitle>
          <DialogDescription>Mark which option is correct.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Prompt</Label>
            <Textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>
          {options.map((opt, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="radio"
                name="correct"
                checked={correctIndex === idx}
                onChange={() => setCorrectIndex(idx)}
                className="h-4 w-4"
              />
              <Input
                value={opt}
                onChange={(e) =>
                  setOptions((prev) => prev.map((o, i) => (i === idx ? e.target.value : o)))
                }
                placeholder={`Option ${String.fromCharCode(65 + idx)}`}
              />
              {options.length > 2 && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setOptions((prev) => prev.filter((_, i) => i !== idx));
                    if (correctIndex >= options.length - 1) setCorrectIndex(0);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
          {options.length < 6 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOptions((prev) => [...prev, ''])}
            >
              <Plus className="h-3 w-3 mr-1" /> Add option
            </Button>
          )}
          <div>
            <Label>Weight</Label>
            <Input
              type="number"
              min={0.1}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(parseFloat(e.target.value || '1'))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              const cleaned = options.map((o) => o.trim());
              if (!prompt.trim()) {
                toast({ variant: 'destructive', title: 'Prompt is required.' });
                return;
              }
              if (cleaned.filter(Boolean).length < 2) {
                toast({ variant: 'destructive', title: 'At least two options are required.' });
                return;
              }
              if (!cleaned[correctIndex]) {
                toast({ variant: 'destructive', title: 'Correct option is empty.' });
                return;
              }
              onSave({
                id: existing?.id,
                quiz_id: quizId,
                prompt: prompt.trim(),
                options: cleaned.filter(Boolean),
                correct_index: correctIndex,
                weight,
                sort_order: existing?.sort_order ?? 0,
              });
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────────────────────────────── Assignment UI ─── */

const ASSIGNABLE_ROLES: { value: SafetyAppRole; label: string }[] = [
  { value: 'worker', label: 'Worker' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'manager', label: 'Manager' },
  { value: 'safety_officer', label: 'Safety Officer' },
  { value: 'safety_head', label: 'Safety Head' },
  { value: 'bu_head', label: 'BU Head' },
  { value: 'auditor', label: 'Auditor' },
];

function AssignmentForm({ sopId, hasQuiz }: { sopId: string; hasQuiz: boolean }) {
  const [role, setRole] = useState<SafetyAppRole>('worker');
  const [dueDays, setDueDays] = useState(7);
  const assign = useAssignSopToRole();
  const { toast } = useToast();

  return (
    <div className="grid sm:grid-cols-3 gap-3 items-end">
      <div>
        <Label>Role</Label>
        <Select value={role} onValueChange={(v) => setRole(v as SafetyAppRole)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ASSIGNABLE_ROLES.map((r) => (
              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Due in (days)</Label>
        <Input
          type="number"
          min={1}
          value={dueDays}
          onChange={(e) => setDueDays(Math.max(1, parseInt(e.target.value || '7', 10)))}
        />
      </div>
      <Button
        disabled={assign.isPending || !hasQuiz}
        onClick={async () => {
          if (!hasQuiz) {
            toast({ variant: 'destructive', title: 'Create the quiz first.' });
            return;
          }
          try {
            const r = await assign.mutateAsync({
              sopId,
              role,
              dueInDays: dueDays,
            });
            if (!r?.ok) {
              toast({ variant: 'destructive', title: r?.error ?? 'Could not assign' });
              return;
            }
            toast({
              title: `Assigned to ${r.result?.assigned ?? 0} user(s)`,
              description: `Due ${new Date(r.result?.due_at ?? '').toLocaleString()}`,
            });
          } catch (e: unknown) {
            toast({
              variant: 'destructive',
              title: 'Assignment failed',
              description: e instanceof Error ? e.message : String(e),
            });
          }
        }}
      >
        Assign
      </Button>
    </div>
  );
}

function SopAssignmentsList({ sopId }: { sopId: string }) {
  const { data, isLoading } = useSopAssignments(sopId);
  if (isLoading) return <Skeleton className="h-24" />;
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground text-sm">
          No assignments for this SOP yet.
        </CardContent>
      </Card>
    );
  }

  const counts = data.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] ?? 0) + 1;
    return acc;
  }, {});
  const total = data.length;
  const passed = counts.passed ?? 0;
  const compliance = Math.round((passed / total) * 100);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Compliance overview</CardTitle>
        <CardDescription>
          {passed} of {total} have passed ({compliance}%)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {Object.entries(counts).map(([k, v]) => (
            <Badge key={k} variant="outline">
              {k}: {v}
            </Badge>
          ))}
        </div>
        <Separator className="my-4" />
        <p className="text-xs text-muted-foreground">
          Detailed per-user dashboard will land in Phase 7 (Analytics).
        </p>
      </CardContent>
    </Card>
  );
}