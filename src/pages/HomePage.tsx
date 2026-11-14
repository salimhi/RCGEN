import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import GeneratingOverlay from '../components/GeneratingOverlay';
import {
  Sparkles,
  FileText,
  Globe,
  BookOpen,
  ArrowRight,
  Clock,
  CheckCircle2,
  Flame,
  Sliders,
  AlertCircle,
  Trophy,
  Star
} from 'lucide-react';
import type { RCTest, ExamType, DifficultyLevel } from '../types';
import { useAuth } from '../contexts/AuthContext';

const SAMPLE_PRESETS = [
  {
    label: 'Epistemology & Models (Aeon style)',
    title: 'The Map That Mistook Itself for Territory',
    text: `Every mature science relies on idealization: frictionless planes in mechanics, rational utility-maximizers in economics, isolated gene-loci in population genetics. Without deliberate simplification, inquiry would drown in raw particularity before formulating a single testable law. To that extent, abstraction is not a departure from reality so much as the precondition for saying anything intelligible about it.\n\nTrouble begins, however, when the institutional prestige of a model outlives sensitivity to what its simplifying assumptions bracketed away. Practitioners socialized inside a successful paradigm routinely treat unmodeled variables not as temporarily deferred complications, but as ontological noise. Were the excluded factors genuinely negligible in every setting, no harm would follow. Because real-world interventions alter the very boundary conditions that laboratory idealizations hold constant, policies guided by stripped-down models frequently fail most dramatically where their architects feel most certain.\n\nConsider how mid-century urban planners and forestry agencies approached complex ecosystems. Armed with legible single-metric yield tables, administrators eliminated messy species diversity in favour of uniform rows that maximized short-term harvest calculations. For a decade or two, the metrics vindicated them. Only later did soil exhaustion and pest cascades reveal that the discarded "clutter" had been quietly performing the ecological work that kept the prized output viable.\n\nDefenders of formal modeling reply that blaming abstraction itself confuses bad models with the method of modeling: the remedy for an incomplete equation is simply a richer equation. That rejoinder carries real force, yet it underestimates a subtler hazard. Whenever institutions tie budgets and accountability to quantifiable outputs, whatever resists clean parameterization continues to lose bureaucratic standing regardless of how sophisticated equations become.\n\nIntellectual humility in modeling therefore demands more than technical refinement. It requires preserving rival ways of noticing—field observation, historical narrative, local tacit knowledge—precisely so practitioners can recognize when an otherwise elegant map has begun eroding the territory it claims to describe.`
  },
  {
    label: 'Global Trade & Resilience (Economist style)',
    title: 'Why Just-in-Time Efficiency Priced Risk Out of Sight',
    text: `For three decades, corporate strategists treated inventory buffers and redundant suppliers as confessions of managerial sloth. Lean supply chains promised a straightforward dividend: eliminate idle stock, concentrate production where unit costs were lowest, and recycle freed capital into shareholder returns or research. Judged by quarterly operating margins during years of geopolitical calm, the doctrine delivered handsomely.\n\nWhat the balance sheet recorded as pure efficiency gain, however, was in substantial measure an unbooked transfer of tail risk. Redundancy looks wasteful only when shocks are independent and short-lived. In tightly coupled networks where dozens of downstream assemblers rely on a single specialized fabrication node, local disruptions propagate nonlinearly rather than averaging out. Individual firms captured the certain daily savings of leanness while externalizing vulnerability across the wider economy.\n\nCritics sometimes conclude that globalization itself was a mistake and that domestic self-sufficiency offers a straightforward cure. Yet autarky confuses geographic proximity with structural resilience. Concentrating every stage of production inside one border merely exposes a nation to domestic weather, labour bottlenecks, or regulatory missteps without diversified external fallbacks.\n\nThe harder task for policymakers and boards alike is learning to price insurance before a crisis makes its value obvious. Markets excel atarbitraging visible unit-cost spreads; they are notoriously poor at rewarding executives who spend money today to soften a disruption that may arrive only once a decade.`
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

function quickDetectTopic(text: string): string {
  const lower = text.toLowerCase();
  const lexicon: Record<string, string[]> = {
    'Philosophy': ['epistemology', 'moral', 'ethics', 'consciousness', 'truth', 'reason', 'rationality', 'mind', 'metaphysics', 'virtue', 'justice', 'self', 'agency', 'philosopher', 'scepticism', 'stoic'],
    'Economics & Social Theory': ['market', 'economy', 'capital', 'price', 'labour', 'labor', 'inequality', 'institution', 'incentive', 'trade', 'commodity', 'growth', 'policy', 'wealth', 'social', 'public'],
    'Science & Evolution': ['evolution', 'species', 'biology', 'genetic', 'organism', 'adaptation', 'brain', 'quantum', 'climate', 'ecology', 'physics', 'experiment', 'hypothesis', 'cell', 'selection'],
    'History & Culture': ['century', 'empire', 'colonial', 'archive', 'historian', 'medieval', 'ancient', 'tradition', 'ritual', 'monument', 'civilisation', 'civilization', 'revolution', 'dynasty'],
    'Technology & AI': ['algorithm', 'digital', 'platform', 'software', 'machine', 'artificial', 'intelligence', 'automation', 'data', 'network', 'computation', 'model', 'tech', 'interface'],
    'Literature & Aesthetics': ['novel', 'poetry', 'narrative', 'aesthetic', 'art', 'fiction', 'author', 'reader', 'literary', 'language', 'metaphor', 'translation', 'painting', 'music', 'critic']
  };
  let best = 'Philosophy';
  let bestScore = -1;
  for (const [topic, words] of Object.entries(lexicon)) {
    let score = 0;
    for (const w of words) {
      const matches = lower.match(new RegExp(`\\b${w}`, 'gi'));
      if (matches) score += matches.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = topic;
    }
  }
  return best;
}

export default function HomePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, guestId } = useAuth();

  const [inputMode, setInputMode] = useState<'paste' | 'url' | 'library'>('paste');
  const [pastedTitle, setPastedTitle] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [pastedTopic, setPastedTopic] = useState<string>('Philosophy');
  const [topicUserSelected, setTopicUserSelected] = useState<boolean>(false);
  const [articleUrl, setArticleUrl] = useState('');
  const [examType, setExamType] = useState<ExamType>(
    searchParams.get('exam') === 'GMAT' ? 'GMAT' : 'CAT'
  );
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Challenging');
  const [focusMode, setFocusMode] = useState<string>('Balanced Exam Mix');

  const [generating, setGenerating] = useState(false);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [libraryTests, setLibraryTests] = useState<RCTest[]>([]);
  const [liveTest, setLiveTest] = useState<RCTest | null>(null);
  const [featuredSample, setFeaturedSample] = useState<RCTest | null>(null);
  const [loadingTests, setLoadingTests] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState('All');

  // Inline quick-check state for embedded sample question preview on homepage
  const [previewSelected, setPreviewSelected] = useState<string | null>(null);

  useEffect(() => {
    const qExam = searchParams.get('exam');
    if (qExam === 'CAT' || qExam === 'GMAT') {
      setExamType(qExam);
    }
  }, [searchParams]);

  useEffect(() => {
    const loadHomeData = async () => {
      try {
        const [testsRes, liveRes] = await Promise.all([
          fetch('/api/tests'),
          fetch('/api/live')
        ]);
        if (testsRes.ok) {
          const allTests: RCTest[] = await testsRes.json();
          const lib = allTests.filter((t) => t.category === 'library');
          setLibraryTests(lib);
          const sample =
            allTests.find((t) => t.slug === 'the-attention-economy-cat-sample') ||
            lib[0] ||
            allTests[0] ||
            null;
          setFeaturedSample(sample);
        }
        if (liveRes.ok) {
          const liveData = await liveRes.json();
          setLiveTest(liveData.activeTest || null);
        }
      } catch (err) {
        console.error('Home fetch error:', err);
      } finally {
        setLoadingTests(false);
      }
    };
    loadHomeData();
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
      const detected = quickDetectTopic(pastedText);
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

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (inputMode === 'paste' && wordCount < 80) {
      setErrorMsg(
        `Please paste at least 80 words of an article or essay (currently ${wordCount} words) so the engine can craft multi-layered questions.`
      );
      return;
    }
    if (inputMode === 'url' && !articleUrl.trim()) {
      setErrorMsg('Please enter a valid article or essay URL (e.g. https://...).');
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);
    try {
      const res = await fetch('/api/generate-rc', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: pastedTitle,
          text: inputMode === 'paste' ? pastedText : '',
          url: inputMode === 'url' ? articleUrl : '',
          topic: pastedTopic,
          examType,
          difficulty,
          focusMode,
          userId: user?.id || guestId
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate RC test');
      }
      navigate(`/test/${data.id}`);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setErrorMsg('Generation was cancelled.');
      } else {
        setErrorMsg(err instanceof Error ? err.message : 'Generation error');
      }
      setGenerating(false);
    } finally {
      abortControllerRef.current = null;
    }
  };

  const filteredLibrary =
    selectedTopic === 'All'
      ? libraryTests
      : libraryTests.filter((t) => t.topic === selectedTopic);

  const sampleFirstQ = featuredSample?.questions?.[0];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 pb-16">
      <GeneratingOverlay
        isGenerating={generating}
        passageText={inputMode === 'paste' ? pastedText : articleUrl}
        examType={examType}
        difficulty={difficulty}
        onCancel={handleCancelGenerate}
        error={errorMsg && generating ? errorMsg : null}
        onRetry={() => {
          setErrorMsg(null);
          handleGenerate({ preventDefault: () => {} } as React.FormEvent);
        }}
      />
      {/* Daily Live RC Arena Strip */}
      {liveTest && (
        <div
          className="mb-8 rounded-2xl px-4 sm:px-5 py-3.5 border flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          style={{
            backgroundColor: 'var(--color-surface)',
            borderColor: 'var(--color-border-strong)',
            boxShadow: 'var(--shadow-soft)'
          }}
        >
          <div className="flex items-start sm:items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold shrink-0 mt-0.5 sm:mt-0"
              style={{
                backgroundColor: 'var(--color-correct-soft)',
                color: 'var(--color-correct)'
              }}
            >
              <Flame className="w-3.5 h-3.5" />
              DAILY LIVE RC
            </span>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
                {liveTest.title}
              </p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {liveTest.topic} · {liveTest.word_count} words · 4 CAT questions (+3 / −1) · Live global leaderboard
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/live"
              className="px-3 py-1.5 rounded-xl text-xs font-semibold rc-btn-secondary"
            >
              Leaderboard
            </Link>
            <Link
              to={`/test/${liveTest.id}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold rc-btn-primary"
            >
              <span>Enter Live Set</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Editorial Hero */}
      <header className="text-center max-w-3xl mx-auto mb-9">
        <span
          className="inline-block text-xs font-bold uppercase tracking-[0.14em] px-3 py-1 rounded-full mb-4"
          style={{
            backgroundColor: 'var(--color-primary-soft)',
            color: 'var(--color-primary)'
          }}
        >
          Reading Comprehension
        </span>
        <h1
          className="font-display text-4xl sm:text-5xl md:text-[3.35rem] font-semibold tracking-tight leading-[1.1] mb-4"
          style={{ color: 'var(--color-ink)' }}
        >
          Turn any article into an{' '}
          <em className="italic font-normal" style={{ color: 'var(--color-primary)' }}>
            exam-grade
          </em>{' '}
          RC test.
        </h1>
        <p className="text-base sm:text-lg leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
          Paste text, import an essay URL, or choose from curated articles. Instant scoring and per-option distractor explanations tuned for{' '}
          <strong style={{ color: 'var(--color-ink)' }}>CAT VARC</strong> and{' '}
          <strong style={{ color: 'var(--color-ink)' }}>GMAT Focus</strong>.
        </p>
      </header>

      {/* Main Generator Studio Card */}
      <section className="rc-card-elevated p-5 sm:p-7 mb-12">
        {/* Source Mode Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-5 mb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div
            className="inline-flex p-1 rounded-xl border"
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
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
              style={{
                backgroundColor: inputMode === 'paste' ? 'var(--color-surface)' : 'transparent',
                color: inputMode === 'paste' ? 'var(--color-ink)' : 'var(--color-text-muted)',
                boxShadow: inputMode === 'paste' ? 'var(--shadow-soft)' : 'none'
              }}
            >
              <FileText className="w-4 h-4" />
              <span>Paste Article</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode('url');
                setErrorMsg(null);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
              style={{
                backgroundColor: inputMode === 'url' ? 'var(--color-surface)' : 'transparent',
                color: inputMode === 'url' ? 'var(--color-ink)' : 'var(--color-text-muted)',
                boxShadow: inputMode === 'url' ? 'var(--shadow-soft)' : 'none'
              }}
            >
              <Globe className="w-4 h-4" />
              <span>From URL</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setInputMode('library');
                setErrorMsg(null);
              }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer"
              style={{
                backgroundColor: inputMode === 'library' ? 'var(--color-surface)' : 'transparent',
                color: inputMode === 'library' ? 'var(--color-ink)' : 'var(--color-text-muted)',
                boxShadow: inputMode === 'library' ? 'var(--shadow-soft)' : 'none'
              }}
            >
              <BookOpen className="w-4 h-4" />
              <span>Article Library ({libraryTests.length})</span>
            </button>
          </div>

          {/* Exam Pattern Quick Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-soft)' }}>
              Exam Pattern:
            </span>
            <div
              className="inline-flex p-1 rounded-xl border"
              style={{
                backgroundColor: 'var(--color-bg)',
                borderColor: 'var(--color-border)'
              }}
            >
              <button
                type="button"
                onClick={() => setExamType('CAT')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                style={{
                  backgroundColor: examType === 'CAT' ? 'var(--color-primary)' : 'transparent',
                  color: examType === 'CAT' ? '#fffcf6' : 'var(--color-text-muted)'
                }}
              >
                CAT (4Q · +3/−1)
              </button>
              <button
                type="button"
                onClick={() => setExamType('GMAT')}
                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                style={{
                  backgroundColor: examType === 'GMAT' ? 'var(--color-primary)' : 'transparent',
                  color: examType === 'GMAT' ? '#fffcf6' : 'var(--color-text-muted)'
                }}
              >
                GMAT Focus (5Q · A–E)
              </button>
            </div>
          </div>
        </div>

        {/* Mode 1 & 2: Paste or URL Form */}
        {inputMode !== 'library' ? (
          <form onSubmit={handleGenerate} className="space-y-5">
            {inputMode === 'paste' ? (
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    Paste Essay or Article Text (Aeon, Economist, New Yorker, Guardan, Research)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
                      Quick fill:
                    </span>
                    {SAMPLE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => {
                          setPastedTitle(preset.title);
                          setPastedText(preset.text);
                          setPastedTopic(quickDetectTopic(preset.text));
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
                  <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
                    Passage Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={pastedTitle}
                    onChange={(e) => setPastedTitle(e.target.value)}
                    placeholder="Leave blank to use the first line, or 'Untitled passage'"
                    className="w-full px-4 py-2.5 rounded-xl text-sm border outline-none transition-colors"
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
                  className="w-full p-4 rounded-2xl text-sm leading-relaxed border outline-none transition-colors resize-y font-body"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border-strong)',
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
                      ? '· Minimum 80 words (450–700 words ideal for CAT/GMAT)'
                      : wordCount < 80
                      ? `· Add ${80 - wordCount} more words`
                      : '· Ready for exam-grade RC synthesis'}
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

                {/* Topic Selector with auto-detection preselected */}
                <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
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
                          className={`px-3 py-2 rounded-xl text-xs font-semibold border text-left transition-all cursor-pointer truncate ${
                            isSelected ? 'rc-chip-active' : 'rc-chip'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  Article or Essay URL
                </label>
                <input
                  type="url"
                  value={articleUrl}
                  onChange={(e) => setArticleUrl(e.target.value)}
                  placeholder="https://aeon.co/essays/... or any public essay/article URL"
                  className="w-full px-4 py-3 rounded-xl text-sm border outline-none"
                  style={{
                    backgroundColor: 'var(--color-bg)',
                    borderColor: 'var(--color-border-strong)',
                    color: 'var(--color-ink)'
                  }}
                />
                <p className="text-xs" style={{ color: 'var(--color-text-soft)' }}>
                  PracticeRC fetches readable body paragraphs from public articles and trims boilerplate automatically. If a site paywalls its HTML, switch to <strong>Paste Article</strong>.
                </p>
              </div>
            )}

            {/* Calibration Controls */}
            <div
              className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-2xl border"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Distractor Rigor / Difficulty</span>
                </label>
                <div className="flex gap-1.5">
                  {(['Standard', 'Challenging', 'Brutal'] as DifficultyLevel[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDifficulty(lvl)}
                      className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold border cursor-pointer transition-all ${
                        difficulty === lvl ? 'rc-chip-active' : 'rc-chip'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--color-text-muted)' }}>
                  Question Stem Emphasis
                </label>
                <select
                  value={focusMode}
                  onChange={(e) => setFocusMode(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg text-xs font-medium border outline-none"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderColor: 'var(--color-border-strong)',
                    color: 'var(--color-ink)'
                  }}
                >
                  <option value="Balanced Exam Mix">Balanced Exam Mix (Main Idea + Inference + Function + Tone)</option>
                  <option value="Inference & Implicit Logic">Inference &amp; Implicit Logic Heavy</option>
                  <option value="Main Idea & Structure">Argument Structure &amp; Author Stance</option>
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
                    Generates <strong>4 MCQs × 4 options</strong> · CAT marking (+3 / −1 / 0) · 8m target timer
                  </span>
                ) : (
                  <span>
                    Generates <strong>5 MCQs × 5 options (A–E)</strong> · GMAT Focus Verbal · 10m target timer
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={generating}
                className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold rc-btn-primary cursor-pointer"
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
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Mode 3: Curated Article Library Picker */
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
                  className={`px-3 py-1.5 text-xs rounded-full cursor-pointer ${
                    selectedTopic === topic ? 'rc-chip-active' : 'rc-chip'
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredLibrary.slice(0, 6).map((test) => (
                  <div
                    key={test.id}
                    className="p-4 rounded-2xl border flex flex-col justify-between gap-3 transition-all hover:border-[var(--color-primary)]"
                    style={{
                      backgroundColor: 'var(--color-bg)',
                      borderColor: 'var(--color-border)'
                    }}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-primary)' }}>
                          {test.topic}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-[11px] font-semibold"
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
                        className="inline-flex items-center gap-1 font-semibold"
                        style={{ color: 'var(--color-primary)' }}
                      >
                        <span>Start Set</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-5 text-center">
              <Link to="/library" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--color-primary)' }}>
                <span>Browse full Article Library &amp; topic filters</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Value Props Row (exact PracticeRC ethos) */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-14">
        <div className="rc-card p-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
            <BookOpen className="w-4 h-4" />
          </div>
          <h2 className="font-display font-semibold text-lg mb-1.5" style={{ color: 'var(--color-ink)' }}>
            Practice that never runs out
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Every static RC question bank is finite—work through it long enough and you recognize the answers. Paste any unfamiliar Aeon or Economist essay and test real comprehension.
          </p>
        </div>

        <div className="rc-card p-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: 'var(--color-accent-soft)', color: 'var(--color-accent)' }}>
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <h2 className="font-display font-semibold text-lg mb-1.5" style={{ color: 'var(--color-ink)' }}>
            Per-option explanations
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Knowing the right letter is half the skill. Every option includes an explicit diagnosis—why the key holds and why each distractor fails (reversal, overreach, narrow detail).
          </p>
        </div>

        <div className="rc-card p-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: 'var(--color-warn-soft)', color: 'var(--color-warn)' }}>
            <Trophy className="w-4 h-4" />
          </div>
          <h2 className="font-display font-semibold text-lg mb-1.5" style={{ color: 'var(--color-ink)' }}>
            60 CAT PYQs &amp; Live Arena
          </h2>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
            Benchmark yourself across all 15 slots of CAT 2021–2025 RC topics, compete on the Daily Live RC leaderboard, and track weak question types on your Report Card.
          </p>
        </div>
      </section>

      {/* Embedded Interactive Sample CAT RC Set ("The Attention Economy" from PracticeRC!) */}
      {featuredSample && sampleFirstQ && (
        <section className="rc-card p-6 sm:p-8 mb-14">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 mb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold mb-1.5">
                <span style={{ color: 'var(--color-primary)' }}>{featuredSample.topic}</span>
                <span style={{ color: 'var(--color-text-soft)' }}>·</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{featuredSample.questions.length} questions</span>
                <span style={{ color: 'var(--color-text-soft)' }}>·</span>
                <span style={{ color: 'var(--color-text-muted)' }}>{featuredSample.word_count} words</span>
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-semibold" style={{ color: 'var(--color-ink)' }}>
                Try a sample CAT RC set: {featuredSample.title}
              </h2>
            </div>
            <Link
              to={`/test/${featuredSample.id}`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold rc-btn-primary shrink-0"
            >
              <Clock className="w-4 h-4" />
              <span>Open Full Set in Exam Player</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-7">
            {/* Excerpt */}
            <div className="lg:col-span-7 space-y-3.5 passage-prose text-[15.5px]" style={{ color: 'var(--color-text)' }}>
              {featuredSample.passage_paragraphs.slice(0, 3).map((para, i) => (
                <p key={i} id={`sample-p-${i + 1}`} data-paragraph-index={i}>
                  {para}
                </p>
              ))}
              {featuredSample.passage_paragraphs.length > 3 && (
                <p className="text-xs font-sans italic pt-1" style={{ color: 'var(--color-text-soft)' }}>
                  + {featuredSample.passage_paragraphs.length - 3} more paragraphs in the full split-screen exam player…
                </p>
              )}
            </div>

            {/* Interactive Question 1 Preview */}
            <div
              className="lg:col-span-5 p-5 rounded-2xl border flex flex-col justify-between"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)'
              }}
            >
              <div>
                <div className="flex items-center justify-between text-xs font-semibold mb-2">
                  <span style={{ color: 'var(--color-text-soft)' }}>QUESTION 1 OF {featuredSample.questions.length}</span>
                  <span className="px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-primary-soft)', color: 'var(--color-primary)' }}>
                    {sampleFirstQ.type}
                  </span>
                </div>
                <p className="font-semibold text-sm sm:text-base mb-4" style={{ color: 'var(--color-ink)' }}>
                  {sampleFirstQ.stem}
                </p>

                <div className="space-y-2.5">
                  {sampleFirstQ.options.map((opt) => {
                    const isPicked = previewSelected === opt.letter;
                    const isRight = opt.letter === sampleFirstQ.correctLetter;
                    const showResult = previewSelected !== null;

                    let borderCol = 'var(--color-border-strong)';
                    let bgCol = 'var(--color-surface)';
                    if (showResult && isRight) {
                      borderCol = 'var(--color-correct)';
                      bgCol = 'var(--color-correct-soft)';
                    } else if (showResult && isPicked && !isRight) {
                      borderCol = 'var(--color-wrong)';
                      bgCol = 'var(--color-wrong-soft)';
                    }

                    return (
                      <div key={opt.letter}>
                        <button
                          type="button"
                          onClick={() => setPreviewSelected(opt.letter)}
                          className="w-full text-left p-3 rounded-xl border text-xs sm:text-sm transition-all flex items-start gap-2.5 cursor-pointer"
                          style={{ borderColor: borderCol, backgroundColor: bgCol }}
                        >
                          <span
                            className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                            style={{
                              backgroundColor: 'var(--color-bg)',
                              color: 'var(--color-ink)'
                            }}
                          >
                            {opt.letter}
                          </span>
                          <span style={{ color: 'var(--color-text)' }}>{opt.text}</span>
                        </button>
                        {showResult && (isPicked || isRight) && (
                          <p
                            className="mt-1.5 px-3 py-2 rounded-lg text-xs leading-relaxed"
                            style={{
                              backgroundColor: 'var(--color-bg)',
                              color: isRight ? 'var(--color-correct)' : 'var(--color-wrong)'
                            }}
                          >
                            <strong>
                              {opt.letter} — {isRight ? 'correct' : 'wrong'}:
                            </strong>{' '}
                            <span style={{ color: 'var(--color-text-muted)' }}>{opt.explanation}</span>
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 pt-3 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-soft)' }}>
                  {previewSelected ? 'Click any option to compare explanations' : 'Pick an option for instant feedback'}
                </span>
                <Link to={`/test/${featuredSample.id}`} className="font-semibold hover:underline" style={{ color: 'var(--color-primary)' }}>
                  All {featuredSample.questions.length} questions →
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Aspirant Testimonials */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-display text-2xl font-semibold" style={{ color: 'var(--color-ink)' }}>
              Used daily by CAT 99%ilers &amp; GMAT 705+ scorers
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Active reading meets ruthless option elimination.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              quote:
                'Turning my daily Aeon essay into a 4-question CAT set broke my habit of passive reading. The per-option distractor explanations read just like real VARC analysis.',
              who: 'Rohan Deshmukh',
              tag: 'CAT 99.64 %ile · VARC 99.8'
            },
            {
              quote:
                'GMAT Focus 5-option inference traps always tripped me on dense philosophy passages. Eliminating options with strike-through in PracticeRC fixed my pacing.',
              who: 'Ananya Krishnan',
              tag: 'GMAT Focus 715 (V88)'
            },
            {
              quote:
                'Having all 60 CAT 2021–2025 PYQ passage slots plus the VARC percentile calculator in one clean dark-mode workspace saved hours every week.',
              who: 'Siddharth Verma',
              tag: 'IIM Bangalore Admit'
            }
          ].map((rev) => (
            <div key={rev.who} className="rc-card p-5 flex flex-col justify-between gap-4">
              <div>
                <div className="flex items-center gap-0.5 mb-3" style={{ color: 'var(--color-gold)' }}>
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-3.5 h-3.5 fill-current" />
                  ))}
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text)' }}>
                  “{rev.quote}”
                </p>
              </div>
              <div className="pt-3 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--color-ink)' }}>
                  {rev.who}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-primary)' }}>
                  {rev.tag}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
