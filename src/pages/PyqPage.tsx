import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookMarked, Sparkles, CheckCircle2 } from 'lucide-react';
import type { PYQCatalogItem } from '../types';
import { useAuth } from '../contexts/AuthContext';

const YEARS = [2025, 2024, 2023, 2022, 2021];

export default function PyqPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user, guestId } = useAuth();

  const initialYear = Number(searchParams.get('year')) || 2025;
  const [selectedYear, setSelectedYear] = useState<number>(
    YEARS.includes(initialYear) ? initialYear : 2025
  );
  const [items, setItems] = useState<PYQCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [launchingId, setLaunchingId] = useState<number | null>(null);

  useEffect(() => {
    const fetchPyqs = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/pyq');
        if (res.ok) {
          const data: PYQCatalogItem[] = await res.json();
          setItems(data);
        }
      } catch (err) {
        console.error('PYQ fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPyqs();
  }, []);

  const handleLaunchPyq = async (item: PYQCatalogItem) => {
    if (item.linked_test_id) {
      navigate(`/test/${item.linked_test_id}`);
      return;
    }

    setLaunchingId(item.id);
    try {
      const res = await fetch('/api/generate-rc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pyqCatalogId: item.id,
          examType: 'CAT',
          difficulty: 'Challenging',
          userId: user?.id || guestId
        })
      });
      const created = await res.json();
      if (res.ok && created?.id) {
        navigate(`/test/${created.id}`);
      }
    } catch (err) {
      console.error('Launch PYQ error:', err);
    } finally {
      setLaunchingId(null);
    }
  };

  const yearItems = items.filter((i) => i.year === selectedYear);
  const slots = [1, 2, 3];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16">
      <div className="mb-8">
        <span
          className="inline-block text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full mb-3"
          style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}
        >
          CAT VARC · Reading Comprehension · Previous Year Questions
        </span>
        <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-3" style={{ color: 'var(--color-ink)' }}>
          CAT RC PYQ 2021–2025: all 60 passage sets across 15 slots
        </h1>
        <p className="text-sm sm:text-base leading-relaxed max-w-3xl" style={{ color: 'var(--color-text-muted)' }}>
          Since CAT 2021, every slot has featured 4 Reading Comprehension passages with 4 questions each (16 RC questions per slot, +3 for correct, −1 for wrong). Select any year and slot below to practise in the exam-style split-screen player.
        </p>
      </div>

      {/* Year Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-8">
        {YEARS.map((yr) => (
          <button
            key={yr}
            type="button"
            onClick={() => {
              setSelectedYear(yr);
              setSearchParams({ year: String(yr) });
            }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all ${
              selectedYear === yr ? 'rc-btn-primary' : 'rc-btn-secondary'
            }`}
          >
            CAT {yr}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Loading CAT {selectedYear} slot index…
        </div>
      ) : (
        <div className="space-y-8">
          {slots.map((slotNum) => {
            const slotPassages = yearItems.filter((i) => i.slot === slotNum);
            return (
              <section key={slotNum} className="rc-card p-5 sm:p-6">
                <div className="flex items-center justify-between pb-4 mb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center gap-2.5">
                    <BookMarked className="w-4 h-4" style={{ color: 'var(--color-primary)' }} />
                    <h2 className="font-display text-xl font-semibold" style={{ color: 'var(--color-ink)' }}>
                      CAT {selectedYear} · Slot {slotNum}
                    </h2>
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-soft)' }}>
                    4 passages · 16 questions
                  </span>
                </div>

                <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                  {slotPassages.map((p) => {
                    const isLaunching = launchingId === p.id;
                    return (
                      <div
                        key={p.id}
                        className="py-3.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
                            style={{
                              backgroundColor: 'var(--color-surface-2)',
                              color: 'var(--color-ink)'
                            }}
                          >
                            {p.passage_num}
                          </span>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-sm sm:text-base" style={{ color: 'var(--color-ink)' }}>
                                {p.title}
                              </h3>
                              {p.linked_test_id && (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                  style={{
                                    backgroundColor: 'var(--color-correct-soft)',
                                    color: 'var(--color-correct)'
                                  }}
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  Ready
                                </span>
                              )}
                            </div>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                              {p.topic} · Source domain: {p.source_work} · {p.question_count} questions
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          disabled={isLaunching}
                          onClick={() => handleLaunchPyq(p)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold rc-btn-secondary shrink-0 self-start sm:self-auto cursor-pointer"
                        >
                          {isLaunching ? (
                            <>
                              <Sparkles className="w-3.5 h-3.5 animate-spin" />
                              <span>Preparing Set…</span>
                            </>
                          ) : (
                            <>
                              <span>Practise in Player</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Marking Explainer Box */}
      <div className="mt-10 rc-card p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
        <div>
          <h3 className="font-display font-semibold text-base mb-1" style={{ color: 'var(--color-ink)' }}>
            1. Exact CAT Marking
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Every RC question carries +3 for a correct response, −1 negative marking for a wrong option, and 0 if left unattempted.
          </p>
        </div>
        <div>
          <h3 className="font-display font-semibold text-base mb-1" style={{ color: 'var(--color-ink)' }}>
            2. Eliminate Trap Options
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Use the strike-through button inside the exam player to rule out extreme quantifiers and causal reversals before committing.
          </p>
        </div>
        <div>
          <h3 className="font-display font-semibold text-base mb-1" style={{ color: 'var(--color-ink)' }}>
            3. Per-Option Debrief
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Review all four choices immediately after submitting to train your eye on why close distractors fail.
          </p>
        </div>
      </div>
    </div>
  );
}
