import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Pause,
  Play,
  Bookmark,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Sun,
  Moon,
  Highlighter,
  ChevronLeft,
  ChevronRight,
  Slash,
  Award,
  BarChart2,
  Sparkles,
  AlertCircle,
  Cpu,
  Copy,
  Check,
  X
} from 'lucide-react';
import { createPortal } from 'react-dom';
import type { RCTest, RCAttempt } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import { useTheme } from '../contexts/ThemeContext';
import { getTest } from '../lib/testStore';
import { saveAttempt, getAttempts, saveCustomTest } from '../lib/storage';
import { generateRcQuestions, formatQualityNote } from '../lib/geminiClient.ts';
export { formatQualityNote };

interface HighlightSpan {
  paraIdx: number;
  text: string;
  thread: 1 | 2;
}

function computePlainReason(reason?: string | null): string {
  if (!reason) {
    return 'Gemini AI generation was unsuccessful; deterministic rule-based algorithm was used instead.';
  }
  if (reason.includes('unverified') || reason.includes('minimum required is') || reason.includes('validation and review')) {
    return 'Not enough questions survived structural checks and independent blind reviewer verification.';
  }
  if (reason.includes('could not be verified against passage evidence')) {
    return 'Gemini generated questions, but not enough options could be verified against exact passage evidence.';
  }
  if (reason.includes('HTTP 429') || reason.includes('rate_limited')) {
    return 'Google Gemini API rate limit or quota was exceeded.';
  }
  if (reason.includes('HTTP 403') || reason.includes('API_KEY_INVALID') || reason.includes('missing_key')) {
    return 'Google Gemini API key was rejected as invalid, missing, or unauthorized.';
  }
  if (reason.includes('timed out') || reason.includes('timeout')) {
    return 'Gemini API request exceeded the timeout window.';
  }
  if (reason.includes('MAX_TOKENS')) {
    return 'Gemini generation reached the maximum output token limit before completing.';
  }
  return reason;
}

