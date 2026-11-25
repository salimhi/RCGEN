import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookMarked, CheckCircle2, Clock } from 'lucide-react';
import { getAllPyqEntries, getAuthoredPyqCount, getTotalPyqCount } from '../lib/testStore';

export default function PyqPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const allEntries = useMemo(() => getAllPyqEntries(), []);
  const authoredCount = useMemo(() => getAuthoredPyqCount(), []);
  const totalCount = useMemo(() => getTotalPyqCount(), []);

  // Compute available years dynamically from pyq.json
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(allEntries.map((i) => i.year))).filter(Boolean) as number[];
    return years.sort((a, b) => b - a);
  }, [allEntries]);

  const defaultYear = availableYears[0] || 2025;
  const initialYear = Number(searchParams.get('year')) || defaultYear;
  const [selectedYear, setSelectedYear] = useState<number>(
    availableYears.includes(initialYear) ? initialYear : defaultYear
  );

  const yearItems = allEntries.filter((i) => i.year === selectedYear);

  // Compute slots dynamically for the selected year
  const availableSlots = useMemo(() => {
    const slots = Array.from(new Set(yearItems.map((i) => i.slot))).filter(Boolean) as number[];
    return slots.sort((a, b) => a - b);
  }, [yearItems]);

  const handleLaunchPyq = (item: any) => {
    const isAuthored =
      Array.isArray(item.questions) &&
      item.questions.length > 0 &&
      Array.isArray(item.passage_paragraphs) &&
      item.passage_paragraphs.length > 0;

    if (isAuthored) {
      navigate(`/test/${item.id}`);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16">
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border"
            style={{
              backgroundColor: 'var(--color-surface)',
              borderColor: 'var(--color-border)',
              color: 'var(--color-ink)',
            }}
          >
            <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
            <span>
              {authoredCount} of {totalCount} past slots indexed
            </span>
          </span>
        </div>

        <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-2" style={{ color: 'var(--color-ink)' }}>
          CAT RC PYQ Catalog ({availableYears[availableYears.length - 1] || 2021}–{availableYears[0] || 2025})
        </h1>
        <p className="text-sm sm:text-base leading-relaxed max-w-3xl" style={{ color: 'var(--color-text-muted)' }}>
          A structured catalog of CAT Reading Comprehension passage slots. Practice past slot papers under timed exam conditions.
        </p>
      </div>

      {/* Year Filter Tabs */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto no-scrollbar pb-1.5 touch-scroll">
        {availableYears.map((yr) => (
          <button
            key={yr}
            type="button"
            onClick={() => {
              setSelectedYear(yr);
              setSearchParams({ year: String(yr) });
            }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all whitespace-nowrap shrink-0 ${selectedYear === yr ? 'rc-btn-primary' : 'rc-btn-secondary'
              }`}
          >
            CAT {yr}
          </button>
        ))}
      </div>

      <div className="space-y-8">
        {availableSlots.map((slotNum) => {
          const slotPassages = yearItems
            .filter((i) => i.slot === slotNum)
            .sort((a, b) => a.passage_num - b.passage_num);

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
                  {slotPassages.length} catalog {slotPassages.length === 1 ? 'passage' : 'passages'}
                </span>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
                {slotPassages.map((p) => {
                  const isAuthored =
                    Array.isArray(p.questions) &&
                    p.questions.length > 0 &&
                    Array.isArray(p.passage_paragraphs) &&
                    p.passage_paragraphs.length > 0;

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
                            color: 'var(--color-ink)',
                          }}
                        >
                          {p.passage_num}
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-sm sm:text-base" style={{ color: 'var(--color-ink)' }}>
                              {p.title}
                            </h3>
                            {isAuthored ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                                style={{
                                  backgroundColor: 'var(--color-correct-soft)',
                                  color: 'var(--color-correct)',
                                }}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Ready
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{
                                  backgroundColor: 'var(--color-surface-2)',
                                  color: 'var(--color-text-soft)',
                                }}
                              >
                                Not added yet
                              </span>
                            )}
                          </div>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {p.topic} {p.source_work ? `· Source: ${p.source_work}` : ''} ·{' '}
                            {isAuthored ? `${p.questions.length} questions` : 'Unpopulated catalog slot'}
                          </p>
                        </div>
                      </div>

                      {isAuthored ? (
                        <button
                          type="button"
                          onClick={() => handleLaunchPyq(p)}
                          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 sm:py-2 rounded-xl text-xs font-semibold rc-btn-primary shrink-0 cursor-pointer shadow-xs"
                        >
                          <span>Practise in Player</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium border opacity-60 shrink-0 self-start sm:self-auto cursor-not-allowed"
                          style={{
                            borderColor: 'var(--color-border)',
                            color: 'var(--color-text-soft)',
                          }}
                          title="Add passage and questions in src/data/pyq.json to enable"
                        >
                          Not added yet
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

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
            Review all choices immediately after submitting to train your eye on why close distractors fail.
          </p>
        </div>
      </div>
    </div>
  );
}
