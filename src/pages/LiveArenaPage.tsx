import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Clock, ArrowRight, Award, CheckCircle2, History } from 'lucide-react';
import type { RCTest, RCAttempt } from '../types';
import { getAllLibraryTests } from '../lib/testStore';
import { getAttempts } from '../lib/storage';

export default function LiveArenaPage() {
  const [countdown, setCountdown] = useState('');

  const libraryTests = useMemo(() => getAllLibraryTests(), []);

  // Deterministic daily pick based on visitor's local calendar day
  const activeTest: RCTest | null = useMemo(() => {
    if (libraryTests.length === 0) return null;
    const now = new Date();
    const localMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayNumber = Math.floor(localMidnight / (1000 * 60 * 60 * 24));
    return libraryTests[dayNumber % libraryTests.length];
  }, [libraryTests]);

  // Local user attempts for this active test
  const attempts = useMemo(() => getAttempts(), []);
  const testAttempts = useMemo(() => {
    if (!activeTest) return [];
    return attempts.filter((a) => String(a.test_id) === String(activeTest.id));
  }, [activeTest, attempts]);

  const bestAttempt = useMemo(() => {
    if (testAttempts.length === 0) return null;
    return [...testAttempts].sort((a, b) => b.score - a.score)[0];
  }, [testAttempts]);

  // Countdown to next local midnight reset
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      const diff = Math.max(0, Math.floor((tomorrow.getTime() - now.getTime()) / 1000));
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setCountdown(`${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    };
    updateClock();
    const t = setInterval(updateClock, 1000);
    return () => clearInterval(t);
  }, []);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-10">
      {/* Daily Pick Hero */}
      {activeTest ? (
        <section className="rc-card-elevated p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                backgroundColor: 'var(--color-correct-soft)',
                color: 'var(--color-correct)',
              }}
            >
              <Flame className="w-3.5 h-3.5" />
              DAILY PICK RC · {activeTest.exam_type}
            </span>

            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-ink)',
              }}
            >
              <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-primary)' }} />
              <span>Resets in {countdown}</span>
            </div>
          </div>

          <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-2" style={{ color: 'var(--color-ink)' }}>
            {activeTest.title}
          </h1>
          <p className="text-sm sm:text-base mb-6 max-w-2xl" style={{ color: 'var(--color-text-muted)' }}>
            Today's featured reading comprehension set. Test your active argument mapping, evaluate subtle distractors,
            and review per-option explanations.
          </p>

          <div
            className="flex flex-wrap items-center justify-between gap-4 pt-5 border-t"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="flex flex-wrap items-center gap-3 text-xs font-medium"
              style={{ color: 'var(--color-text-muted)' }}
            >
              <span className="px-2.5 py-1 rounded-lg rc-surface-2">{activeTest.topic}</span>
              <span className="px-2.5 py-1 rounded-lg rc-surface-2">{activeTest.word_count} words</span>
              <span className="px-2.5 py-1 rounded-lg rc-surface-2">{activeTest.questions.length} Questions</span>
              {bestAttempt && (
                <span
                  className="px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1"
                  style={{
                    backgroundColor: 'var(--color-correct-soft)',
                    color: 'var(--color-correct)',
                  }}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Your Best: {bestAttempt.score}/{bestAttempt.max_score}
                </span>
              )}
            </div>

            <Link
              to={`/test/${activeTest.id}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold rc-btn-primary"
            >
              <span>{bestAttempt ? 'Retake Today’s Pick' : 'Attempt Today’s Pick'}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      ) : (
        <div className="rc-card p-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          No featured tests available in the library yet.
        </div>
      )}

      {/* Local Attempt History for Today's Pick */}
      {testAttempts.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5" style={{ color: 'var(--color-primary)' }} />
            <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--color-ink)' }}>
              Your Attempts on This Set
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {testAttempts.map((entry, idx) => (
              <div key={entry.id} className="rc-card p-5 relative overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: 'var(--color-surface-2)',
                      color: idx === 0 ? 'var(--color-primary)' : 'var(--color-text-muted)',
                    }}
                  >
                    <Award className="w-3.5 h-3.5" />
                    Attempt #{testAttempts.length - idx}
                  </span>
                  <span className="text-xs font-mono" style={{ color: 'var(--color-text-soft)' }}>
                    {formatDuration(entry.time_seconds)}
                  </span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                    {entry.score}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
                    / {entry.max_score} ({entry.correct_count}C · {entry.wrong_count}W)
                  </span>
                </div>
                <div className="text-[11px] mt-2 text-right" style={{ color: 'var(--color-text-soft)' }}>
                  {new Date(entry.created_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Library Archive */}
      {libraryTests.length > 1 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--color-ink)' }}>
              More Curated Practice Sets
            </h2>
            <Link to="/library" className="text-xs font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
              View all in Library →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {libraryTests
              .filter((t) => !activeTest || String(t.id) !== String(activeTest.id))
              .map((t) => (
                <div key={t.id} className="rc-card p-5 flex items-center justify-between gap-4">
                  <div>
                    <span className="text-[11px] font-bold uppercase" style={{ color: 'var(--color-text-soft)' }}>
                      {t.source_label} · {t.topic}
                    </span>
                    <h3 className="font-display text-lg font-semibold mt-0.5" style={{ color: 'var(--color-ink)' }}>
                      {t.title}
                    </h3>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                      {t.word_count} words · {t.questions.length} questions
                    </p>
                  </div>
                  <Link
                    to={`/test/${t.id}`}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold rc-btn-secondary shrink-0"
                  >
                    Practice →
                  </Link>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
