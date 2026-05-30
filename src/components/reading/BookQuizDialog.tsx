import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, Award, RefreshCw, X, Check, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Difficulty = 'easy' | 'medium' | 'hard';

interface Question {
  question: string;
  options: string[];
  correct_index: number;
  explanation?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookId: string;
  bookTitle: string;
}

type Stage = 'config' | 'loading' | 'quiz' | 'results';

const BookQuizDialog: React.FC<Props> = ({ open, onOpenChange, bookId, bookTitle }) => {
  const { user } = useAuth();
  const [stage, setStage] = useState<Stage>('config');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [questionCount, setQuestionCount] = useState(10);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizId, setQuizId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<number[]>([]);
  const [currentQ, setCurrentQ] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setStage('config');
    setQuestions([]);
    setQuizId(null);
    setAnswers([]);
    setCurrentQ(0);
    setError(null);
  };

  const handleStart = async (forceRefresh = false) => {
    setStage('loading');
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('generate-book-quiz', {
        body: { bookId, difficulty, questionCount, forceRefresh },
      });
      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);
      if (!data?.questions || data.questions.length === 0) {
        throw new Error('لم نتمكن من توليد أسئلة لهذا الكتاب');
      }
      setQuestions(data.questions);
      setQuizId(data.quizId ?? null);
      setAnswers(new Array(data.questions.length).fill(-1));
      setCurrentQ(0);
      setStage('quiz');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || 'حدث خطأ');
      setStage('config');
      toast.error(e?.message || 'فشل توليد الاختبار');
    }
  };

  const handleAnswer = (idx: number) => {
    const next = [...answers];
    next[currentQ] = idx;
    setAnswers(next);
  };

  const handleSubmit = async () => {
    const score = questions.reduce(
      (acc, q, i) => acc + (answers[i] === q.correct_index ? 1 : 0),
      0,
    );
    setStage('results');
    if (user) {
      await supabase.from('book_quiz_attempts').insert({
        user_id: user.id,
        book_id: bookId,
        quiz_id: quizId,
        difficulty,
        question_count: questions.length,
        score,
        answers: answers.map((a, i) => ({
          q: questions[i].question,
          chosen: a,
          correct: questions[i].correct_index,
        })),
      });
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const score = questions.reduce(
    (acc, q, i) => acc + (answers[i] === q.correct_index ? 1 : 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            اختبار: {bookTitle}
          </DialogTitle>
        </DialogHeader>

        {stage === 'config' && (
          <div className="space-y-5">
            <p className="text-muted-foreground text-sm">
              🎉 أحسنت! أكملت قراءة هذا الكتاب. اختبر فهمك الآن.
            </p>

            <div>
              <Label className="mb-2 block font-semibold">الصعوبة</Label>
              <RadioGroup
                value={difficulty}
                onValueChange={(v) => setDifficulty(v as Difficulty)}
                className="grid grid-cols-3 gap-2"
              >
                {[
                  { v: 'easy', l: 'سهل' },
                  { v: 'medium', l: 'متوسط' },
                  { v: 'hard', l: 'صعب' },
                ].map((opt) => (
                  <Label
                    key={opt.v}
                    className={cn(
                      'border rounded-lg p-3 text-center cursor-pointer transition',
                      difficulty === opt.v ? 'border-primary bg-primary/10' : 'hover:bg-accent',
                    )}
                  >
                    <RadioGroupItem value={opt.v} className="sr-only" />
                    {opt.l}
                  </Label>
                ))}
              </RadioGroup>
            </div>

            <div>
              <Label className="mb-2 block font-semibold">عدد الأسئلة</Label>
              <RadioGroup
                value={String(questionCount)}
                onValueChange={(v) => setQuestionCount(Number(v))}
                className="grid grid-cols-3 gap-2"
              >
                {[5, 10, 15].map((n) => (
                  <Label
                    key={n}
                    className={cn(
                      'border rounded-lg p-3 text-center cursor-pointer transition',
                      questionCount === n ? 'border-primary bg-primary/10' : 'hover:bg-accent',
                    )}
                  >
                    <RadioGroupItem value={String(n)} className="sr-only" />
                    {n} أسئلة
                  </Label>
                ))}
              </RadioGroup>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={() => handleStart(false)} className="flex-1">
                ابدأ الاختبار
              </Button>
              <Button variant="ghost" onClick={() => handleClose(false)}>
                لاحقاً
              </Button>
            </div>
          </div>
        )}

        {stage === 'loading' && (
          <div className="py-12 flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-muted-foreground">جاري توليد الأسئلة بالذكاء الاصطناعي...</p>
          </div>
        )}

        {stage === 'quiz' && questions.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>سؤال {currentQ + 1} من {questions.length}</span>
              <div className="flex-1 mx-3 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${((currentQ + 1) / questions.length) * 100}%` }}
                />
              </div>
            </div>

            <h3 className="text-lg font-semibold leading-relaxed">
              {questions[currentQ].question}
            </h3>

            <div className="space-y-2">
              {questions[currentQ].options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  className={cn(
                    'w-full text-right p-3 rounded-lg border transition',
                    answers[currentQ] === i
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'hover:bg-accent',
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                disabled={currentQ === 0}
                onClick={() => setCurrentQ(currentQ - 1)}
              >
                السابق
              </Button>
              {currentQ < questions.length - 1 ? (
                <Button
                  className="flex-1"
                  disabled={answers[currentQ] === -1}
                  onClick={() => setCurrentQ(currentQ + 1)}
                >
                  التالي
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  disabled={answers.some((a) => a === -1)}
                  onClick={handleSubmit}
                >
                  إنهاء وعرض النتيجة
                </Button>
              )}
            </div>
          </div>
        )}

        {stage === 'results' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="text-5xl font-black text-primary mb-2">
                {score} / {questions.length}
              </div>
              <p className="text-muted-foreground">
                {score === questions.length ? '🏆 ممتاز! درجة كاملة' :
                 score / questions.length >= 0.7 ? '👏 أداء رائع' :
                 score / questions.length >= 0.5 ? '👍 جيد، يمكنك مراجعة بعض النقاط' :
                 '📖 ربما تحتاج لإعادة القراءة'}
              </p>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {questions.map((q, i) => {
                const correct = answers[i] === q.correct_index;
                return (
                  <div key={i} className={cn(
                    'p-3 rounded-lg border text-sm',
                    correct ? 'border-green-500/40 bg-green-500/5' : 'border-red-500/40 bg-red-500/5',
                  )}>
                    <div className="flex items-start gap-2">
                      {correct ? <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" /> : <X className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />}
                      <div className="flex-1">
                        <p className="font-medium mb-1">{q.question}</p>
                        {!correct && (
                          <p className="text-xs text-muted-foreground">
                            الإجابة الصحيحة: <span className="font-medium text-foreground">{q.options[q.correct_index]}</span>
                          </p>
                        )}
                        {q.explanation && (
                          <p className="text-xs text-muted-foreground mt-1">{q.explanation}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { reset(); }} className="flex-1">
                <RefreshCw className="w-4 h-4 ml-2" />
                اختبار جديد
              </Button>
              <Button onClick={() => handleClose(false)}>إغلاق</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default BookQuizDialog;
