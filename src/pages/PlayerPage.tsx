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
  Sparkles
} from 'lucide-react';
import type { RCTest } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';

interface HighlightSpan {
  paraIdx: number;
  text: string;
  thread: 1 | 2;
}

export default function PlayerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, displayName, guestId } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [test, setTest] = useState<RCTest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  const [rankInfo, setRankInfo] = useState<{ rank: number; totalPeers: number } | null>(null);

  useEffect(() => {
    const loadTest = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tests?id=${id}`);
        if (!res.ok) throw new Error('Passage test not found.');
        const data: RCTest = await res.json();
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
    };
    loadTest();
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
    if (!test) return null;
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

  const handleSubmitTest = async () => {
    if (!test || !resultMetrics || submitted || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_id: test.id,
          user_id: user?.id || guestId,
          user_name: displayName,
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
          type_breakdown: resultMetrics.typeBreakdown
        })
      });
      if (res.ok) {
        const data = await res.json();
        setRankInfo({ rank: data.rank, totalPeers: data.totalPeers });
      }
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
    setRankInfo(null);
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

  const currentQuestion = test.questions[currentIdx] || test.questions[0];
  const answeredCount = Object.values(answers).filter(Boolean).length;
  const overTarget = elapsedSeconds > (test.target_seconds || 480);

  const fontSizePx =
    fontScale === 'sm' ? '16.5px' : fontScale === 'lg' ? '23px' : '19.5px';

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
              {test.generation_source === 'ai' && (
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 flex items-center gap-1 border"
                  style={{
                    backgroundColor: 'var(--color-correct-soft)',
                    color: 'var(--color-correct)',
                    borderColor: 'var(--color-correct)'
                  }}
                  title="Generated with Gemini AI and passage-verified evidence"
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  <span>AI Generated</span>
                </span>
              )}
              {test.generation_source === 'fallback' && (
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 flex items-center gap-1 border"
                  style={{
                    backgroundColor: 'var(--color-warn-soft)',
                    color: 'var(--color-warn)',
                    borderColor: 'var(--color-warn)'
                  }}
                  title={`Generated via curated heuristic rules (Reason: ${test.generation_reason || 'fallback'})`}
                >
                  <span>Curated Fallback</span>
                </span>
              )}
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
          className={`lg:col-span-7 overflow-y-auto exam-scroll p-5 sm:p-8 lg:border-r ${
            mobilePane === 'questions' ? 'hidden lg:block' : 'block'
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
              {test.generation_source && (
                <>
                  <span>·</span>
                  <span
                    className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      backgroundColor:
                        test.generation_source === 'ai' ? 'var(--color-correct-soft)' : 'var(--color-warn-soft)',
                      color:
                        test.generation_source === 'ai' ? 'var(--color-correct)' : 'var(--color-warn)'
                    }}
                  >
                    {test.generation_source === 'ai' ? 'AI Generated' : `Fallback (${test.generation_reason || 'curated'})`}
                  </span>
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
          className={`lg:col-span-5 overflow-y-auto exam-scroll p-5 sm:p-7 flex flex-col justify-between ${
            mobilePane === 'passage' ? 'hidden lg:flex' : 'flex'
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

                  {rankInfo && (
                    <div
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                      style={{
                        backgroundColor: 'var(--color-accent-soft)',
                        color: 'var(--color-accent)'
                      }}
                    >
                      <Award className="w-4 h-4" />
                      <span>
                        Rank #{rankInfo.rank} of {rankInfo.totalPeers}
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
                <span
                  className="px-2.5 py-0.5 rounded-full font-semibold"
                  style={{
                    backgroundColor: 'var(--color-surface-2)',
                    color: 'var(--color-accent)'
                  }}
                >
                  {currentQuestion.type}
                </span>
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
                          className={`flex-1 p-3.5 text-left flex items-start gap-3 ${
                            submitted ? 'cursor-default' : 'cursor-pointer'
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
                            className={`text-sm leading-relaxed ${
                              isEliminated && !submitted ? 'line-through opacity-45' : ''
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
    </div>
  );
}
