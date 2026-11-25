import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import GeneratingOverlay, { type GenerationStage } from '../components/GeneratingOverlay';
import ProfileModal from '../components/ProfileModal';
import {
  Sparkles,
  FileText,
  BookOpen,
  Sliders,
  AlertCircle,
  Trophy,
  Cpu,
  Key,
  Check,
  RotateCcw
} from 'lucide-react';
import type { RCTest, ExamType, DifficultyLevel } from '../types';
import { useProfile } from '../contexts/ProfileContext';
import { getAllLibraryTests, computeWordCount } from '../lib/testStore';
import { saveCustomTest, generateCustomTestId } from '../lib/storage';
import { generateRcQuestions } from '../lib/geminiClient';
import { normalizeParagraphs, detectTopic } from '../lib/ruleGenerator';

const SAMPLE_PRESETS = [
  {
    label: 'Epistemology & Models',
    title: 'The Map That Mistook Itself for Territory',
    text: `Every mature science relies on idealization: frictionless planes in mechanics, rational utility-maximizers in economics, isolated gene-loci in population genetics. Without deliberate simplification, inquiry would drown in raw particularity before formulating a single testable law. To that extent, abstraction is not a departure from reality so much as the precondition for saying anything intelligible about it.\n\nTrouble begins, however, when the institutional prestige of a model outlives sensitivity to what its simplifying assumptions bracketed away. Practitioners socialized inside a successful paradigm routinely treat unmodeled variables not as temporarily deferred complications, but as ontological noise. Were the excluded factors genuinely negligible in every setting, no harm would follow. Because real-world interventions alter the very boundary conditions that laboratory idealizations hold constant, policies guided by stripped-down models frequently fail most dramatically where their architects feel most certain.\n\nConsider how mid-century urban planners and forestry agencies approached complex ecosystems. Armed with legible single-metric yield tables, administrators eliminated messy species diversity in favour of uniform rows that maximized short-term harvest calculations. For a decade or two, the metrics vindicated them. Only later did soil exhaustion and pest cascades reveal that the discarded "clutter" had been quietly performing the ecological work that kept the prized output viable.\n\nDefenders of formal modeling reply that blaming abstraction itself confuses bad models with the method of modeling: the remedy for an incomplete equation is simply a richer equation. That rejoinder carries real force, yet it underestimates a subtler hazard. Whenever institutions tie budgets and accountability to quantifiable outputs, whatever resists clean parameterization continues to lose bureaucratic standing regardless of how sophisticated equations become.\n\nIntellectual humility in modeling therefore demands more than technical refinement. It requires preserving rival ways of noticing—field observation, historical narrative, local tacit knowledge—precisely so practitioners can recognize when an otherwise elegant map has begun eroding the territory it claims to describe.`
  },
  {
    label: 'Global Trade & Resilience',
    title: 'Why Just-in-Time Efficiency Priced Risk Out of Sight',
    text: `For three decades, corporate strategists treated inventory buffers and redundant suppliers as confessions of managerial sloth. Lean supply chains promised a straightforward dividend: eliminate idle stock, concentrate production where unit costs were lowest, and recycle freed capital into shareholder returns or research. Judged by quarterly operating margins during years of geopolitical calm, the doctrine delivered handsomely.\n\nWhat the balance sheet recorded as pure efficiency gain, however, was in substantial measure an unbooked transfer of tail risk. Redundancy looks wasteful only when shocks are independent and short-lived. In tightly coupled networks where dozens of downstream assemblers rely on a single specialized fabrication node, local disruptions propagate nonlinearly rather than averaging out. Individual firms captured the certain daily savings of leanness while externalizing vulnerability across the wider economy.\n\nCritics sometimes conclude that globalization itself was a mistake and that domestic self-sufficiency offers a straightforward cure. Yet autarky confuses geographic proximity with structural resilience. Concentrating every stage of production inside one border merely exposes a nation to domestic weather, labour bottlenecks, or regulatory missteps without diversified external fallbacks.\n\nThe harder task for policymakers and boards alike is learning to price insurance before a crisis makes its value obvious. Markets excel at arbitraging visible unit-cost spreads; they are notoriously poor at rewarding executives who spend money today to soften a disruption that may arrive only once a decade.`
  }
];

