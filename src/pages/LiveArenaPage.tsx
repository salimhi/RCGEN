import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Trophy, Clock, ArrowRight, Medal, Calendar } from 'lucide-react';
import type { RCTest } from '../types';

interface LeaderboardEntry {
  id: number;
  user_id: string;
  user_name: string;
  score: number;
  max_score: number;
  correct_count: number;
  wrong_count: number;
  total_questions: number;
  time_seconds: number;
  created_at: string;
}

export default function LiveArenaPage() {
  const [activeTest, setActiveTest] = useState<RCTest | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [archiveTests, setArchiveTests] = useState<RCTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const fetchLive = async () => {
      try {
        const res = await fetch('/api/live');
        if (res.ok) {
          const data = await res.json();
          setActiveTest(data.activeTest || null);
          setLeaderboard(data.leaderboard || []);
          setArchiveTests(data.archiveTests || []);
        }
      } catch (err) {
        console.error('Live arena error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchLive();
  }, []);

  // Countdown to next UTC midnight reset
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
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

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
        Loading Daily Live RC Arena…
      </div>
    );
  }

  const topThree = leaderboard.slice(0, 3);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16 space-y-10">
      {/* Live Challenge Hero */}
      {activeTest && (
        <section className="rc-card-elevated p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <span
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
              style={{
                backgroundColor: 'var(--color-correct-soft)',
                color: 'var(--color-correct)'
              }}
            >
              <Flame className="w-3.5 h-3.5" />
              LIVE ARENA OPEN · CAT MARKING (+3 / −1)
            </span>

            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-ink)'
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
            Everyone takes the exact same unseen passage today. Ranked first by net CAT score (+3 correct, −1 wrong, 0 unattempted), with ties broken by completion speed.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-5 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <div className="flex flex-wrap items-center gap-3 text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
              <span className="px-2.5 py-1 rounded-lg rc-surface-2">{activeTest.topic}</span>
              <span className="px-2.5 py-1 rounded-lg rc-surface-2">{activeTest.word_count} words</span>
              <span className="px-2.5 py-1 rounded-lg rc-surface-2">{activeTest.questions.length} Questions</span>
              <span className="px-2.5 py-1 rounded-lg rc-surface-2">{leaderboard.length} Aspirants Ranked</span>
            </div>

            <Link
              to={`/test/${activeTest.id}`}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold rc-btn-primary"
            >
              <span>Attempt Today&apos;s Live RC</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </section>
      )}

      {/* Podium + Leaderboard */}
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5" style={{ color: 'var(--color-gold)' }} />
            <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--color-ink)' }}>
              Today&apos;s Global Leaderboard
            </h2>
          </div>
          <span className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
            Updates immediately on submission
          </span>
        </div>

        {/* Top 3 Podium Cards */}
        {topThree.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {topThree.map((entry, idx) => {
              const medalColors = ['var(--color-gold)', 'var(--color-accent)', 'var(--color-primary)'];
              return (
                <div key={entry.id} className="rc-card p-5 relative overflow-hidden">
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full"
                      style={{
                        backgroundColor: 'var(--color-surface-2)',
                        color: medalColors[idx]
                      }}
                    >
                      <Medal className="w-3.5 h-3.5" />
                      Rank #{idx + 1}
                    </span>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-soft)' }}>
                      {formatDuration(entry.time_seconds)}
                    </span>
                  </div>
                  <p className="font-semibold text-base truncate mb-1" style={{ color: 'var(--color-ink)' }}>
                    {entry.user_name}
                  </p>
                  <div className="flex items-baseline gap-1.5">
                    <span className="font-display text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>
                      {entry.score}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
                      / {entry.max_score} ({entry.correct_count}C · {entry.wrong_count}W)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Full Standings Table */}
        <div className="rc-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase tracking-wider" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-soft)' }}>
                  <th className="py-3.5 px-4">Rank</th>
                  <th className="py-3.5 px-4">Aspirant</th>
                  <th className="py-3.5 px-4">Net Score</th>
                  <th className="py-3.5 px-4">Breakdown</th>
                  <th className="py-3.5 px-4 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {leaderboard.map((row, index) => (
                  <tr key={row.id} className="hover:opacity-90">
                    <td className="py-3 px-4 font-mono font-bold text-xs" style={{ color: index < 3 ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
                      #{index + 1}
                    </td>
                    <td className="py-3 px-4 font-medium" style={{ color: 'var(--color-ink)' }}>
                      {row.user_name}
                    </td>
                    <td className="py-3 px-4 font-bold" style={{ color: 'var(--color-ink)' }}>
                      {row.score} <span className="text-xs font-normal" style={{ color: 'var(--color-text-soft)' }}>/ {row.max_score}</span>
                    </td>
                    <td className="py-3 px-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {row.correct_count} right · {row.wrong_count} wrong
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
                      {formatDuration(row.time_seconds)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Past Daily RC Archive */}
      {archiveTests.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
            <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--color-ink)' }}>
              Past Daily RC Archive
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {archiveTests.map((t) => (
              <div key={t.id} className="rc-card p-5 flex items-center justify-between gap-4">
                <div>
                  <span className="text-[11px] font-bold uppercase" style={{ color: 'var(--color-text-soft)' }}>
                    {t.source_label} · {t.topic}
                  </span>
                  <h3 className="font-display text-lg font-semibold mt-0.5" style={{ color: 'var(--color-ink)' }}>
                    {t.title}
                  </h3>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {t.word_count} words · {t.questions.length} CAT questions
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
