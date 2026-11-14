import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Clock, Target, TrendingUp, ArrowRight, UserCheck } from 'lucide-react';
import type { RCAttempt } from '../types';
import { useAuth } from '../contexts/AuthContext';

export default function ReportsPage() {
  const { user, displayName, guestId } = useAuth();
  const [attempts, setAttempts] = useState<RCAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReports = async () => {
      setLoading(true);
      try {
        const uid = user?.id || guestId;
        const res = await fetch(`/api/attempts?user_id=${encodeURIComponent(uid)}`);
        if (res.ok) {
          const data: RCAttempt[] = await res.json();
          setAttempts(data);
        }
      } catch (err) {
        console.error('Reports fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    loadReports();
  }, [user?.id, guestId]);

  const analytics = useMemo(() => {
    if (attempts.length === 0) return null;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalSecs = 0;
    let totalWpm = 0;
    let totalScorePct = 0;

    const typeMap = new Map<string, { correct: number; total: number }>();

    for (const a of attempts) {
      totalCorrect += a.correct_count;
      totalWrong += a.wrong_count;
      totalSecs += a.time_seconds;
      totalWpm += a.wpm_estimate || 230;
      totalScorePct += a.max_score > 0 ? Math.max(0, a.score / a.max_score) : 0;

      if (Array.isArray(a.type_breakdown)) {
        for (const tb of a.type_breakdown) {
          const cur = typeMap.get(tb.type) || { correct: 0, total: 0 };
          cur.correct += tb.correct;
          cur.total += tb.total;
          typeMap.set(tb.type, cur);
        }
      }
    }

    const totalAttemptedQs = totalCorrect + totalWrong;
    const accuracy = totalAttemptedQs > 0 ? Math.round((totalCorrect / totalAttemptedQs) * 100) : 0;
    const avgSecs = Math.round(totalSecs / attempts.length);
    const avgWpm = Math.round(totalWpm / attempts.length);
    const avgCatEquiv = Math.round((totalScorePct / attempts.length) * 12 * 10) / 10;

    const byQuestionType = Array.from(typeMap.entries())
      .map(([type, counts]) => ({
        type,
        correct: counts.correct,
        total: counts.total,
        pct: counts.total > 0 ? Math.round((counts.correct / counts.total) * 100) : 0
      }))
      .sort((a, b) => a.pct - b.pct);

    return {
      setsCount: attempts.length,
      accuracy,
      avgSecs,
      avgWpm,
      avgCatEquiv,
      byQuestionType,
      weakestType: byQuestionType[0] || null
    };
  }, [attempts]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${String(s).padStart(2, '0')}s`;
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span
            className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-2.5"
            style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}
          >
            Diagnostic Analytics
          </span>
          <h1 className="font-display text-3xl sm:text-4xl font-semibold" style={{ color: 'var(--color-ink)' }}>
            {displayName}&apos;s VARC Report Card
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
            Track net score trajectory, reading pace, and accuracy across RC question archetypes.
          </p>
        </div>

        {!user && (
          <Link
            to="/login"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold rc-btn-secondary self-start"
          >
            <UserCheck className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
            <span>Sign in to sync across devices</span>
          </Link>
        )}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Compiling your attempt diagnostics…
        </div>
      ) : !analytics ? (
        <div className="rc-card-elevated p-12 text-center space-y-4">
          <BarChart3 className="w-10 h-10 mx-auto" style={{ color: 'var(--color-primary)' }} />
          <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--color-ink)' }}>
            No completed RC sets yet
          </h2>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--color-text-muted)' }}>
            Take a sample passage from the Library, enter today&apos;s Live Arena, or paste an article to unlock question-type accuracy diagnostics.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Link to="/" className="px-5 py-2.5 rounded-xl text-sm font-semibold rc-btn-primary">
              Generate RC Test
            </Link>
            <Link to="/library" className="px-5 py-2.5 rounded-xl text-sm font-semibold rc-btn-secondary">
              Browse Library
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rc-card p-5">
              <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--color-text-soft)' }}>
                <span>Sets Completed</span>
                <BarChart3 className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
              </div>
              <div className="font-display text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
                {analytics.setsCount}
              </div>
            </div>

            <div className="rc-card p-5">
              <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--color-text-soft)' }}>
                <span>Overall Accuracy</span>
                <Target className="w-4 h-4" style={{ color: 'var(--color-correct)' }} />
              </div>
              <div className="font-display text-3xl font-bold" style={{ color: 'var(--color-correct)' }}>
                {analytics.accuracy}%
              </div>
            </div>

            <div className="rc-card p-5">
              <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--color-text-soft)' }}>
                <span>Avg Net Score (CAT /12)</span>
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--color-accent)' }} />
              </div>
              <div className="font-display text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
                {analytics.avgCatEquiv}
              </div>
            </div>

            <div className="rc-card p-5">
              <div className="flex items-center justify-between text-xs mb-2" style={{ color: 'var(--color-text-soft)' }}>
                <span>Avg Pace / Set</span>
                <Clock className="w-4 h-4" style={{ color: 'var(--color-warn)' }} />
              </div>
              <div className="font-display text-3xl font-bold" style={{ color: 'var(--color-ink)' }}>
                {formatDuration(analytics.avgSecs)}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-soft)' }}>
                ~{analytics.avgWpm} WPM reading speed
              </div>
            </div>
          </div>

          {/* Accuracy by Question Type */}
          {analytics.byQuestionType.length > 0 && (
            <section className="rc-card p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="font-display text-xl font-semibold" style={{ color: 'var(--color-ink)' }}>
                    Accuracy by RC Question Archetype
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Sorted weakest-first so you know where distractors cost you marks.
                  </p>
                </div>
                {analytics.weakestType && (
                  <Link
                    to="/?exam=CAT"
                    className="text-xs font-semibold px-3 py-1.5 rounded-full"
                    style={{
                      backgroundColor: 'var(--color-warn-soft)',
                      color: 'var(--color-warn)'
                    }}
                  >
                    Focus Area: {analytics.weakestType.type} ({analytics.weakestType.pct}%)
                  </Link>
                )}
              </div>

              <div className="space-y-3.5">
                {analytics.byQuestionType.map((item) => (
                  <div key={item.type}>
                    <div className="flex justify-between text-xs font-semibold mb-1">
                      <span style={{ color: 'var(--color-ink)' }}>{item.type}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>
                        {item.correct}/{item.total} correct ({item.pct}%)
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--color-surface-2)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(4, item.pct)}%`,
                          backgroundColor:
                            item.pct >= 75
                              ? 'var(--color-correct)'
                              : item.pct >= 50
                              ? 'var(--color-warn)'
                              : 'var(--color-wrong)'
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Recent Attempts Table */}
          <section className="rc-card overflow-hidden">
            <div className="p-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="font-display text-xl font-semibold" style={{ color: 'var(--color-ink)' }}>
                Attempt History
              </h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase tracking-wider" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-soft)' }}>
                    <th className="py-3 px-4">Passage</th>
                    <th className="py-3 px-4">Exam</th>
                    <th className="py-3 px-4">Score</th>
                    <th className="py-3 px-4">Accuracy</th>
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {attempts.map((att) => {
                    const attempted = att.correct_count + att.wrong_count;
                    const acc = attempted > 0 ? Math.round((att.correct_count / attempted) * 100) : 0;
                    return (
                      <tr key={att.id}>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold" style={{ color: 'var(--color-ink)' }}>
                            {att.rc_tests?.title || `RC Test #${att.test_id}`}
                          </div>
                          <div className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
                            {att.rc_tests?.topic || 'Reading Comprehension'}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                          {att.exam_type}
                        </td>
                        <td className="py-3.5 px-4 font-bold" style={{ color: 'var(--color-primary)' }}>
                          {att.score} / {att.max_score}
                        </td>
                        <td className="py-3.5 px-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {acc}% ({att.correct_count}C · {att.wrong_count}W)
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDuration(att.time_seconds)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <Link
                            to={`/test/${att.test_id}`}
                            className="inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                            style={{ color: 'var(--color-primary)' }}
                          >
                            <span>Re-open</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