const GENERATION_STEPS = [
  'Segmenting passage paragraphs & lexical density…',
  'Mapping author thesis, concessions, and rhetorical pivots…',
  'Constructing exam-calibrated distractors (Reversal, Extreme, Scope)…',
  'Writing per-option explanations for every choice…'
];

const TOPIC_CATEGORIES = [
  'Philosophy',
  'Economics & Social Theory',
  'Science & Evolution',
  'History & Culture',
  'Technology & AI',
  'Literature & Aesthetics'
];

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const heroContainerRef = useRef<HTMLDivElement>(null);

  const {
    geminiKey,
    hasGeminiKey,
    geminiModel,
    groqKey,
    hasGroqKey,
    groqModel,
    useGroq,
    doubleCheck,
    setDoubleCheck
  } = useProfile();

  const [inputMode, setInputMode] = useState<'paste' | 'url' | 'library'>('paste');
  const [engine, setEngine] = useState<'gemini' | 'algorithm'>('algorithm');
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const [pastedTitle, setPastedTitle] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pastedTopic, setPastedTopic] = useState<string>('Philosophy');
  const [topicUserSelected, setTopicUserSelected] = useState<boolean>(false);
  const [examType, setExamType] = useState<ExamType>(
    searchParams.get('exam') === 'GMAT' ? 'GMAT' : 'CAT'
  );
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Challenging');
  const [focusMode, setFocusMode] = useState<string>('Balanced Exam Mix');

  const [generating, setGenerating] = useState(false);
  const [genStage, setGenStage] = useState<GenerationStage>('reading');
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [libraryTests, setLibraryTests] = useState<RCTest[]>([]);
  const [featuredSample, setFeaturedSample] = useState<RCTest | null>(null);
  const [loadingTests, setLoadingTests] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState('All');

  // Hero sample question interactive state
  const [heroAnswerPicked, setHeroAnswerPicked] = useState<string | null>(null);

  // Orchestrated Hero Page-Load Reveal with GSAP (only once on mount, respecting prefers-reduced-motion)
  useGSAP(() => {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    gsap.from('.gsap-hero-reveal', {
      y: 18,
      opacity: 0,
      duration: 0.75,
      stagger: 0.12,
      ease: 'power2.out',
      clearProps: 'all'
    });
  }, { scope: heroContainerRef });

  useEffect(() => {
    if (hasGeminiKey) {
      setEngine('gemini');
    } else {
      setEngine('algorithm');
    }
  }, [hasGeminiKey]);

  useEffect(() => {
    const qExam = searchParams.get('exam');
    if (qExam === 'CAT' || qExam === 'GMAT') {
      setExamType(qExam);
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      const lib = getAllLibraryTests();
      setLibraryTests(lib);
      if (lib.length > 0) {
        setFeaturedSample(lib[0]);
      }
    } catch (err) {
      console.error('Library load error:', err);
    } finally {
      setLoadingTests(false);
    }
  }, []);

  useEffect(() => {
    if (!generating) {
      setGenStepIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setGenStepIdx((prev) => (prev + 1) % GENERATION_STEPS.length);
    }, 650);
    return () => clearInterval(timer);
  }, [generating]);

  useEffect(() => {
    if (!topicUserSelected && pastedText.trim().length > 30) {
      const detected = detectTopic(pastedText);
      setPastedTopic(detected);
    }
  }, [pastedText, topicUserSelected]);

  const wordCount = pastedText.trim()
    ? pastedText.trim().split(/\s+/).filter(Boolean).length
    : 0;

  const startsMidWord = /^[a-z]/.test(pastedText.trim());

  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelGenerate = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerating(false);
    setErrorMsg('Generation cancelled by user.');
  };

  const deriveTitle = (rawTitle: string, text: string): string => {
    const trimmed = rawTitle.trim();
    if (trimmed) return trimmed;

    const firstLine = text.trim().split('\n')[0].trim();
    const words = firstLine.split(/\s+/).filter(Boolean);
    if (words.length > 0 && words.length <= 15 && !/[.!?]$/.test(firstLine)) {
      return firstLine.replace(/^#+\s*/, '');
    }

    const now = new Date();
    const day = now.getDate();
    const month = now.toLocaleDateString(undefined, { month: 'short' });
    return `Untitled passage, ${day} ${month}`;
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (inputMode === 'url') {
      setErrorMsg(
        'In a 100% static client-side web app, browser CORS restricts fetching arbitrary URLs directly. Please switch to "Paste Article" and copy the essay text directly.'
      );
      return;
    }

    if (wordCount < 80) {
      setErrorMsg(
        `Please paste at least 80 words of an article or essay (currently ${wordCount} words) so the engine can craft multi-layered questions.`
      );
      return;
    }

    const { paragraphs } = normalizeParagraphs(pastedText);
    if (paragraphs.length === 0) {
      setErrorMsg('Could not extract valid paragraphs from the text. Please check your paste.');
      return;
    }

    const finalTitle = deriveTitle(pastedTitle, pastedText);
    const calculatedWc = computeWordCount(paragraphs);
    const targetSeconds = Math.round((calculatedWc / 250) * 60) + (examType === 'GMAT' ? 360 : 300);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);

    try {
      const result = await generateRcQuestions({
        paragraphs,
        title: finalTitle,
        topic: pastedTopic,
        examType,
        difficulty,
        focusMode,
        engine,
        geminiKey: hasGeminiKey ? geminiKey : undefined,
        groqKey: hasGroqKey ? groqKey : undefined,
        useGroq,
        doubleCheck: engine === 'gemini' ? doubleCheck : false,
        geminiModel,
        groqModel,
        onStage: (st) => setGenStage(st),
        signal: controller.signal,
      });

      const newTest: RCTest = {
        id: generateCustomTestId(),
        title: finalTitle,
        topic: pastedTopic,
        source_label: 'Custom Paste',
        category: 'custom',
        exam_type: examType,
        difficulty,
        word_count: calculatedWc,
        target_seconds: targetSeconds,
        passage_paragraphs: paragraphs,
        questions: result.questions,
        generation_source: result.source,
        generation_reason: result.reason || null,
        generation_diagnostics: result.diagnostics || null,
        verification_info: result.verification_info || null,
        created_at: new Date().toISOString(),
      };

      saveCustomTest(newTest);
      setGenerating(false);
      navigate(`/test/${newTest.id}`);
    } catch (err: any) {
      setGenerating(false);
      if (err.message === 'User aborted generation' || controller.signal.aborted) {
        setErrorMsg('Generation cancelled by user.');
      } else {
        setErrorMsg(err.message || 'Generation failed.');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const filteredLibrary =
    selectedTopic === 'All'
      ? libraryTests
      : libraryTests.filter((t) => t.topic === selectedTopic);

  // Decorative Sample Question data for Hero right pane
  const heroSample = {
    title: 'The Map That Mistook Itself for Territory',
    topic: 'Philosophy & Epistemology',
    excerpt:
      'Every mature science relies on idealization: frictionless planes in mechanics, rational utility-maximizers in economics, isolated gene-loci in population genetics. Without deliberate simplification, inquiry would drown in raw particularity before formulating a single testable law. Trouble begins, however, when the institutional prestige of a model outlives sensitivity to what its simplifying assumptions bracketed away.',
    stem: 'Based on the excerpt, which best captures why scientific idealization is both indispensable and dangerous?',
    options: [
      {
        letter: 'A',
        text: 'It enables initial lawmaking, yet risks mistaking provisional omissions for negligible reality.',
        isCorrect: true,
        explanation: 'The author notes idealization is the precondition for intelligible laws, but warns practitioners soon treat excluded variables as noise.'
      },
      {
        letter: 'B',
        text: 'It prevents empirical research until every real-world variable has been quantified.',
        isCorrect: false,
        explanation: 'Directly contradicts paragraph 1: without simplification, inquiry would drown immediately.'
      },
      {
        letter: 'C',
        text: 'It functions smoothly in economics but fails consistently when applied to physical mechanics.',
        isCorrect: false,
        explanation: 'Unsupported comparison: mechanics, economics, and genetics are cited as parallel examples of idealization.'
      }
    ]
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-20">
      <GeneratingOverlay
        isGenerating={generating}
        stage={genStage}
        passageText={pastedText}
        examType={examType}
        difficulty={difficulty}
        engine={engine}
        onCancel={handleCancelGenerate}
        error={errorMsg && generating ? errorMsg : null}
        onRetry={() => {
          setErrorMsg(null);
          handleGenerate({ preventDefault: () => { } } as React.FormEvent);
        }}
      />

      <ProfileModal isOpen={profileModalOpen} onClose={() => setProfileModalOpen(false)} />

      {/* =========================================================================
          HERO: Asymmetric Editorial Split (7:5) with GSAP Page-Load Reveal
          Left: Bold typography statement & intent
          Right: Static decorative RC practice artifact (with new dedicated classes)
         ========================================================================= */}
      <section ref={heroContainerRef} className="mb-14 sm:mb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Bold Headline & Editorial Statement */}
          <div className="lg:col-span-7 space-y-6">
            <div className="gsap-hero-reveal">
              <h1
                className="font-display text-2xl sm:text-4xl lg:text-[3.25rem] font-semibold tracking-tight leading-[1.14] text-left"
                style={{ color: 'var(--color-ink)' }}
              >
                Turn any article into an exam-grade RC test.
              </h1>
            </div>

            <p
              className="gsap-hero-reveal text-base sm:text-lg leading-relaxed text-left max-w-[62ch]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Paste essays from Aeon, The Economist, or research journals. RCgen normalizes
              passage density, crafts four-option psychometric distractors, and explains every option.
              Runs entirely inside your browser with complete privacy.
            </p>

            <div className="gsap-hero-reveal flex flex-wrap items-center gap-4 pt-1">
              <a
                href="#generator-studio"
                className="inline-flex items-center justify-center px-6 py-3 rounded-xl text-sm font-semibold rc-btn-primary cursor-pointer transition-colors"
              >
                Create RC Test
              </a>
              <button
                type="button"
                onClick={() => {
                  setInputMode('library');
                  const el = document.getElementById('generator-studio');
                  if (el) el.scrollIntoView({ behavior: 'smooth' });
                }}
                className="inline-flex items-center justify-center px-5 py-3 rounded-xl text-sm font-medium rc-btn-secondary cursor-pointer transition-colors"
              >
                Explore Curated Passages
              </button>
            </div>

            <div
              className="gsap-hero-reveal flex items-center gap-6 pt-3 text-xs"
              style={{ color: 'var(--color-text-soft)' }}
            >
              <span>Tuned for CAT VARC (+3 / −1)</span>
              <span>·</span>
              <span>GMAT Focus Verbal (A–E)</span>
              <span>·</span>
              <span>Local-first &amp; Private</span>
            </div>
          </div>

          {/* Right Column: Static Decorative RC Excerpt Artifact (NEW CLASSES ONLY) */}
          <div className="lg:col-span-5 gsap-hero-reveal">
            <div className="editorial-sample-box p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                  Sample Reading Artifact
                </span>
                <span className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
                  {heroSample.topic}
                </span>
              </div>

              <div>
                <h3 className="font-display font-semibold text-base mb-2" style={{ color: 'var(--color-ink)' }}>
                  {heroSample.title}
                </h3>
                <p className="editorial-sample-excerpt text-sm sm:text-[15px] leading-relaxed line-clamp-5">
                  {heroSample.excerpt}
                </p>
              </div>

              {/* Sample Question Preview inside Artifact */}
              <div className="editorial-sample-question p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span style={{ color: 'var(--color-text-soft)' }}>Diagnostic Question Stem</span>
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--color-accent)' }}>
                    Inference &amp; Logic
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold leading-snug" style={{ color: 'var(--color-ink)' }}>
                  {heroSample.stem}
                </p>

                <div className="space-y-2">
                  {heroSample.options.map((opt) => {
                    const isPicked = heroAnswerPicked === opt.letter;
                    const showResult = heroAnswerPicked !== null;
                    const isCorrect = opt.isCorrect;

                    let borderStyle = 'var(--color-border)';
                    let bgStyle = 'var(--color-surface)';
                    if (showResult && isCorrect) {
                      borderStyle = 'var(--color-correct)';
                      bgStyle = 'var(--color-correct-soft)';
                    } else if (showResult && isPicked && !isCorrect) {
                      borderStyle = 'var(--color-wrong)';
                      bgStyle = 'var(--color-wrong-soft)';
                    }

                    return (
                      <div key={opt.letter}>
                        <button
                          type="button"
                          onClick={() => setHeroAnswerPicked(opt.letter)}
                          className="w-full text-left p-2.5 rounded-lg border text-xs transition-colors flex items-start gap-2.5 cursor-pointer"
                          style={{ borderColor: borderStyle, backgroundColor: bgStyle }}
                        >
                          <span
                            className="w-5 h-5 rounded flex items-center justify-center font-bold text-[11px] shrink-0"
                            style={{
                              backgroundColor: 'var(--color-surface-2)',
                              color: 'var(--color-ink)'
                            }}
                          >
                            {opt.letter}
                          </span>
                          <span className="leading-relaxed" style={{ color: 'var(--color-ink)' }}>
                            {opt.text}
                          </span>
                        </button>
                        {showResult && (isPicked || isCorrect) && (
                          <div
                            className="mt-1 px-2.5 py-1.5 rounded text-[11px] leading-relaxed"
                            style={{
                              backgroundColor: 'var(--color-surface-2)',
                              color: isCorrect ? 'var(--color-correct)' : 'var(--color-wrong)'
                            }}
                          >
                            <strong>{isCorrect ? 'Correct choice:' : 'Eliminated distractor:'}</strong>{' '}
                            <span style={{ color: 'var(--color-text-muted)' }}>{opt.explanation}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {heroAnswerPicked && (
                  <div className="pt-2 flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--color-text-soft)' }}>Interactive demonstration</span>
                    <button
                      type="button"
                      onClick={() => setHeroAnswerPicked(null)}
                      className="inline-flex items-center gap-1 font-semibold cursor-pointer"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="editorial-rule mb-12" aria-hidden="true" />

      {/* =========================================================================
          GENERATOR STUDIO: Dedicated Workbench Card
         ========================================================================= */}
      <section id="generator-studio" className="rc-card p-5 sm:p-8 mb-14 scroll-mt-20">
        {/* Source Mode Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div
            className="w-full sm:w-auto grid grid-cols-2 sm:flex p-1 rounded-xl border"
            style={{
              backgroundColor: 'var(--color-bg)',
              borderColor: 'var(--color-border)'
            }}
          >
            <button
              type="button"
              onClick={() => {
                setInputMode('paste');
                setErrorMsg(null);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer"
              style={{
                backgroundColor: inputMode === 'paste' ? 'var(--color-surface)' : 'transparent',
                color: inputMode === 'paste' ? 'var(--color-ink)' : 'var(--color-text-muted)'
              }}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Paste Article</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode('library');
                setErrorMsg(null);
              }}
              className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-colors cursor-pointer truncate"
              style={{
                backgroundColor: inputMode === 'library' ? 'var(--color-surface)' : 'transparent',
                color: inputMode === 'library' ? 'var(--color-ink)' : 'var(--color-text-muted)'
              }}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
              <span className="truncate">Curated Library ({libraryTests.length})</span>
            </button>
          </div>

          {/* Exam Pattern Quick Toggle */}
          <div className="flex flex-col xs:flex-row xs:items-center gap-2.5 w-full sm:w-auto">
            <span className="text-xs font-medium shrink-0" style={{ color: 'var(--color-text-soft)' }}>
              Exam Pattern:
            </span>
            <div
              className="w-full sm:w-auto grid grid-cols-2 sm:flex p-1 rounded-xl border"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)'
              }}
            >
              <button
                type="button"
                onClick={() => setExamType('CAT')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-center"
                style={{
                  backgroundColor: examType === 'CAT' ? 'var(--color-primary)' : 'transparent',
                  color: examType === 'CAT' ? 'var(--mist-on-accent)' : 'var(--color-text-muted)'
                }}
              >
                CAT (4Q · +3/−1)
              </button>
              <button
                type="button"
                onClick={() => setExamType('GMAT')}
                className="px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-center"
                style={{
                  backgroundColor: examType === 'GMAT' ? 'var(--color-primary)' : 'transparent',
                  color: examType === 'GMAT' ? 'var(--mist-on-accent)' : 'var(--color-text-muted)'
                }}
              >
                GMAT (5Q · A–E)
              </button>
            </div>
          </div>
        </div>

        {/* Mode 1: Paste Article Form */}
        {inputMode !== 'library' ? (
          <form onSubmit={handleGenerate} className="space-y-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <label className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                  Paste Essay or Article Text
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
                    Sample presets:
                  </span>
                  {SAMPLE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setPastedTitle(preset.title);
                        setPastedText(preset.text);
                        setPastedTopic(detectTopic(preset.text));
                        setTopicUserSelected(false);
                        setErrorMsg(null);
                      }}
                      className="text-xs px-2.5 py-1 rounded-full rc-chip cursor-pointer"
                    >
                      + {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mb-3">
                <label className="block text-xs font-medium mb-1" style={{ color: 'var(--color-text-muted)' }}>
                  Passage Title (Optional)
                </label>
                <input
                  type="text"
                  value={pastedTitle}
                  onChange={(e) => setPastedTitle(e.target.value)}
                  placeholder="Leave blank to use the first line, or 'Untitled passage, 14 Nov'"
                  className="w-full px-4 py-2.5 rounded-xl text-base sm:text-sm border outline-none transition-colors"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-ink)'
                  }}
                />
              </div>

              <textarea
                rows={8}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste any argumentative essay, philosophical reflection, science column, or economic commentary here (aim for 300–850 words for authentic CAT/GMAT passage pacing)..."
                className="w-full p-4 rounded-xl text-base sm:text-sm leading-relaxed border outline-none transition-colors resize-y font-body"
                style={{
                  backgroundColor: 'var(--color-bg)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-ink)'
                }}
              />

              {startsMidWord && (
                <div
                  className="flex items-center gap-2 mt-2 px-3.5 py-2.5 rounded-xl text-xs font-medium border"
                  style={{
                    backgroundColor: 'var(--color-warn-soft)',
                    borderColor: 'var(--color-warn)',
                    color: 'var(--color-warn)'
                  }}
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>The first paragraph starts mid-word. Check your paste.</span>
                </div>
              )}

              <div className="flex items-center justify-between mt-2 text-xs">
                <span
                  style={{
                    color:
                      wordCount === 0
                        ? 'var(--color-text-soft)'
                        : wordCount < 80
                          ? 'var(--color-warn)'
                          : 'var(--color-correct)'
                  }}
                >
                  {wordCount} words{' '}
                  {wordCount === 0
                    ? '· Minimum 80 words (Best results with 400 to 800 words)'
                    : wordCount < 80
                      ? `· Add ${80 - wordCount} more words`
                      : '· Calibrated length'}
                </span>
                {pastedText && (
                  <button
                    type="button"
                    onClick={() => {
                      setPastedText('');
                      setPastedTitle('');
                      setTopicUserSelected(false);
                    }}
                    className="hover:underline cursor-pointer"
                    style={{ color: 'var(--color-text-soft)' }}
                  >
                    Clear text
                  </button>
                )}
              </div>

              {/* Topic Selector */}
              <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-semibold" style={{ color: 'var(--color-text-muted)' }}>
                    Passage Topic {topicUserSelected ? '(Custom Selected)' : '(Auto-Detected)'}
                  </label>
                  {!topicUserSelected && pastedText.trim().length > 30 && (
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                      Preselected: {pastedTopic}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {TOPIC_CATEGORIES.map((cat) => {
                    const isSelected = pastedTopic === cat;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setPastedTopic(cat);
                          setTopicUserSelected(true);
                        }}
                        className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-colors cursor-pointer truncate ${isSelected ? 'rc-chip-active' : 'rc-chip'
                          }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Generation Engine & Calibration Controls */}
            <div
              className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)'
              }}
            >
              {/* Engine Selector */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  <span>Question Engine</span>
                  {!hasGeminiKey && (
                    <button
                      type="button"
                      onClick={() => setProfileModalOpen(true)}
                      className="text-[11px] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      <Key className="w-3 h-3" />
                      Add Gemini Key
                    </button>
                  )}
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (hasGeminiKey) {
                        setEngine('gemini');
                      } else {
                        setProfileModalOpen(true);
                      }
                    }}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${engine === 'gemini' ? 'rc-chip-active' : 'rc-chip'
                      }`}
                    title={hasGeminiKey ? 'Use Google Gemini AI' : 'Add Gemini API Key in Profile to enable'}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Gemini AI</span>
                    {!hasGeminiKey && <span className="text-[10px] opacity-70">(BYOK)</span>}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEngine('algorithm')}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${engine === 'algorithm' ? 'rc-chip-active' : 'rc-chip'
                      }`}
                  >
                    <Cpu className="w-3.5 h-3.5" />
                    <span>Algorithm</span>
                  </button>
                </div>

                {engine === 'gemini' && (
                  <label className="flex items-center gap-2 mt-2 pt-2 border-t cursor-pointer" style={{ borderColor: 'var(--color-border)' }}>
                    <input
                      type="checkbox"
                      checked={doubleCheck}
                      onChange={(e) => setDoubleCheck(e.target.checked)}
                      className="rounded accent-[var(--color-accent)] w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-[11px] font-semibold" style={{ color: 'var(--color-ink)' }}>
                      {hasGroqKey && useGroq
                        ? 'Double-check answers with Groq'
                        : 'Double-check answers (extra verification)'}
                    </span>
                  </label>
                )}
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Rigor Level</span>
                </label>
                <div className="flex gap-1.5">
                  {(['Standard', 'Challenging', 'Brutal'] as DifficultyLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDifficulty(lvl)}
                      className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${difficulty === lvl ? 'rc-chip-active' : 'rc-chip'
                        }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Question Stem Focus
                </label>
                <select
                  value={focusMode}
                  onChange={(e) => setFocusMode(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-medium border outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-ink)'
                  }}
                >
                  <option value="Balanced Exam Mix">Balanced Exam Mix</option>
                  <option value="Inference & Implicit Logic">Inference &amp; Logic Heavy</option>
                  <option value="Main Idea & Structure">Argument Structure</option>
                </select>
              </div>
            </div>

            {errorMsg && (
              <div
                className="flex items-start gap-2.5 p-3.5 rounded-xl text-sm border"
                style={{
                  backgroundColor: 'var(--color-wrong-soft)',
                  borderColor: 'var(--color-wrong)',
                  color: 'var(--color-wrong)'
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Submit Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
              <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {examType === 'CAT' ? (
                  <span>
                    Generates <strong>4 MCQs × 4 options</strong> · CAT scoring (+3 / −1 / 0) · 8-minute target pace
                  </span>
                ) : (
                  <span>
                    Generates <strong>5 MCQs × 5 options (A–E)</strong> · GMAT Focus scoring · 10-minute target pace
                  </span>
                )}
                {' · '}
                <span className="font-medium" style={{ color: 'var(--color-accent)' }}>
                  Engine: {engine === 'gemini' ? 'Gemini AI (BYOK)' : 'Rule-based Algorithm'}
                </span>
              </div>

              <button
                type="submit"
                disabled={generating}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3 rounded-xl text-sm font-semibold rc-btn-primary cursor-pointer transition-colors"
              >
                {generating ? (
                  <>
                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>{GENERATION_STEPS[genStepIdx]}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>Generate {examType} RC Test</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Mode 2: Curated Article Library Picker */
          <div>
            <div className="flex flex-wrap items-center gap-1.5 mb-5">
              {[
                'All',
                'Philosophy',
                'Economics & Social Theory',
                'Science & Evolution',
                'History & Culture',
                'Technology & AI',
                'Literature & Aesthetics'
              ].map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => setSelectedTopic(topic)}
                  className={`px-3 py-1.5 text-xs rounded-full cursor-pointer transition-colors ${selectedTopic === topic ? 'rc-chip-active' : 'rc-chip'
                    }`}
                >
                  {topic}
                </button>
              ))}
            </div>

            {loadingTests ? (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--color-text-muted)' }}>
                Loading curated essays…
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredLibrary.slice(0, 6).map((test) => (
                  <div
                    key={test.id}
                    className="p-4 rounded-xl border flex flex-col justify-between gap-3 transition-colors hover:border-[var(--color-accent)]"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-xs font-semibold" style={{ color: 'var(--color-accent)' }}>
                          {test.topic}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded text-[11px] font-medium"
                          style={{
                            backgroundColor: 'var(--color-surface-2)',
                            color: 'var(--color-text-muted)'
                          }}
                        >
                          {test.exam_type} · {test.questions?.length || 4} Qs
                        </span>
                      </div>
                      <h3 className="font-display font-semibold text-base mb-1" style={{ color: 'var(--color-ink)' }}>
                        {test.title}
                      </h3>
                      <p className="text-xs line-clamp-2" style={{ color: 'var(--color-text-muted)' }}>
                        {test.passage_paragraphs?.[0]}
                      </p>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t text-xs" style={{ borderColor: 'var(--color-border)' }}>
                      <span style={{ color: 'var(--color-text-soft)' }}>
                        {test.word_count} words · {test.difficulty}
                      </span>
                      <Link
                        to={`/test/${test.id}`}
                        className="font-semibold transition-colors"
                        style={{ color: 'var(--color-accent)' }}
                      >
                        Start Test Set
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 text-center">
              <Link to="/library" className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: 'var(--color-accent)' }}>
                <span>Browse full Article Library with filters</span>
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* =========================================================================
          EDITORIAL METHODOLOGY: Narrative Split (Replaces cookie-cutter icon cards)
         ========================================================================= */}
      <section className="mb-20 pt-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div className="lg:col-span-5 space-y-3">
            <h2 className="font-display text-2xl sm:text-3xl font-semibold leading-tight" style={{ color: 'var(--color-ink)' }}>
              Built for deliberate RC mastery
            </h2>
            <p className="text-base leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
              Standard prep materials exhaust their usefulness once you remember the questions. RCgen
              turns authentic essays into calibrated test sets that demand active reasoning.
            </p>
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="space-y-1.5 pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-display font-semibold text-lg" style={{ color: 'var(--color-ink)' }}>
                Practice with unfamiliar material
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Static question banks train pattern recognition rather than reading ability. Generating sets from fresh long-form essays forces genuine passage comprehension under timed conditions.
              </p>
            </div>

            <div className="space-y-1.5 pb-5 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <h3 className="font-display font-semibold text-lg" style={{ color: 'var(--color-ink)' }}>
                Explicit distractor diagnosis
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Knowing the correct letter is half the learning. Every option includes an explanation of why the correct key holds and why each trap fails: scope expansion, direct reversal, or extreme assertion.
              </p>
            </div>

            <div className="space-y-1.5">
              <h3 className="font-display font-semibold text-lg" style={{ color: 'var(--color-ink)' }}>
                Structured past slots &amp; pace tracking
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                Explore the structured 60-slot CAT 2021–2025 past papers catalog, drill speed reading sprints, and evaluate question-type accuracy on your private report card.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
