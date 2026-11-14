import { useState, useEffect } from 'react';
import { Sparkles, Check, Clock, X, AlertCircle, RefreshCw } from 'lucide-react';

interface GeneratingOverlayProps {
  isGenerating: boolean;
  passageText: string;
  examType: 'CAT' | 'GMAT';
  difficulty?: string;
  onCancel: () => void;
  error?: string | null;
  onRetry?: () => void;
}

const CHECKLIST_STEPS = [
  'Analyzing passage structure & tone',
  'Drafting question stems & target skills',
  'Formulating plausible distractors & traps',
  'Verifying evidence against passage text'
];

const CAT_QUESTION_TYPES = [
  'Main Idea & Primary Purpose',
  'Inference & Logical Extension',
  'Paragraph Role & Function',
  'Author’s Tone & Perspective'
];

const GMAT_QUESTION_TYPES = [
  'Main Idea & Primary Purpose',
  'Inference & Logical Extension',
  'Paragraph Role & Function',
  'Author’s Tone & Perspective',
  'Argument Evaluation (Strengthen / Weaken)'
];

export default function GeneratingOverlay({
  isGenerating,
  passageText,
  examType,
  difficulty = 'Challenging',
  onCancel,
  error = null,
  onRetry
}: GeneratingOverlayProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 1. 700ms Appearance Threshold: Don't flicker for instantaneous responses
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isGenerating) {
      timer = setTimeout(() => {
        setShouldRender(true);
      }, 700);
    } else {
      setShouldRender(false);
      setElapsedSeconds(0);
    }
    return () => clearTimeout(timer);
  }, [isGenerating]);

  // 2. Elapsed Timer counter
  useEffect(() => {
    if (!shouldRender || !isGenerating) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [shouldRender, isGenerating]);

  if (!shouldRender && !error) return null;

  const questionTypes = examType === 'GMAT' ? GMAT_QUESTION_TYPES : CAT_QUESTION_TYPES;
  const currentStep = Math.min(
    CHECKLIST_STEPS.length,
    Math.floor(elapsedSeconds / 2.5)
  );

  const previewParagraphs = passageText
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generating RC Test"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-md overflow-y-auto"
    >
      <div
        className="w-full max-w-4xl rounded-2xl border shadow-2xl overflow-hidden flex flex-col my-auto max-h-[90vh]"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border-strong)'
        }}
      >
        {/* Top Header */}
        <div
          className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}
            >
              <Sparkles className="w-4 h-4 animate-spin-slow" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold font-display" style={{ color: 'var(--color-ink)' }}>
                Building Your {examType} Reading Comprehension Test
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Calibrating {difficulty} difficulty &amp; rigorous option psychometrics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded-full border"
              style={{
                borderColor: 'var(--color-border)',
                backgroundColor: 'var(--color-bg)',
                color: 'var(--color-text-muted)'
              }}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{elapsedSeconds}s elapsed</span>
            </div>

            <button
              type="button"
              onClick={onCancel}
              className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-colors cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
              style={{
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)'
              }}
              title="Cancel generation and return to editor"
            >
              <X className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Cancel</span>
            </button>
          </div>
        </div>

        {/* Error state */}
        {error ? (
          <div className="p-8 text-center space-y-4">
            <div
              className="w-12 h-12 rounded-full mx-auto flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-wrong-soft)', color: 'var(--color-wrong)' }}
            >
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-ink)' }}>
                Generation Encountered an Error
              </h3>
              <p className="text-xs sm:text-sm mt-1 max-w-md mx-auto" style={{ color: 'var(--color-text-muted)' }}>
                {error}
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-xs font-semibold border cursor-pointer"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-ink)' }}
              >
                Close Editor
              </button>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="px-4 py-2 rounded-xl text-xs font-semibold rc-btn-primary flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Try Again</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Split Body View */
          <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[var(--color-border)]">
            {/* Left: Passage Reader with Sweeping Highlight */}
            <div className="md:col-span-6 p-4 sm:p-5 flex flex-col overflow-hidden relative">
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[var(--color-border)] shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-primary)' }}>
                  Passage Analyzer
                </span>
                <span className="text-[11px]" style={{ color: 'var(--color-text-soft)' }}>
                  Active Scan
                </span>
              </div>

              {/* Text viewport with scanning beam */}
              <div className="relative overflow-hidden flex-1 rounded-xl p-3 border border-[var(--color-border)] bg-[var(--color-bg)] text-xs font-serif leading-relaxed select-none">
                {/* Visual scan beam */}
                <div
                  className="rc-scanner-beam pointer-events-none absolute left-0 right-0 h-16 bg-gradient-to-b from-transparent via-[var(--color-primary-soft)] to-transparent"
                  aria-hidden="true"
                />

                <div className="space-y-3 opacity-75">
                  {previewParagraphs.length > 0 ? (
                    previewParagraphs.map((para, i) => (
                      <p
                        key={i}
                        className="transition-opacity duration-500"
                        style={{
                          color: i <= Math.floor(elapsedSeconds / 2) ? 'var(--color-ink)' : 'var(--color-text-soft)'
                        }}
                      >
                        {para.slice(0, 240)}…
                      </p>
                    ))
                  ) : (
                    <p style={{ color: 'var(--color-text-soft)' }}>
                      Evaluating arguments, logical premises, and topic ontology…
                    </p>
                  )}
                </div>
              </div>

              {/* Progress checklist under passage */}
              <div className="mt-3.5 space-y-1.5 shrink-0">
                {CHECKLIST_STEPS.map((step, idx) => {
                  const isDone = idx < currentStep;
                  const isActive = idx === currentStep;
                  return (
                    <div key={step} className="flex items-center gap-2 text-xs">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 border transition-all"
                        style={{
                          backgroundColor: isDone
                            ? 'var(--color-correct)'
                            : isActive
                            ? 'var(--color-primary-soft)'
                            : 'transparent',
                          borderColor: isDone
                            ? 'var(--color-correct)'
                            : isActive
                            ? 'var(--color-primary)'
                            : 'var(--color-border)',
                          color: isDone ? '#ffffff' : 'var(--color-primary)'
                        }}
                      >
                        {isDone ? (
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        ) : isActive ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] animate-pulse" />
                        ) : (
                          <span className="w-1 h-1 rounded-full bg-[var(--color-text-soft)]" />
                        )}
                      </div>
                      <span
                        style={{
                          color: isDone
                            ? 'var(--color-ink)'
                            : isActive
                            ? 'var(--color-primary)'
                            : 'var(--color-text-soft)',
                          fontWeight: isActive || isDone ? 600 : 400
                        }}
                      >
                        {step}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right: Shimmering Question Skeleton Cards */}
            <div className="md:col-span-6 p-4 sm:p-5 flex flex-col overflow-y-auto exam-scroll space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)] shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--color-accent)' }}>
                  Question Synthesis ({questionTypes.length} Items)
                </span>
                <span className="text-[11px]" style={{ color: 'var(--color-text-soft)' }}>
                  {Math.min(questionTypes.length, Math.floor(elapsedSeconds / 1.8))} / {questionTypes.length} Drafted
                </span>
              </div>

              <div className="space-y-3 flex-1">
                {questionTypes.map((qType, index) => {
                  const revealed = index <= Math.floor(elapsedSeconds / 1.8);
                  return (
                    <div
                      key={qType}
                      className="p-3.5 rounded-xl border transition-all duration-500"
                      style={{
                        backgroundColor: revealed ? 'var(--color-surface-2)' : 'var(--color-bg)',
                        borderColor: revealed ? 'var(--color-border-strong)' : 'var(--color-border)',
                        opacity: revealed ? 1 : 0.45
                      }}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded"
                          style={{
                            backgroundColor: revealed ? 'var(--color-accent-soft)' : 'var(--color-border)',
                            color: revealed ? 'var(--color-accent)' : 'var(--color-text-soft)'
                          }}
                        >
                          Q{index + 1} · {qType}
                        </span>
                        {revealed && (
                          <span className="text-[10px] font-mono text-[var(--color-correct)] flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Ready
                          </span>
                        )}
                      </div>

                      {/* Skeleton Stem Lines */}
                      <div className="space-y-1.5 mb-2.5">
                        <div className="h-2.5 w-5/6 rounded rc-skeleton-shimmer" />
                        <div className="h-2.5 w-3/5 rounded rc-skeleton-shimmer" />
                      </div>

                      {/* Skeleton Options */}
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="h-5 rounded border border-[var(--color-border)] rc-skeleton-shimmer" />
                        <div className="h-5 rounded border border-[var(--color-border)] rc-skeleton-shimmer" />
                        <div className="h-5 rounded border border-[var(--color-border)] rc-skeleton-shimmer" />
                        <div className="h-5 rounded border border-[var(--color-border)] rc-skeleton-shimmer" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