function computeVerificationSentence(test?: RCTest | null): string {
  if (!test) return '';
  const info = test.verification_info;
  const diag = test.generation_diagnostics;
  if (!info && !diag) return 'Generated with AI.';

  const groqModel = info?.groqModelUsed || diag?.groqModelUsed;
  const groqFailMsg = diag?.groqFailureMessage || info?.groqFailureMessage;

  if (info?.groqUnavailable || diag?.groqUnavailable) {
    const reasonMsg = groqFailMsg ? ` (${groqFailMsg})` : '';
    return `Groq failed${reasonMsg}, so Gemini checked the answers (${info?.questionsKept ?? diag?.questionsPassed ?? 0} of ${info?.questionsChecked ?? diag?.questionsChecked ?? 0} questions kept).`;
  }
  if (info?.reviewer === 'groq' || diag?.reviewerUsed === 'groq') {
    const modelTag = groqModel ? `checked by Groq (${groqModel})` : 'checked by Groq';
    return `${info?.questionsKept ?? diag?.questionsPassed ?? 0} of ${info?.questionsChecked ?? diag?.questionsChecked ?? 0} questions kept (${modelTag}).`;
  }
  if (info?.reviewer === 'gemini' || diag?.reviewerUsed === 'gemini') {
    return `${info?.questionsKept ?? diag?.questionsPassed ?? 0} of ${info?.questionsChecked ?? diag?.questionsChecked ?? 0} questions kept after checking by Gemini.`;
  }
  if (info?.reviewer === 'none' || diag?.reviewerUsed === 'none') {
    return 'answers were not double-checked';
  }
  return `${info?.questionsKept ?? diag?.questionsPassed ?? 0} questions verified.`;
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { displayName, geminiKey, hasGeminiKey } = useProfile();
  const { theme, toggleTheme } = useTheme();

  const [test, setTest] = useState<RCTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fallback Diagnostics & Retry Modal
  const [fallbackModalOpen, setFallbackModalOpen] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Exam State
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | null>>({});
  const [markedReview, setMarkedReview] = useState<Record<string, boolean>>({});
  const [eliminated, setEliminated] = useState<Record<string, boolean>>({});
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [paused, setPaused] = useState(false);

  // Reader Tools
  const [fontScale, setFontScale] = useState<'sm' | 'md' | 'lg'>('md');
  const [activeThread, setActiveThread] = useState<null | 1 | 2>(null);
  const [highlights, setHighlights] = useState<HighlightSpan[]>([]);
  const [mobilePane, setMobilePane] = useState<'passage' | 'questions'>('passage');

  // Submission & Review State
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previousAttempt, setPreviousAttempt] = useState<RCAttempt | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = getTest(id);
      if (!data) throw new Error('Passage test not found.');
      setTest(data);
      setCurrentIdx(0);
      setAnswers({});
      setMarkedReview({});
      setEliminated({});
      setElapsedSeconds(0);
      setSubmitted(false);
      setHighlights([]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error loading test');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Live Exam Timer
  useEffect(() => {
    if (loading || !test || paused || submitted) return;
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [loading, test, paused, submitted]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleParagraphSelection = (paraIdx: number) => {
    if (!activeThread) return;
    const sel = window.getSelection();
    const selectedText = sel?.toString().trim() || '';
    if (selectedText.length < 4 || selectedText.length > 260) return;
    setHighlights((prev) => [...prev, { paraIdx, text: selectedText, thread: activeThread }]);
    sel?.removeAllRanges();
  };

  const renderHighlightedParagraph = (para: string, paraIdx: number) => {
    const paraHighlights = highlights.filter((h) => h.paraIdx === paraIdx);
    if (paraHighlights.length === 0) return para;

    // Apply most recent non-overlapping highlight match cleanly
    let parts: Array<{ str: string; thread: null | 1 | 2 }> = [{ str: para, thread: null }];
    for (const hl of paraHighlights) {
      const nextParts: Array<{ str: string; thread: null | 1 | 2 }> = [];
      for (const part of parts) {
        if (part.thread !== null) {
          nextParts.push(part);
          continue;
        }
        const idx = part.str.indexOf(hl.text);
        if (idx === -1) {
          nextParts.push(part);
        } else {
          if (idx > 0) nextParts.push({ str: part.str.slice(0, idx), thread: null });
          nextParts.push({ str: hl.text, thread: hl.thread });
          const after = part.str.slice(idx + hl.text.length);
          if (after) nextParts.push({ str: after, thread: null });
        }
      }
      parts = nextParts;
    }

    return parts.map((p, i) =>
      p.thread ? (
        <mark
          key={i}
          className="rounded px-0.5"
          style={{
            backgroundColor: p.thread === 1 ? 'var(--color-thread-1-soft)' : 'var(--color-thread-2-soft)',
            color: 'inherit',
            fontSize: 'inherit',
            fontFamily: 'inherit',
            lineHeight: 'inherit',
            borderBottom: `2px solid ${p.thread === 1 ? 'var(--color-thread-1)' : 'var(--color-thread-2)'}`
          }}
        >
          {p.str}
        </mark>
      ) : (
        <span key={i}>{p.str}</span>
      )
    );
  };

  // Compute results memo
  const resultMetrics = useMemo(() => {
    if (!test || !Array.isArray(test.questions)) return null;
    let correct = 0;
    let wrong = 0;
    let unattempted = 0;
    const byType = new Map<string, { correct: number; total: number }>();

    for (const q of test.questions) {
      const picked = answers[q.id];
      const curType = byType.get(q.type) || { correct: 0, total: 0 };
      curType.total += 1;
      if (!picked) {
        unattempted += 1;
      } else if (picked === q.correctLetter) {
        correct += 1;
        curType.correct += 1;
      } else {
        wrong += 1;
      }
      byType.set(q.type, curType);
    }

    const isCat = test.exam_type === 'CAT';
    const score = isCat ? correct * 3 - wrong * 1 : correct * 3;
    const maxScore = test.questions.length * 3;
    const attempted = correct + wrong;
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
    const readSecs = Math.max(45, Math.round(elapsedSeconds * 0.52));
    const wpm = Math.min(520, Math.max(120, Math.round((test.word_count / readSecs) * 60)));

    const typeBreakdown = Array.from(byType.entries()).map(([type, counts]) => ({
      type,
      correct: counts.correct,
      total: counts.total
    }));

    return {
      correct,
      wrong,
      unattempted,
      score,
      maxScore,
      accuracy,
      wpm,
      typeBreakdown
    };
  }, [test, answers, elapsedSeconds]);

  const handleSubmitTest = () => {
    if (!test || !resultMetrics || submitted || submitting) return;
    setSubmitting(true);
    try {
      const allAttempts = getAttempts();
      const prev = allAttempts.find((a) => String(a.test_id) === String(test.id));
      setPreviousAttempt(prev || null);

      const newAttempt: RCAttempt = {
        id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        test_id: test.id,
        user_id: 'local-aspirant',
        user_name: displayName || 'Aspirant',
        exam_type: test.exam_type,
        score: resultMetrics.score,
        max_score: resultMetrics.maxScore,
        correct_count: resultMetrics.correct,
        wrong_count: resultMetrics.wrong,
        unattempted_count: resultMetrics.unattempted,
        total_questions: test.questions.length,
        time_seconds: Math.max(10, elapsedSeconds),
        wpm_estimate: resultMetrics.wpm,
        answers,
        type_breakdown: resultMetrics.typeBreakdown,
        created_at: new Date().toISOString(),
        rc_tests: {
          title: test.title,
          topic: test.topic,
          category: test.category,
          difficulty: test.difficulty,
        }
      };

      saveAttempt(newAttempt);
    } catch (err) {
      console.error('Submit attempt error:', err);
    } finally {
      setSubmitted(true);
      setSubmitting(false);
      setMobilePane('questions');
    }
  };

  const handleRetake = () => {
    setAnswers({});
    setMarkedReview({});
    setEliminated({});
    setElapsedSeconds(0);
    setCurrentIdx(0);
    setSubmitted(false);
    setPreviousAttempt(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <div
          className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }}
        />
        <p className="text-sm font-medium" style={{ color: 'var(--color-text-muted)' }}>
          Preparing split-screen exam player…
        </p>
      </div>
    );
  }

  if (error || !test) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="font-display text-2xl font-semibold mb-2" style={{ color: 'var(--color-ink)' }}>
          {error || 'Test not found'}
        </p>
        <Link to="/" className="px-4 py-2 rounded-xl text-sm rc-btn-primary mt-3">
          Back to Generator
        </Link>
      </div>
    );
  }

  if (!test.questions || test.questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
        <p className="font-display text-2xl font-semibold mb-2" style={{ color: 'var(--color-ink)' }}>
          This passage has no questions yet
        </p>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          This is an un-authored catalog slot or draft passage.
        </p>
        <Link to="/library" className="px-4 py-2 rounded-xl text-sm rc-btn-primary mt-4">
          Back to Library
        </Link>
      </div>
    );
  }

  const currentQuestion = test.questions[currentIdx] || test.questions[0];
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const overTarget = elapsedSeconds > (test.target_seconds || 480);

  const fontSizePx =
    fontScale === 'sm' ? '16.5px' : fontScale === 'lg' ? '23px' : '19.5px';

  const renderGenerationBadge = () => {
    if (!test || test.category === 'library' || test.category === 'pyq' || !test.generation_source) {
      return null;
    }

    if (test.generation_source === 'ai') {
      const sentence = computeVerificationSentence(test);
      const isGroq = test.verification_info?.reviewer === 'groq' || test.generation_diagnostics?.reviewerUsed === 'groq';
      const groqModel = test.verification_info?.groqModelUsed || test.generation_diagnostics?.groqModelUsed;
      return (
        <div className="inline-flex items-center gap-1.5 shrink-0">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 border"
            style={{
              backgroundColor: 'var(--color-correct-soft)',
              color: 'var(--color-correct)',
              borderColor: 'var(--color-correct)'
            }}
            title={sentence}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>{isGroq && groqModel ? `Successful AI · checked by Groq (${groqModel})` : 'Successful AI'}</span>
          </span>
          <button
            type="button"
            onClick={() => setFallbackModalOpen(true)}
            className="text-[11px] font-medium underline cursor-pointer hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-correct)' }}
            title="View verification details and quality notes"
          >
            Details
          </button>
        </div>
      );
    }

    if (test.generation_source === 'fallback') {
      return (
        <div className="inline-flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setFallbackModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer hover:opacity-85 transition-all shadow-xs"
            style={{
              backgroundColor: 'var(--color-warn-soft)',
              color: 'var(--color-warn)',
              borderColor: 'var(--color-warn)'
            }}
            title={test.generation_reason ? `Click for details & AI retry: ${test.generation_reason}` : 'Click for details & AI retry'}
          >
            <AlertCircle className="w-3 h-3" />
            <span>Fallback</span>
          </button>
          <button
            type="button"
            onClick={() => setFallbackModalOpen(true)}
            className="text-[11px] font-medium underline cursor-pointer hover:opacity-80 transition-opacity"
            style={{ color: 'var(--color-warn)' }}
            title="View diagnostics and retry with Gemini AI"
          >
            Details
          </button>
        </div>
      );
    }

    if (test.generation_source === 'algorithm') {
      return (
        <span
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold shrink-0 border"
          style={{
            backgroundColor: 'var(--color-surface-2)',
            color: 'var(--color-text-muted)',
            borderColor: 'var(--color-border)'
          }}
          title="Generated via deterministic rule-based algorithm"
        >
          <Cpu className="w-3 h-3" />
          <span>Algorithm</span>
        </span>
      );
    }

    return null;
  };

  const plainReason = computePlainReason(test?.generation_reason);

  const handleCopyDiagnostics = () => {
    const diag = test?.generation_diagnostics || {};
    const lines = [
      'PracticeRC Generation Diagnostics',
      `Timestamp: ${diag.timestamp || new Date().toISOString()}`,
      `Model: ${diag.modelUsed || 'gemini-3.5-flash-lite'}`,
      `Reviewer: ${diag.reviewerUsed || test?.verification_info?.reviewer || 'none'}`,
      ...(diag.groqModelUsed || test?.verification_info?.groqModelUsed
        ? [`Groq Model: ${diag.groqModelUsed || test?.verification_info?.groqModelUsed}`]
        : []),
      `Groq Unavailable: ${Boolean(diag.groqUnavailable || test?.verification_info?.groqUnavailable)}`,
      ...(diag.groqFailureMessage || test?.verification_info?.groqFailureMessage
        ? [`Groq Failure: ${diag.groqFailureMessage || test?.verification_info?.groqFailureMessage}`]
        : []),
      `HTTP Status: ${diag.httpStatus ?? 'N/A'}`,
      `finishReason: ${diag.finishReason ?? 'N/A'}`,
      `Reason: ${plainReason}`,
      `Raw Message: ${test?.generation_reason || 'N/A'}`,
      `Token Usage: Prompt=${diag.tokenUsage?.promptTokens ?? 'N/A'}, Candidates=${diag.tokenUsage?.candidatesTokens ?? 'N/A'}, Total=${diag.tokenUsage?.totalTokens ?? 'N/A'}`,
      `Questions Returned: ${diag.questionsReturned ?? 'N/A'}`,
      `Questions Passed Verification: ${diag.questionsPassed ?? 'N/A'}`
    ];
    if (diag.rejectionReasons && diag.rejectionReasons.length > 0) {
      lines.push('Rejection Details:');
      diag.rejectionReasons.forEach((r: string) => lines.push(` - ${r}`));
      diag.rejectionReasons.forEach((r: string) => {
        const sanitized = !submitted
          ? r.replace(/\b(Main Idea|Inference|Paragraph Function|Tone & Attitude|Strengthen \/ Weaken|Detail & Logic|Vocabulary in Context)\b/gi, 'Question')
          : r;
        lines.push(` - ${sanitized}`);
      });
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const handleRegenerateWithAi = async () => {
    if (!test || !hasGeminiKey) return;
    setRegenerating(true);
    setRegenError(null);
    try {
      const result = await generateRcQuestions({
        paragraphs: test.passage_paragraphs,
        title: test.title,
        topic: test.topic,
        examType: test.exam_type,
        difficulty: test.difficulty,
        engine: 'gemini',
        geminiKey
      });

      if (result.source === 'ai') {
        const updated: RCTest = {
          ...test,
          questions: result.questions,
          generation_source: 'ai',
          generation_reason: null,
          generation_diagnostics: result.diagnostics || null
        };
        setTest(updated);
        if (test.category === 'custom') {
          saveCustomTest(updated);
        }
        setAnswers({});
        setMarkedReview({});
        setEliminated({});
        setCurrentIdx(0);
        setFallbackModalOpen(false);
      } else {
        setRegenError(result.reason || 'Gemini generation failed again; keeping original questions.');
        if (result.diagnostics) {
          setTest((prev) => (prev ? { ...prev, generation_diagnostics: result.diagnostics } : prev));
        }
      }
    } catch (err: any) {
      setRegenError(err.message || 'Regeneration encountered an error.');
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--color-bg)' }}>
      {/* Top Exam Chrome */}
      <header
        className="h-14 px-3 sm:px-5 border-b flex items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border)'
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="p-2 rounded-xl border cursor-pointer shrink-0"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-ink)'
            }}
            title="Exit player"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold uppercase shrink-0"
                style={{
                  backgroundColor: 'var(--color-primary-soft)',
                  color: 'var(--color-primary)'
                }}
              >
                {test.exam_type === 'CAT' ? 'CAT +3 / −1' : 'GMAT A–E'}
              </span>
              {renderGenerationBadge()}
              <h1 className="text-sm font-semibold truncate" style={{ color: 'var(--color-ink)' }}>
                {test.title}
              </h1>
            </div>
            <p className="text-[11px] truncate hidden sm:block" style={{ color: 'var(--color-text-soft)' }}>
              {test.source_label} · {test.topic} · {test.word_count} words
            </p>
          </div>
        </div>

        {/* Reader Highlighting & Font Controls (Desktop) */}
        <div className="hidden md:flex items-center gap-1.5">
          <div
            className="flex items-center gap-1 p-1 rounded-xl border"
            style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
          >
            <button
              type="button"
              onClick={() => setActiveThread(activeThread === 1 ? null : 1)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: activeThread === 1 ? 'var(--color-thread-1-soft)' : 'transparent',
                color: activeThread === 1 ? 'var(--color-thread-1)' : 'var(--color-text-muted)'
              }}
              title="Select text in passage to highlight Main Claim (Blue)"
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span>Claim</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveThread(activeThread === 2 ? null : 2)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer"
              style={{
                backgroundColor: activeThread === 2 ? 'var(--color-thread-2-soft)' : 'transparent',
                color: activeThread === 2 ? 'var(--color-thread-2)' : 'var(--color-text-muted)'
              }}
              title="Select text in passage to highlight Shift/Counterpoint (Purple)"
            >
              <Highlighter className="w-3.5 h-3.5" />
              <span>Pivot</span>
            </button>
            {highlights.length > 0 && (
              <button
                type="button"
                onClick={() => setHighlights([])}
                className="px-2 py-1 text-[11px] cursor-pointer"
                style={{ color: 'var(--color-text-soft)' }}
              >
                Clear
              </button>
            )}
          </div>

          <div
            className="flex items-center p-1 rounded-xl border text-xs font-semibold"
            style={{ backgroundColor: 'var(--color-bg)', borderColor: 'var(--color-border)' }}
          >
            {(['sm', 'md', 'lg'] as const).map((sz, idx) => (
              <button
                key={sz}
                type="button"
                onClick={() => setFontScale(sz)}
                className="px-2.5 py-1 rounded-lg cursor-pointer font-bold transition-all"
                style={{
                  backgroundColor: fontScale === sz ? 'var(--color-surface)' : 'transparent',
                  color: fontScale === sz ? 'var(--color-primary)' : 'var(--color-text-soft)',
                  boxShadow: fontScale === sz ? 'var(--shadow-soft)' : 'none'
                }}
              >
                {idx === 0 ? 'A-' : idx === 1 ? 'A' : 'A+'}
              </button>
            ))}
          </div>
        </div>

        {/* Timer + Theme + Submit */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-bold border"
            style={{
              backgroundColor: overTarget && !submitted ? 'var(--color-wrong-soft)' : 'var(--color-surface-2)',
              borderColor: overTarget && !submitted ? 'var(--color-wrong)' : 'var(--color-border)',
              color: overTarget && !submitted ? 'var(--color-wrong)' : 'var(--color-ink)'
            }}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{formatTime(elapsedSeconds)}</span>
            <span className="hidden sm:inline font-normal opacity-70">
              / {formatTime(test.target_seconds || 480)}
            </span>
            {!submitted && (
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                className="ml-1 hover:opacity-75 cursor-pointer"
                title={paused ? 'Resume timer' : 'Pause timer'}
              >
                {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={toggleTheme}
            className="w-8 h-8 rounded-xl flex items-center justify-center border cursor-pointer"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-text-muted)'
            }}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {!submitted ? (
            <button
              type="button"
              onClick={handleSubmitTest}
              disabled={submitting}
              className="px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold rc-btn-primary cursor-pointer"
            >
              {submitting ? 'Scoring…' : `Submit (${answeredCount}/${test.questions.length})`}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRetake}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold rc-btn-secondary cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retake</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Pane Switcher */}
      <div
        className="lg:hidden grid grid-cols-2 border-b text-xs font-semibold shrink-0"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={() => setMobilePane('passage')}
          className="py-2.5 text-center border-b-2 cursor-pointer"
          style={{
            borderColor: mobilePane === 'passage' ? 'var(--color-primary)' : 'transparent',
            color: mobilePane === 'passage' ? 'var(--color-primary)' : 'var(--color-text-muted)'
          }}
        >
          Passage ({test.passage_paragraphs.length} paras)
        </button>
        <button
          type="button"
          onClick={() => setMobilePane('questions')}
          className="py-2.5 text-center border-b-2 cursor-pointer"
          style={{
            borderColor: mobilePane === 'questions' ? 'var(--color-primary)' : 'transparent',
            color: mobilePane === 'questions' ? 'var(--color-primary)' : 'var(--color-text-muted)'
          }}
        >
          {submitted ? 'Score & Explanations' : `Questions (${answeredCount}/${test.questions.length})`}
        </button>
      </div>

      {/* Pause Veil */}
      {paused && !submitted && (
        <div
          className="fixed inset-0 z-50 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
          style={{ backgroundColor: 'rgba(16, 21, 19, 0.78)' }}
        >
          <div className="rc-card-elevated p-8 max-w-sm w-full">
            <h2 className="font-display text-2xl font-semibold mb-2" style={{ color: 'var(--color-ink)' }}>
              Timer Paused
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
              Passage hidden to keep your timed pace honest. Ready to step back in?
            </p>
            <button
              type="button"
              onClick={() => setPaused(false)}
              className="w-full py-3 rounded-xl text-sm font-semibold rc-btn-primary cursor-pointer"
            >
              Resume RC Test
            </button>
          </div>
        </div>
      )}

      {/* Split-Screen Body */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
        {/* LEFT PANE: Numbered Passage Reader */}
        <div
          className={`lg:col-span-7 overflow-y-auto exam-scroll p-5 sm:p-8 lg:border-r ${mobilePane === 'questions' ? 'hidden lg:block' : 'block'
            }`}
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border)'
          }}
        >
          <div className="max-w-[70ch] mx-auto">
            {activeThread && (
              <div className="pb-3 mb-4 border-b text-xs font-medium" style={{ borderColor: 'var(--color-border)', color: 'var(--color-primary)' }}>
                Highlight mode active: select text for {activeThread === 1 ? 'Claim (Blue)' : 'Pivot (Purple)'}
              </div>
            )}

            <h1 className="font-display text-[32px] font-bold mb-2 leading-tight text-left" style={{ color: 'var(--color-ink)' }}>
              {test.title}
            </h1>
            <div className="text-xs mb-6 text-left flex flex-wrap items-center gap-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>
              <span>{test.word_count} words</span>
              <span>·</span>
              <span>{test.passage_paragraphs.length} paragraphs</span>
              <span>·</span>
              <span className="uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>{test.topic}</span>
              {test.difficulty && (
                <>
                  <span>·</span>
                  <span>{test.difficulty}</span>
                </>
              )}
              {test.category === 'custom' && test.generation_source && (
                <>
                  <span>·</span>
                  {renderGenerationBadge()}
                </>
              )}
            </div>

            <div
              className="passage-prose"
              style={{
                fontSize: fontSizePx,
                ['--passage-font-size' as any]: fontSizePx
              }}
            >
              {test.passage_paragraphs.map((para, idx) => (
                <p
                  key={idx}
                  id={`p-${idx + 1}`}
                  data-paragraph-index={idx}
                  onMouseUp={() => handleParagraphSelection(idx)}
                >
                  {renderHighlightedParagraph(para, idx)}
                </p>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT PANE: Question Palette & Post-Submit Per-Option Explanations */}
        <div
          className={`lg:col-span-5 overflow-y-auto exam-scroll p-5 sm:p-7 flex flex-col justify-between ${mobilePane === 'passage' ? 'hidden lg:flex' : 'flex'
            }`}
          style={{ backgroundColor: 'var(--color-bg)' }}
        >
          <div className="space-y-5">
            {/* Post-Submit Scorecard Banner */}
            {submitted && resultMetrics && (
              <div
                className="p-5 rounded-2xl border space-y-4"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-primary)',
                  boxShadow: 'var(--shadow-soft)'
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                      {test.exam_type} Set Complete
                    </span>
                    <div className="flex items-baseline gap-2 mt-0.5">
                      <span className="font-display text-4xl font-bold" style={{ color: 'var(--color-ink)' }}>
                        {resultMetrics.score}
                      </span>
                      <span className="text-sm font-medium" style={{ color: 'var(--color-text-soft)' }}>
                        / {resultMetrics.maxScore} pts
                      </span>
                    </div>
                  </div>

                  {previousAttempt && (
                    <div
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      style={{
                        backgroundColor: 'var(--color-surface-2)',
                        color: 'var(--color-text-muted)'
                      }}
                    >
                      <Award className="w-4 h-4" />
                      <span>
                        Previous best: {previousAttempt.score}/{previousAttempt.max_score}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--color-correct-soft)', color: 'var(--color-correct)' }}>
                    <div className="font-bold text-base">{resultMetrics.correct}</div>
                    <div>Correct</div>
                  </div>
                  <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--color-wrong-soft)', color: 'var(--color-wrong)' }}>
                    <div className="font-bold text-base">{resultMetrics.wrong}</div>
                    <div>Wrong</div>
                  </div>
                  <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
                    <div className="font-bold text-base">{resultMetrics.accuracy}%</div>
                    <div>Accuracy</div>
                  </div>
                  <div className="p-2 rounded-xl" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
                    <div className="font-bold text-base">{resultMetrics.wpm}</div>
                    <div>Est. WPM</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs" style={{ borderColor: 'var(--color-border)' }}>
                  <Link
                    to="/reports"
                    className="inline-flex items-center gap-1.5 font-semibold hover:underline"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    <span>View Full VARC Report Card</span>
                  </Link>
                  <Link to="/" className="font-medium hover:underline" style={{ color: 'var(--color-text-muted)' }}>
                    Generate another RC test →
                  </Link>
                </div>
              </div>
            )}

            {/* Question Number Palette */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                {test.questions.map((q, idx) => {
                  const isCur = idx === currentIdx;
                  const picked = answers[q.id];
                  const marked = markedReview[q.id];
                  let bg = 'var(--color-surface)';
                  let fg = 'var(--color-text-muted)';
                  let border = 'var(--color-border-strong)';

                  if (submitted) {
                    if (!picked) {
                      bg = 'var(--color-surface-2)';
                    } else if (picked === q.correctLetter) {
                      bg = 'var(--color-correct-soft)';
                      fg = 'var(--color-correct)';
                      border = 'var(--color-correct)';
                    } else {
                      bg = 'var(--color-wrong-soft)';
                      fg = 'var(--color-wrong)';
                      border = 'var(--color-wrong)';
                    }
                  } else if (marked) {
                    bg = 'var(--color-warn-soft)';
                    fg = 'var(--color-warn)';
                    border = 'var(--color-warn)';
                  } else if (picked) {
                    bg = 'var(--color-primary-soft)';
                    fg = 'var(--color-primary)';
                    border = 'var(--color-primary)';
                  }

                  return (
                    <button
                      key={q.id}
                      type="button"
                      onClick={() => setCurrentIdx(idx)}
                      className="w-9 h-9 rounded-xl text-xs font-bold border transition-all cursor-pointer"
                      style={{
                        backgroundColor: bg,
                        color: fg,
                        borderColor: isCur ? 'var(--color-ink)' : border,
                        boxShadow: isCur ? '0 0 0 2px var(--color-ink)' : 'none'
                      }}
                    >
                      Q{idx + 1}
                    </button>
                  );
                })}
              </div>

              {!submitted && (
                <button
                  type="button"
                  onClick={() =>
                    setMarkedReview((prev) => ({
                      ...prev,
                      [currentQuestion.id]: !prev[currentQuestion.id]
                    }))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium border cursor-pointer"
                  style={{
                    backgroundColor: markedReview[currentQuestion.id]
                      ? 'var(--color-warn-soft)'
                      : 'var(--color-surface)',
                    borderColor: markedReview[currentQuestion.id]
                      ? 'var(--color-warn)'
                      : 'var(--color-border)',
                    color: markedReview[currentQuestion.id]
                      ? 'var(--color-warn)'
                      : 'var(--color-text-muted)'
                  }}
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  <span>{markedReview[currentQuestion.id] ? 'Marked' : 'Review'}</span>
                </button>
              )}
            </div>

            {/* Active Question Card */}
            <div className="rc-card p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-soft)' }}>
                  Question {currentIdx + 1} of {test.questions.length}
                </span>
                {submitted && (
                  <span
                    className="px-2.5 py-0.5 rounded-full font-semibold"
                    style={{
                      backgroundColor: 'var(--color-surface-2)',
                      color: 'var(--color-accent)'
                    }}
                  >
                    {currentQuestion.type}
                  </span>
                )}
              </div>

              <p className="font-semibold text-base leading-relaxed" style={{ color: 'var(--color-ink)' }}>
                {currentQuestion.stem}
              </p>

              {/* Options List */}
              <div className="space-y-3">
                {currentQuestion.options.map((opt) => {
                  const elimKey = `${currentQuestion.id}_${opt.letter}`;
                  const isEliminated = !!eliminated[elimKey];
                  const userPick = answers[currentQuestion.id];
                  const isSelected = userPick === opt.letter;
                  const isCorrect = opt.letter === currentQuestion.correctLetter;

                  let borderCol = 'var(--color-border-strong)';
                  let bgCol = 'var(--color-bg)';

                  if (submitted) {
                    if (isCorrect) {
                      borderCol = 'var(--color-correct)';
                      bgCol = 'var(--color-correct-soft)';
                    } else if (isSelected && !isCorrect) {
                      borderCol = 'var(--color-wrong)';
                      bgCol = 'var(--color-wrong-soft)';
                    }
                  } else if (isSelected) {
                    borderCol = 'var(--color-primary)';
                    bgCol = 'var(--color-primary-soft)';
                  }

                  return (
                    <div
                      key={opt.letter}
                      className="rounded-2xl border transition-all overflow-hidden"
                      style={{ borderColor: borderCol, backgroundColor: bgCol }}
                    >
                      <div className="flex items-stretch">
                        <button
                          type="button"
                          disabled={submitted}
                          onClick={() => {
                            if (isEliminated) {
                              setEliminated((prev) => ({ ...prev, [elimKey]: false }));
                            }
                            setAnswers((prev) => ({
                              ...prev,
                              [currentQuestion.id]: prev[currentQuestion.id] === opt.letter ? null : opt.letter
                            }));
                          }}
                          className={`flex-1 p-3.5 text-left flex items-start gap-3 ${submitted ? 'cursor-default' : 'cursor-pointer'
                            }`}
                        >
                          <span
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                            style={{
                              backgroundColor: isSelected
                                ? 'var(--color-primary)'
                                : 'var(--color-surface)',
                              color: isSelected ? '#fffcf6' : 'var(--color-ink)'
                            }}
                          >
                            {opt.letter}
                          </span>
                          <span
                            className={`text-sm leading-relaxed ${isEliminated && !submitted ? 'line-through opacity-45' : ''
                              }`}
                            style={{ color: 'var(--color-text)' }}
                          >
                            {opt.text}
                          </span>
                        </button>

                        {/* Option Eliminate / Strike-Through Toggle during Exam */}
                        {!submitted && (
                          <button
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setAnswers((prev) => ({ ...prev, [currentQuestion.id]: null }));
                              }
                              setEliminated((prev) => ({ ...prev, [elimKey]: !prev[elimKey] }));
                            }}
                            title={isEliminated ? 'Restore option' : 'Eliminate distractor (strike-through)'}
                            className="px-3 border-l flex items-center justify-center cursor-pointer hover:opacity-80"
                            style={{
                              borderColor: 'var(--color-border)',
                              color: isEliminated ? 'var(--color-wrong)' : 'var(--color-text-soft)'
                            }}
                          >
                            <Slash className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* PracticeRC Signature Per-Option Explanation after Submit */}
                      {submitted && (
                        <div
                          className="px-4 py-3 border-t text-xs leading-relaxed"
                          style={{
                            borderColor: 'var(--color-border)',
                            backgroundColor: 'var(--color-surface)'
                          }}
                        >
                          <div className="flex items-center gap-1.5 font-bold mb-1">
                            {isCorrect ? (
                              <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-correct)' }}>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                {opt.letter} — correct {opt.flawTag ? `(${opt.flawTag})` : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1" style={{ color: 'var(--color-wrong)' }}>
                                <XCircle className="w-3.5 h-3.5" />
                                {opt.letter} — wrong {opt.flawTag ? `[${opt.flawTag}]` : ''}
                              </span>
                            )}
                            {isSelected && (
                              <span
                                className="ml-auto px-2 py-0.5 rounded text-[10px]"
                                style={{
                                  backgroundColor: 'var(--color-surface-2)',
                                  color: 'var(--color-ink)'
                                }}
                              >
                                Your choice
                              </span>
                            )}
                          </div>
                          <p style={{ color: 'var(--color-text-muted)' }}>{opt.explanation}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Bottom Question Navigation Footer */}
          <div className="pt-5 mt-5 border-t flex items-center justify-between gap-2" style={{ borderColor: 'var(--color-border)' }}>
            <button
              type="button"
              disabled={currentIdx === 0}
              onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              className="inline-flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-semibold rc-btn-secondary disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            {!submitted && answers[currentQuestion.id] && (
              <button
                type="button"
                onClick={() => setAnswers((prev) => ({ ...prev, [currentQuestion.id]: null }))}
                className="text-xs font-medium hover:underline cursor-pointer"
                style={{ color: 'var(--color-text-soft)' }}
              >
                Clear choice
              </button>
            )}

            {currentIdx < test.questions.length - 1 ? (
              <button
                type="button"
                onClick={() => setCurrentIdx((i) => Math.min(test.questions.length - 1, i + 1))}
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold rc-btn-primary cursor-pointer"
              >
                <span>Next Question</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : !submitted ? (
              <button
                type="button"
                onClick={handleSubmitTest}
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold rc-btn-primary cursor-pointer"
              >
                <span>Finish &amp; Score Set</span>
              </button>
            ) : (
              <Link
                to="/library"
                className="inline-flex items-center gap-1 px-4 py-2 rounded-xl text-xs font-semibold rc-btn-primary"
              >
                <span>Next Passage</span>
                <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* Fallback Diagnostics & AI Retry Modal */}
      {fallbackModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto"
            onClick={() => setFallbackModalOpen(false)}
            style={{ minHeight: '100vh', width: '100vw' }}
          >
            <div
              className="w-full max-w-lg rounded-2xl border p-6 shadow-2xl space-y-5 my-auto"
              style={{
                backgroundColor: 'var(--color-surface)',
                borderColor: 'var(--color-border-strong)',
                color: 'var(--color-ink)'
              }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="fallback-modal-title"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center"
                    style={{
                      backgroundColor: test?.generation_source === 'fallback' ? 'var(--color-warn-soft)' : 'var(--color-correct-soft)',
                      color: test?.generation_source === 'fallback' ? 'var(--color-warn)' : 'var(--color-correct)'
                    }}
                  >
                    {test?.generation_source === 'fallback' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 id="fallback-modal-title" className="font-display text-base font-bold">
                      {test?.generation_source === 'fallback' ? 'Fallback Generation Diagnostics' : 'Generation Diagnostics & Details'}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      Telemetry details &amp; quality notes
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setFallbackModalOpen(false)}
                  className="p-1.5 rounded-lg hover:opacity-75 cursor-pointer"
                  style={{ color: 'var(--color-text-soft)' }}
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Plain Reason Summary */}
              <div
                className="p-3.5 rounded-xl border text-xs leading-relaxed space-y-1"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <span
                  className="font-semibold block uppercase tracking-wider text-[10px]"
                  style={{ color: test?.generation_source === 'fallback' ? 'var(--color-warn)' : 'var(--color-correct)' }}
                >
                  {test?.generation_source === 'fallback' ? 'Reason Summary' : 'Verification Summary'}
                </span>
                <p className="text-sm font-medium" style={{ color: 'var(--color-ink)' }}>
                  {test?.generation_source === 'fallback' ? plainReason : computeVerificationSentence(test)}
                </p>
              </div>

              {/* Diagnostics Grid */}
              <div
                className="p-3.5 rounded-xl border text-xs space-y-2 font-mono"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)'
                }}
              >
                <div className="flex justify-between py-0.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Model</span>
                  <span className="font-semibold">{test?.generation_diagnostics?.modelUsed || 'gemini-3.5-flash-lite'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>HTTP Status</span>
                  <span>{test?.generation_diagnostics?.httpStatus ?? 'N/A'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>finishReason</span>
                  <span>{test?.generation_diagnostics?.finishReason ?? 'N/A'}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Token Usage</span>
                  <span>
                    {test?.generation_diagnostics?.tokenUsage
                      ? `Prompt: ${test.generation_diagnostics.tokenUsage.promptTokens ?? 0} | Cand: ${test.generation_diagnostics.tokenUsage.candidatesTokens ?? 0} | Total: ${test.generation_diagnostics.tokenUsage.totalTokens ?? 0}`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between py-0.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Questions Returned</span>
                  <span>{test?.generation_diagnostics?.questionsReturned ?? 0}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Questions Verified</span>
                  <span>{test?.generation_diagnostics?.questionsPassed ?? 0}</span>
                </div>
                <div className="flex justify-between py-0.5 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-muted)' }}>Reviewer</span>
                  <span className="font-semibold">
                    {test?.generation_diagnostics?.reviewerUsed === 'groq'
                      ? `Groq (${test?.generation_diagnostics?.groqModelUsed || 'Auto'})`
                      : test?.generation_diagnostics?.reviewerUsed === 'gemini'
                        ? test?.generation_diagnostics?.groqUnavailable
                          ? 'Gemini (Groq fallback)'
                          : 'Gemini'
                        : 'None'}
                  </span>
                </div>
                {test?.generation_diagnostics?.groqFailureMessage && (
                  <div className="flex justify-between py-0.5 border-b text-amber-500" style={{ borderColor: 'var(--color-border)' }}>
                    <span>Groq Status</span>
                    <span className="text-right text-[11px] max-w-[260px] truncate" title={test.generation_diagnostics.groqFailureMessage}>
                      {test.generation_diagnostics.groqFailureMessage}
                    </span>
                  </div>
                )}
                {test?.generation_diagnostics?.flags && test.generation_diagnostics.flags.length > 0 && (
                  <div className="pt-2 border-t space-y-1.5" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="text-[11px] font-semibold text-amber-500 block">Quality notes:</span>
                    <ul className="list-disc pl-4 space-y-1 text-[11px]" style={{ color: 'var(--color-text-soft)' }}>
                      {(test.generation_diagnostics.flags as string[])
                        .map((f: string) => formatQualityNote(f))
                        .filter((note: string | null): note is string => Boolean(note))
                        .map((note: string, nIdx: number) => (
                          <li key={nIdx}>{note}</li>
                        ))}
                    </ul>
                  </div>
                )}
                {test?.generation_diagnostics?.rejectionReasons && test.generation_diagnostics.rejectionReasons.length > 0 && (
                  <div className="pt-2 border-t space-y-1" style={{ borderColor: 'var(--color-border)' }}>
                    <span className="text-[11px] font-semibold text-red-500 block">Rejection Details:</span>
                    <ul className="list-disc pl-4 space-y-0.5 text-[11px]" style={{ color: 'var(--color-text-soft)' }}>
                      {test.generation_diagnostics.rejectionReasons.map((r: string, rIdx: number) => {
                        const sanitized = !submitted
                          ? r.replace(/\b(Main Idea|Inference|Paragraph Function|Tone & Attitude|Strengthen \/ Weaken|Detail & Logic|Vocabulary in Context)\b/gi, 'Question')
                          : r;
                        return <li key={rIdx}>{sanitized}</li>;
                      })}
                    </ul>
                  </div>
                )}
              </div>

              {/* Retry Error Alert */}
              {regenError && (
                <div
                  className="p-3 rounded-xl border text-xs leading-relaxed space-y-1"
                  style={{
                    backgroundColor: 'var(--color-wrong-soft)',
                    borderColor: 'var(--color-wrong)',
                    color: 'var(--color-wrong)'
                  }}
                >
                  <span className="font-bold flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Retry Unsuccessful:
                  </span>
                  <p>{regenError}</p>
                  <p className="text-[11px] opacity-80">Existing questions remain active and unchanged.</p>
                </div>
              )}

              {/* AI Retry Call to Action */}
              {test?.generation_source === 'fallback' && (
                <div
                  className="p-3.5 rounded-xl border space-y-1.5 text-xs"
                  style={{ backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
                >
                  <p className="font-semibold text-sm" style={{ color: 'var(--color-ink)' }}>
                    Do you want to regenerate questions with Gemini AI?
                  </p>
                  <p style={{ color: 'var(--color-text-muted)' }}>
                    {hasGeminiKey
                      ? 'Retries question synthesis using your configured Gemini key. If unsuccessful, your existing questions will be preserved.'
                      : 'Add your free Google Gemini API key in Profile to enable AI synthesis.'}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer hover:opacity-80 transition-opacity"
                  style={{
                    backgroundColor: 'transparent',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-text-muted)'
                  }}
                >
                  {copyFeedback ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copyFeedback ? 'Copied!' : 'Copy Details'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFallbackModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer hover:opacity-80 transition-colors"
                    style={{
                      backgroundColor: 'transparent',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-muted)'
                    }}
                  >
                    {test?.generation_source === 'fallback' ? 'Keep Current Questions' : 'Close'}
                  </button>

                  {test?.generation_source === 'fallback' && hasGeminiKey && (
                    <button
                      type="button"
                      onClick={handleRegenerateWithAi}
                      disabled={regenerating}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold rc-btn-primary cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
                      <span>{regenerating ? 'Generating...' : 'Regenerate with AI'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
