import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { GraduationCap, Clock, BookOpen, ArrowLeft, Loader2 } from 'lucide-react';
import { TrainingStatusBadge } from '@/components/safety/TrainingStatusBadge';
import {
  useMyTrainingAssignments,
  useSafetySop,
  useSafetyQuizForSop,
  useStartTrainingAttempt,
  useSubmitTrainingAttempt,
  type AttemptRuntime,
  type SafetyTrainingAssignmentRow,
} from '@/hooks/useSafetyTraining';
import { canStartAttempt, formatDueIn } from '@/lib/safetyTraining';

/**
 * Worker-facing Training page.
 *
 * Three modes:
 *   1. List of my assignments
 *   2. Reader (scroll-locked until min_read_seconds elapsed)
 *   3. Quiz runner (server-scored)
 *
 * The mode is local UI state, not a route, so we never deep-link into a
 * mid-attempt state by accident.
 */
export default function SafetyTraining() {
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);

  if (openAssignmentId) {
    return (
      <AssignmentRunner
        assignmentId={openAssignmentId}
        onBack={() => setOpenAssignmentId(null)}
      />
    );
  }
  return <AssignmentList onOpen={setOpenAssignmentId} />;
}

/* ────────────────────────────────────────────────────────── List ─── */

function AssignmentList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useMyTrainingAssignments();

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
          <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
          My Training
        </h1>
        <p className="text-sm text-muted-foreground">
          Read each SOP carefully, then complete the quiz to pass.
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : (data ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            No training assigned to you yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {data!.map((a) => (
            <AssignmentCard key={a.id} assignment={a} onOpen={() => onOpen(a.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment,
  onOpen,
}: {
  assignment: SafetyTrainingAssignmentRow;
  onOpen: () => void;
}) {
  const { data: sop } = useSafetySop(assignment.sop_id);
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{sop?.title ?? 'Loading…'}</span>
            {sop?.code && (
              <span className="text-xs text-muted-foreground">v{sop.version} · {sop.code}</span>
            )}
            <TrainingStatusBadge status={assignment.status} />
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDueIn(assignment.due_at)}
            </span>
            <span>Attempts: {assignment.attempts_count}</span>
          </div>
        </div>
        <Button onClick={onOpen} disabled={assignment.status === 'passed'}>
          {assignment.status === 'passed' ? 'Completed' : 'Open'}
        </Button>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────── Reader + quiz runner ─── */

type Phase = 'reader' | 'quiz' | 'result';

function AssignmentRunner({
  assignmentId,
  onBack,
}: {
  assignmentId: string;
  onBack: () => void;
}) {
  const { data: assignments } = useMyTrainingAssignments();
  const assignment = useMemo(
    () => assignments?.find((a) => a.id === assignmentId) ?? null,
    [assignments, assignmentId],
  );
  const { data: sop } = useSafetySop(assignment?.sop_id);
  const { data: quiz } = useSafetyQuizForSop(assignment?.sop_id);

  const [phase, setPhase] = useState<Phase>('reader');
  const [readSeconds, setReadSeconds] = useState(0);
  const [attempt, setAttempt] = useState<AttemptRuntime | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; passed: boolean; pass_threshold: number } | null>(
    null,
  );

  const startMut = useStartTrainingAttempt();
  const submitMut = useSubmitTrainingAttempt();
  const { toast } = useToast();

  // Reading timer
  useEffect(() => {
    if (phase !== 'reader') return;
    const t = window.setInterval(() => setReadSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, [phase]);

  if (!assignment || !sop) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const minRead = sop.min_read_seconds ?? 60;
  const readPct = Math.min(100, Math.round((readSeconds / minRead) * 100));
  const canStart =
    readSeconds >= minRead &&
    !!quiz &&
    canStartAttempt(assignment.status, assignment.attempts_count, quiz.max_attempts);

  async function handleStartQuiz() {
    try {
      const rt = await startMut.mutateAsync(assignmentId);
      setAttempt(rt);
      setAnswers({});
      setPhase('quiz');
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Could not start quiz',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  async function handleSubmitQuiz() {
    if (!attempt) return;
    if (Object.keys(answers).length < attempt.questions.length) {
      toast({
        variant: 'destructive',
        title: 'Please answer every question before submitting.',
      });
      return;
    }
    try {
      const r = await submitMut.mutateAsync({
        attemptId: attempt.attempt_id,
        answers,
        readingSeconds: readSeconds,
      });
      setResult(r);
      setPhase('result');
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Submission failed',
        description: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to my training
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                {sop.title}
              </CardTitle>
              <CardDescription>
                {sop.code} · v{sop.version}
                {sop.category ? ` · ${sop.category}` : ''}
              </CardDescription>
            </div>
            <TrainingStatusBadge status={assignment.status} />
          </div>
        </CardHeader>
      </Card>

      {phase === 'reader' && (
        <ReaderView
          bodyMd={sop.body_md}
          minRead={minRead}
          readSeconds={readSeconds}
          readPct={readPct}
          canStart={canStart}
          starting={startMut.isPending}
          onStart={handleStartQuiz}
          hasQuiz={!!quiz}
        />
      )}

      {phase === 'quiz' && attempt && (
        <QuizView
          attempt={attempt}
          answers={answers}
          setAnswers={setAnswers}
          onSubmit={handleSubmitQuiz}
          submitting={submitMut.isPending}
        />
      )}

      {phase === 'result' && result && (
        <ResultView result={result} onBack={onBack} />
      )}
    </div>
  );
}

function ReaderView(props: {
  bodyMd: string;
  minRead: number;
  readSeconds: number;
  readPct: number;
  canStart: boolean;
  starting: boolean;
  hasQuiz: boolean;
  onStart: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-foreground">
          {props.bodyMd || (
            <em className="text-muted-foreground">No content provided for this SOP.</em>
          )}
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Reading time: {props.readSeconds}s / {props.minRead}s required
            </span>
            <span className="text-muted-foreground">{props.readPct}%</span>
          </div>
          <Progress value={props.readPct} />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={props.onStart}
            disabled={!props.canStart || props.starting || !props.hasQuiz}
          >
            {props.starting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Starting…
              </>
            ) : !props.hasQuiz ? (
              'No quiz configured'
            ) : !props.canStart ? (
              'Read first to unlock quiz'
            ) : (
              'Start Quiz'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function QuizView(props: {
  attempt: AttemptRuntime;
  answers: Record<string, number>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  onSubmit: () => void;
  submitting: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quiz</CardTitle>
        <CardDescription>
          Pass mark: {props.attempt.quiz.pass_threshold}% · Attempt{' '}
          {props.attempt.quiz.attempts_used} of {props.attempt.quiz.max_attempts}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {props.attempt.questions.map((q, i) => (
          <div key={q.id} className="space-y-2">
            <div className="font-medium">
              {i + 1}. {q.prompt}
            </div>
            <RadioGroup
              value={props.answers[q.id]?.toString() ?? ''}
              onValueChange={(v) =>
                props.setAnswers((prev) => ({ ...prev, [q.id]: Number(v) }))
              }
            >
              {q.options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <RadioGroupItem id={`${q.id}-${idx}`} value={idx.toString()} />
                  <Label htmlFor={`${q.id}-${idx}`} className="cursor-pointer">
                    {opt}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>
        ))}
        <div className="flex justify-end">
          <Button onClick={props.onSubmit} disabled={props.submitting}>
            {props.submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting…
              </>
            ) : (
              'Submit Quiz'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ResultView({
  result,
  onBack,
}: {
  result: { score: number; passed: boolean; pass_threshold: number };
  onBack: () => void;
}) {
  return (
    <Card>
      <CardContent className="p-10 text-center space-y-4">
        <div
          className={`text-5xl font-bold ${
            result.passed ? 'text-primary' : 'text-destructive'
          }`}
        >
          {result.score}%
        </div>
        <div className="text-lg">
          {result.passed ? 'Passed 🎉' : 'Did not pass'}
        </div>
        <div className="text-sm text-muted-foreground">
          Pass mark: {result.pass_threshold}%
        </div>
        <Button onClick={onBack}>Back to my training</Button>
      </CardContent>
    </Card>
  );
}