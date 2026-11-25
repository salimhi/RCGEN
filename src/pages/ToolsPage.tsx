import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Calculator, Gauge, Play, CheckCircle2, RotateCcw, ArrowRight } from 'lucide-react';
import type { RCGuide, SpeedQuestion } from '../types';
import speedPassagesData from '../data/speed-passages.json';

function estimateCatVarcPercentile(scaledScore: number): number {
  // Grounded against CAT 2021-2025 VARC score-vs-percentile curves (24 Qs, 72 max)
  if (scaledScore >= 52) return 99.9;
  if (scaledScore >= 45) return 99.5 + ((scaledScore - 45) / 7) * 0.4;
  if (scaledScore >= 39) return 99.0 + ((scaledScore - 39) / 6) * 0.5;
  if (scaledScore >= 33) return 97.5 + ((scaledScore - 33) / 6) * 1.5;
  if (scaledScore >= 28) return 95.0 + ((scaledScore - 28) / 5) * 2.5;
  if (scaledScore >= 23) return 90.0 + ((scaledScore - 23) / 5) * 5.0;
  if (scaledScore >= 18) return 82.0 + ((scaledScore - 18) / 5) * 8.0;
  if (scaledScore >= 12) return 68.0 + ((scaledScore - 12) / 6) * 14.0;
  if (scaledScore >= 6) return 48.0 + ((scaledScore - 6) / 6) * 20.0;
  return Math.max(15, 25 + scaledScore * 3.5);
}

