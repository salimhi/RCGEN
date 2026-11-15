import { useState, useEffect } from 'react';
import { Sparkles, Check, Clock, X, AlertCircle, RefreshCw, ShieldCheck } from 'lucide-react';

export type GenerationStage = 'reading' | 'writing' | 'checking' | 'saving';

interface GeneratingOverlayProps {
  isGenerating: boolean;
  stage?: GenerationStage;
  passageText: string;
  examType: 'CAT' | 'GMAT';
  difficulty?: string;
  engine?: 'gemini' | 'algorithm';
  onCancel: () => void;
  error?: string | null;
  onRetry?: () => void;
}

const HONEST_STAGES: { id: GenerationStage; label: string; desc: string }[] = [
  { id: 'reading', label: 'Reading', desc: 'Analyzing thesis, structure, stance & key claims' },
  { id: 'writing', label: 'Writing questions', desc: 'Drafting stems, options & multi-tier flaw tags' },
  { id: 'checking', label: 'Checking every answer', desc: 'Blind review pass & independent question repair' },
  { id: 'saving', label: 'Saving', desc: 'Storing verified exam set to local browser database' }
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
  stage = 'reading',
  passageText,
  examType,
  difficulty = 'Challenging',
  engine = 'algorithm',
  onCancel,
  error = null,
  onRetry
}: GeneratingOverlayProps) {
  const [shouldRender, setShouldRender] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // 1. 700ms Appearance Threshold
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

  const stageOrder: Record<GenerationStage, number> = {
    reading: 0,
    writing: 1,
    checking: 2,
    saving: 3
  };
  const currentStageIndex = stageOrder[stage] ?? 0;

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
                Calibrating {difficulty} difficulty &amp; rigorous option psychometrics · <span className="text-amber-600 dark:text-amber-400 font-medium">This can take up to a minute.</span>
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
                  className="px-4 py-2 rounded-xl text-xs font-semibold rc-btn-primary flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Retry Generation</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Normal Multi-stage Generating Content */
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
            {/* Left column: Honest Stage Checklist */}
            <div className="p-5 sm:p-6 space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-primary)' }}>
                  Pipeline Progress
                </p>
                <h3 className="font-display font-semibold text-sm sm:text-base" style={{ color: 'var(--color-ink)' }}>
                  Synthesis &amp; Double-Check Pipeline
                </h3>
              </div>

              <div className="space-y-3">
                {HONEST_STAGES.map((s, idx) => {
                  const isDone = idx < currentStageIndex;
                  const isCurrent = idx === currentStageIndex;

                  return (
                    <div
                      key={s.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                        isCurrent
                          ? 'border-[var(--color-primary)] shadow-sm'
                          : isDone
                          ? 'opacity-85 border-transparent bg-black/5 dark:bg-white/5'
                          : 'opacity-40 border-transparent'
                      }`}
                      style={{
                        backgroundColor: isCurrent ? 'var(--color-primary-soft)' : undefined
                      }}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isDone ? (
                          <div
                            className="w-5 h-5 rounded-full flex items-center justify-center"
                            style={{ backgroundColor: 'var(--color-correct)', color: '#fff' }}
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : isCurrent ? (
                          <div
                            className="w-5 h-5 rounded-full border-2 border-current border-t-transparent animate-spin"
                            style={{ color: 'var(--color-primary)' }}
                          />
                        ) : (
                          <div
                            className="w-5 h-5 rounded-full border border-dashed flex items-center justify-center text-[10px]"
                            style={{ borderColor: 'var(--color-text-soft)', color: 'var(--color-text-soft)' }}
                          >
                            {idx + 1}
                          </div>
                        )}
                      </div>

                      <div className="space-y-0.5 flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-semibold leading-tight" style={{ color: 'var(--color-ink)' }}>
                            {s.label}
                          </p>
                          {isCurrent && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-primary)', color: '#fff' }}>
                              Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {s.desc}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 rounded-xl border text-[11px] leading-relaxed flex items-center gap-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-soft)' }}>
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>
                  Every question undergoes independent blind review to guarantee exactly one unambiguous correct key.
                </span>
              </div>
            </div>

            {/* Right column: Target Question Archetypes & Passage preview */}
            <div className="p-5 sm:p-6 space-y-5 flex flex-col justify-between" style={{ backgroundColor: 'var(--color-surface-2)' }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Exam Blueprints
                </p>
                <h3 className="font-display font-semibold text-sm sm:text-base mb-3" style={{ color: 'var(--color-ink)' }}>
                  Question Archetypes for this Passage
                </h3>

                <div className="space-y-2">
                  {questionTypes.map((t, idx) => (
                    <div
                      key={t}
                      className="flex items-center justify-between text-xs px-3 py-2 rounded-lg border"
                      style={{
                        backgroundColor: 'var(--color-surface)',
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-ink)'
                      }}
                    >
                      <span className="font-medium">
                        Q{idx + 1}. {t}
                      </span>
                      <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--color-bg)', color: 'var(--color-text-muted)' }}>
                        {examType} Standard
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {previewParagraphs.length > 0 && (
                <div className="pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <p className="text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
                    Passage Excerpt:
                  </p>
                  <p className="text-xs italic line-clamp-3 leading-relaxed" style={{ color: 'var(--color-text-soft)' }}>
                    "{previewParagraphs[0]}"
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