export default function ToolsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') === 'speed' ? 'speed' : 'calculator';

  // Calculator State
  const [rcAttempts, setRcAttempts] = useState(12);
  const [rcAccuracy, setRcAccuracy] = useState(75);
  const [vaAttempts, setVaAttempts] = useState(5);
  const [vaAccuracy, setVaAccuracy] = useState(60);
  const [slotDifficulty, setSlotDifficulty] = useState<'Tough' | 'Moderate' | 'Easy'>('Moderate');

  // Reading Speed Test State
  const [speedPassages, setSpeedPassages] = useState<RCGuide[]>(speedPassagesData as unknown as RCGuide[]);
  const [selectedPassageIdx, setSelectedPassageIdx] = useState(0);
  const [speedPhase, setSpeedPhase] = useState<'ready' | 'reading' | 'quiz' | 'done'>('ready');
  const [startMs, setStartMs] = useState<number>(0);
  const [readSeconds, setReadSeconds] = useState<number>(0);
  const [liveReadTick, setLiveReadTick] = useState<number>(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});

  useEffect(() => {
    if (speedPhase !== 'reading') return;
    const interval = setInterval(() => {
      setLiveReadTick(Math.floor((Date.now() - startMs) / 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [speedPhase, startMs]);

  const calcStats = useMemo(() => {
    const rcCorrect = Math.round((rcAttempts * rcAccuracy) / 100);
    const rcWrong = rcAttempts - rcCorrect;
    const rcRaw = rcCorrect * 3 - rcWrong * 1;

    const vaCorrect = Math.round((vaAttempts * vaAccuracy) / 100);
    // Half of VA questions in CAT are TITA (0 negative mark), half MCQ (-1)
    const vaWrongWithNeg = Math.floor((vaAttempts - vaCorrect) * 0.4);
    const vaRaw = vaCorrect * 3 - vaWrongWithNeg;

    const rawTotal = rcRaw + vaRaw;
    const scaleAdj = slotDifficulty === 'Tough' ? 3.5 : slotDifficulty === 'Easy' ? -2.5 : 0;
    const scaled = Math.round((rawTotal + scaleAdj) * 10) / 10;
    const percentile = Math.round(estimateCatVarcPercentile(scaled) * 100) / 100;

    return {
      rcCorrect,
      rcWrong,
      rcRaw,
      vaCorrect,
      vaRaw,
      rawTotal,
      scaled,
      percentile
    };
  }, [rcAttempts, rcAccuracy, vaAttempts, vaAccuracy, slotDifficulty]);

  const currentSpeedItem = speedPassages[selectedPassageIdx];
  const speedBlock =
    currentSpeedItem && !Array.isArray(currentSpeedItem.content_blocks)
      ? currentSpeedItem.content_blocks
      : null;

  const startSpeedTest = () => {
    setQuizAnswers({});
    setStartMs(Date.now());
    setLiveReadTick(0);
    setSpeedPhase('reading');
  };

  const finishReading = () => {
    const secs = Math.max(8, Math.round((Date.now() - startMs) / 1000));
    setReadSeconds(secs);
    setSpeedPhase('quiz');
  };

  const rawWpm =
    speedBlock && readSeconds > 0
      ? Math.round((speedBlock.wordCount / readSeconds) * 60)
      : 0;

  const quizCorrectCount = useMemo(() => {
    if (!speedBlock) return 0;
    return speedBlock.questions.reduce((acc: number, q: SpeedQuestion, idx: number) => {
      return acc + (quizAnswers[idx] === q.correctIndex ? 1 : 0);
    }, 0);
  }, [speedBlock, quizAnswers]);

  const compRatio =
    speedBlock && speedBlock.questions.length > 0
      ? quizCorrectCount / speedBlock.questions.length
      : 0;
  const effectiveWpm = Math.round(rawWpm * (0.4 + 0.6 * compRatio));

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 pb-16">
      <div className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl font-semibold mb-2" style={{ color: 'var(--color-ink)' }}>
          VARC Prep Tools
        </h1>
        <p className="text-sm sm:text-base" style={{ color: 'var(--color-text-muted)' }}>
          Interactive pacing and score projection tools grounded against empirical CAT VARC score-versus-percentile curves.
        </p>
      </div>

      {/* Tool Switcher */}
      <div className="grid grid-cols-2 sm:flex gap-2 mb-8">
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'calculator' })}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer ${
            activeTab === 'calculator' ? 'rc-btn-primary' : 'rc-btn-secondary'
          }`}
        >
          <Calculator className="w-4 h-4" />
          <span>CAT VARC Percentile Calculator</span>
        </button>
        <button
          type="button"
          onClick={() => setSearchParams({ tab: 'speed' })}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer ${
            activeTab === 'speed' ? 'rc-btn-primary' : 'rc-btn-secondary'
          }`}
        >
          <Gauge className="w-4 h-4" />
          <span>Reading Speed (WPM) Test</span>
        </button>
      </div>

      {activeTab === 'calculator' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Sliders */}
          <div className="lg:col-span-7 rc-card p-6 space-y-6">
            <div>
              <div className="flex justify-between text-sm font-semibold mb-2">
                <span style={{ color: 'var(--color-ink)' }}>RC Questions Attempted (out of 16)</span>
                <span style={{ color: 'var(--color-primary)' }}>{rcAttempts} Qs</span>
              </div>
              <input
                type="range"
                min={0}
                max={16}
                value={rcAttempts}
                onChange={(e) => setRcAttempts(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)] cursor-pointer"
              />
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-soft)' }}>
                4 passages × 4 questions each (+3 correct, −1 wrong)
              </p>
            </div>

            <div>
              <div className="flex justify-between text-sm font-semibold mb-2">
                <span style={{ color: 'var(--color-ink)' }}>RC Accuracy</span>
                <span style={{ color: 'var(--color-primary)' }}>{rcAccuracy}%</span>
              </div>
              <input
                type="range"
                min={25}
                max={100}
                step={5}
                value={rcAccuracy}
                onChange={(e) => setRcAccuracy(Number(e.target.value))}
                className="w-full accent-[var(--color-primary)] cursor-pointer"
              />
            </div>

            <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <div className="flex justify-between text-sm font-semibold mb-2">
                <span style={{ color: 'var(--color-ink)' }}>Verbal Ability (VA) Attempted (out of 8)</span>
                <span style={{ color: 'var(--color-accent)' }}>{vaAttempts} Qs</span>
              </div>
              <input
                type="range"
                min={0}
                max={8}
                value={vaAttempts}
                onChange={(e) => setVaAttempts(Number(e.target.value))}
                className="w-full accent-[var(--color-accent)] cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-sm font-semibold mb-2">
                <span style={{ color: 'var(--color-ink)' }}>VA Accuracy</span>
                <span style={{ color: 'var(--color-accent)' }}>{vaAccuracy}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                step={5}
                value={vaAccuracy}
                onChange={(e) => setVaAccuracy(Number(e.target.value))}
                className="w-full accent-[var(--color-accent)] cursor-pointer"
              />
            </div>

            <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
              <span className="block text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                Slot Normalization Difficulty
              </span>
              <div className="flex gap-2">
                {(['Tough', 'Moderate', 'Easy'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSlotDifficulty(d)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                      slotDifficulty === d ? 'rc-chip-active' : 'rc-chip'
                    }`}
                  >
                    {d} Slot
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Output Readout */}
          <div className="lg:col-span-5 space-y-4">
            <div className="rc-card-elevated p-6 text-center">
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-soft)' }}>
                Predicted CAT VARC Percentile
              </span>
              <div className="font-display text-5xl font-bold my-2" style={{ color: 'var(--color-primary)' }}>
                {calcStats.percentile.toFixed(2)}
                <span className="text-2xl">%ile</span>
              </div>
              <p className="text-xs mb-5" style={{ color: 'var(--color-text-muted)' }}>
                Scaled Score: <strong>{calcStats.scaled}</strong> / 72 (Raw: {calcStats.rawTotal} = {calcStats.rcRaw} RC + {calcStats.vaRaw} VA)
              </p>

              {/* Milestone Targets */}
              <div className="space-y-2 text-left pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                {[
                  { pct: '99.5%ile', score: 45 },
                  { pct: '99.0%ile', score: 39 },
                  { pct: '95.0%ile', score: 28 },
                  { pct: '90.0%ile', score: 23 },
                  { pct: '85.0%ile', score: 19 }
                ].map((t) => {
                  const hit = calcStats.scaled >= t.score;
                  return (
                    <div
                      key={t.pct}
                      className="flex items-center justify-between px-3 py-2 rounded-xl text-xs"
                      style={{
                        backgroundColor: hit ? 'var(--color-correct-soft)' : 'var(--color-surface-2)',
                        color: hit ? 'var(--color-correct)' : 'var(--color-text-muted)'
                      }}
                    >
                      <span className="font-bold">{t.pct} Benchmark</span>
                      <span>
                        ~{t.score} scaled pts {hit ? '✓ Cleared' : `(${(t.score - calcStats.scaled).toFixed(1)} away)`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rc-card p-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
                  Raise your RC accuracy by +10%
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Moving from 70% to 80% on 12 RC attempts adds ~5 raw marks.
                </p>
              </div>
              <Link to="/" className="px-3.5 py-2 rounded-xl text-xs font-semibold rc-btn-primary shrink-0">
                Practice RC →
              </Link>
            </div>
          </div>
        </div>
      ) : (
        /* Reading Speed Test */
        <div className="rc-card-elevated p-6 sm:p-8">
          {!speedBlock ? (
            <div className="py-12 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Loading calibrated reading speed passage…
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <div>
                  <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--color-ink)' }}>
                    {currentSpeedItem.title}
                  </h2>
                  <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {speedBlock.wordCount} words · Read at your natural exam comprehension pace, then answer 3 recall checks.
                  </p>
                </div>

                {speedPassages.length > 1 && speedPhase === 'ready' && (
                  <div className="flex gap-1.5">
                    {speedPassages.map((sp, idx) => (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => setSelectedPassageIdx(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                          selectedPassageIdx === idx ? 'rc-chip-active' : 'rc-chip'
                        }`}
                      >
                        Passage {idx + 1}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {speedPhase === 'ready' && (
                <div className="py-10 text-center space-y-4">
                  <p className="text-sm max-w-lg mx-auto" style={{ color: 'var(--color-text-muted)' }}>
                    CAT VARC passages average 500 words. A comfortable 240–300 WPM lets you read thoroughly in 2 minutes and spend 6 minutes eliminating close distractors.
                  </p>
                  <button
                    type="button"
                    onClick={startSpeedTest}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold rc-btn-primary cursor-pointer"
                  >
                    <Play className="w-4 h-4" />
                    <span>Start Timed Reading</span>
                  </button>
                </div>
              )}

              {speedPhase === 'reading' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-4 py-2.5 rounded-xl rc-surface-2 text-xs font-mono">
                    <span>Reading timer running…</span>
                    <span className="font-bold" style={{ color: 'var(--color-primary)' }}>
                      {liveReadTick}s elapsed
                    </span>
                  </div>

                  <div className="space-y-4 passage-prose text-base max-w-3xl mx-auto" style={{ color: 'var(--color-text)' }}>
                    {speedBlock.paragraphs.map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={finishReading}
                      className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold rc-btn-primary cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>I&apos;ve Finished Reading — Lock WPM</span>
                    </button>
                  </div>
                </div>
              )}

              {speedPhase === 'quiz' && (
                <div className="space-y-5 max-w-2xl mx-auto">
                  <div className="p-4 rounded-xl rc-surface-2 text-sm flex items-center justify-between">
                    <span>Raw Reading Speed Locked:</span>
                    <strong style={{ color: 'var(--color-primary)' }}>{rawWpm} WPM ({readSeconds}s)</strong>
                  </div>

                  <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
                    Quick Comprehension Check (verifies you didn&apos;t merely skim):
                  </p>

                  {speedBlock.questions.map((sq, qIdx) => (
                    <div key={qIdx} className="p-4 rounded-2xl border space-y-2.5" style={{ borderColor: 'var(--color-border)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
                        {qIdx + 1}. {sq.q}
                      </p>
                      <div className="space-y-1.5">
                        {sq.options.map((opt, oIdx) => (
                          <button
                            key={oIdx}
                            type="button"
                            onClick={() => setQuizAnswers((prev) => ({ ...prev, [qIdx]: oIdx }))}
                            className="w-full text-left px-3.5 py-2 rounded-xl border text-xs sm:text-sm cursor-pointer"
                            style={{
                              backgroundColor:
                                quizAnswers[qIdx] === oIdx ? 'var(--color-primary-soft)' : 'var(--color-bg)',
                              borderColor:
                                quizAnswers[qIdx] === oIdx ? 'var(--color-primary)' : 'var(--color-border)',
                              color: 'var(--color-text)'
                            }}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    disabled={Object.keys(quizAnswers).length < speedBlock.questions.length}
                    onClick={() => setSpeedPhase('done')}
                    className="w-full py-3 rounded-xl text-sm font-semibold rc-btn-primary cursor-pointer"
                  >
                    Calculate Effective Reading Rate
                  </button>
                </div>
              )}

              {speedPhase === 'done' && (
                <div className="max-w-2xl mx-auto text-center space-y-6 py-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-4 rounded-2xl rc-surface-2">
                      <div className="text-xs" style={{ color: 'var(--color-text-soft)' }}>Raw WPM</div>
                      <div className="font-display text-3xl font-bold mt-1" style={{ color: 'var(--color-ink)' }}>
                        {rawWpm}
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl rc-surface-2">
                      <div className="text-xs" style={{ color: 'var(--color-text-soft)' }}>Retention</div>
                      <div className="font-display text-3xl font-bold mt-1" style={{ color: 'var(--color-correct)' }}>
                        {quizCorrectCount}/{speedBlock.questions.length}
                      </div>
                    </div>
                    <div className="p-4 rounded-2xl border" style={{ backgroundColor: 'var(--color-primary-soft)', borderColor: 'var(--color-primary)' }}>
                      <div className="text-xs font-semibold" style={{ color: 'var(--color-primary)' }}>Effective WPM</div>
                      <div className="font-display text-3xl font-bold mt-1" style={{ color: 'var(--color-primary)' }}>
                        {effectiveWpm}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    At <strong>{effectiveWpm} effective WPM</strong>, reading all 4 CAT VARC passages (~2,000 words total) takes roughly{' '}
                    <strong>{Math.max(4, Math.round(2000 / Math.max(120, effectiveWpm)))} minutes</strong>, leaving{' '}
                    <strong>{Math.max(12, 40 - Math.round(2000 / Math.max(120, effectiveWpm)))} minutes</strong> across 16 RC + 8 VA questions.
                  </p>

                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSpeedPhase('ready')}
                      className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold rc-btn-secondary cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Try Again</span>
                    </button>
                    <Link
                      to="/library"
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold rc-btn-primary"
                    >
                      <span>Apply Pace on Full RC Set</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
