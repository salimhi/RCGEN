import type { ExamType, DifficultyLevel, RCQuestion, RCOption } from '../types.ts';
import { shuffleQuestionsAndOptions, cryptoRng } from './questionPlan.ts';
import { STOP_WORDS } from './textNorm.ts';

const TOPIC_LEXICON: Record<string, string[]> = {
  'Philosophy': ['epistemology', 'moral', 'ethics', 'consciousness', 'truth', 'reason', 'rationality', 'mind', 'metaphysics', 'virtue', 'justice', 'self', 'agency', 'philosopher', 'scepticism', 'stoic'],
  'Economics & Social Theory': ['market', 'economy', 'capital', 'price', 'labour', 'labor', 'inequality', 'institution', 'incentive', 'trade', 'commodity', 'growth', 'policy', 'wealth', 'social', 'public'],
  'Science & Evolution': ['evolution', 'species', 'biology', 'genetic', 'organism', 'adaptation', 'brain', 'quantum', 'climate', 'ecology', 'physics', 'experiment', 'hypothesis', 'cell', 'selection'],
  'History & Culture': ['century', 'empire', 'colonial', 'archive', 'historian', 'medieval', 'ancient', 'tradition', 'ritual', 'monument', 'civilisation', 'civilization', 'revolution', 'dynasty'],
  'Technology & AI': ['algorithm', 'digital', 'platform', 'software', 'machine', 'artificial', 'intelligence', 'automation', 'data', 'network', 'computation', 'model', 'tech', 'interface'],
  'Literature & Aesthetics': ['novel', 'poetry', 'narrative', 'aesthetic', 'art', 'fiction', 'author', 'reader', 'literary', 'language', 'metaphor', 'translation', 'painting', 'music', 'critic']
};

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'\u201C\u2018])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

export function normalizeParagraphs(rawText: string): { paragraphs: string[]; startsMidWord: boolean } {
  const cleaned = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .trim();

  let rawParas = cleaned
    .split(/\n\s*\n+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 35);

  if (rawParas.length === 1 && rawParas[0].split(/\s+/).length > 160) {
    const sentences = splitSentences(rawParas[0]);
    const chunkSize = Math.max(3, Math.ceil(sentences.length / 4));
    rawParas = [];
    for (let i = 0; i < sentences.length; i += chunkSize) {
      rawParas.push(sentences.slice(i, i + chunkSize).join(' '));
    }
  }

  // Check if first paragraph starts with a lowercase letter (e.g. pasted drop-cap issue)
  const startsMidWord = rawParas.length > 0 && /^[a-z]/.test(rawParas[0]);

  rawParas = rawParas.map((p) => {
    if (/^[a-z]/.test(p)) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }
    return p;
  });

  const result: string[] = [];
  let wordsSoFar = 0;
  for (const p of rawParas) {
    const wc = p.split(/\s+/).length;
    if (result.length >= 3 && wordsSoFar + wc > 820) break;
    result.push(p);
    wordsSoFar += wc;
    if (result.length >= 6) break;
  }

  return {
    paragraphs: result.length > 0 ? result : [cleaned],
    startsMidWord,
  };
}

export function detectTopic(text: string): string {
  const lower = text.toLowerCase();
  let bestTopic = 'Philosophy';
  let bestScore = -1;
  for (const [topic, words] of Object.entries(TOPIC_LEXICON)) {
    let score = 0;
    for (const w of words) {
      const regex = new RegExp(`\\b${w}`, 'gi');
      const matches = lower.match(regex);
      if (matches) score += matches.length;
    }
    if (score > bestScore) {
      bestScore = score;
      bestTopic = topic;
    }
  }
  return bestTopic;
}

function extractTopTerms(text: string, count = 8): string[] {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOP_WORDS.has(w));

  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => w);
}

function clipClause(sentence: string, maxWords = 20): string {
  if (!sentence) return '';
  const cleaned = sentence.replace(/^["'\u201C\u2018]+|["'\u201D\u2019.!?]+$/g, '').trim();
  const words = cleaned.split(/\s+/);
  if (words.length <= maxWords) return cleaned;
  return words.slice(0, maxWords).join(' ') + '…';
}

function summarizeSentenceCore(sentence: string): string {
  if (!sentence) return 'the conventional account overlooks a structural constraint';
  const cleaned = sentence
    .replace(/^(However|Yet|But|Nevertheless|Moreover|Furthermore|Indeed|Instead|Consequently|Therefore),?\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
  const words = cleaned.split(/\s+/);
  if (words.length <= 24) return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return words.slice(0, 24).join(' ').replace(/[,;:]$/, '');
}

export interface BuildQuestionsOptions {
  paragraphs: string[];
  title?: string;
  topic?: string;
  examType: ExamType;
  difficulty?: DifficultyLevel;
  focusMode?: string;
  rng?: () => number;
}

export function buildExamQuestions({
  paragraphs,
  topic = 'Philosophy',
  examType,
  focusMode,
  rng = cryptoRng,
}: BuildQuestionsOptions): RCQuestion[] {
  const effectiveRng = rng || cryptoRng;
  const allText = paragraphs.join(' ');
  const paraSentences = paragraphs.map((p) => splitSentences(p));
  const flatSentences = paraSentences.flat();
  const topTerms = extractTopTerms(allText, 8);
  const primaryTerm = topTerms[0] || topic.toLowerCase();
  const secondaryTerm = topTerms[1] || 'institutional practice';
  const tertiaryTerm = topTerms[2] || 'empirical interpretation';

  const contrastRegex = /\b(however|yet|but|whereas|rather than|obscures|instead|contrary|misnamed|paradox|not merely|deeper)\b/i;
  const concessionRegex = /\b(although|though|while|to that extent|admittedly|certainly|granted|not empty|far from hollow|understandable|indispensable)\b/i;
  const causalRegex = /\b(because|therefore|consequently|follows from|accounts for|stems from|explains why|implies)\b/i;

  const pivotSentence =
    flatSentences.find((s, idx) => idx > 0 && contrastRegex.test(s)) ||
    paraSentences[1]?.[0] ||
    flatSentences[Math.min(2, flatSentences.length - 1)] ||
    paragraphs[0];

  const openingSentence = paraSentences[0]?.[0] || paragraphs[0];
  const closingSentence =
    paraSentences[paraSentences.length - 1]?.slice(-1)[0] ||
    flatSentences[flatSentences.length - 1] ||
    pivotSentence;

  const concessionSentence =
    flatSentences.find((s) => concessionRegex.test(s)) ||
    paraSentences[Math.min(2, paraSentences.length - 1)]?.[0] ||
    openingSentence;

  const causalSentence =
    flatSentences.find((s) => causalRegex.test(s)) ||
    paraSentences[Math.min(1, paraSentences.length - 1)]?.[1] ||
    pivotSentence;

  const targetParaIdx = paragraphs.length >= 3 ? 2 : Math.min(1, paragraphs.length - 1);
  const targetParaSnippet = clipClause(paraSentences[targetParaIdx]?.[0] || paragraphs[targetParaIdx], 6);

  const isGmat = examType === 'GMAT';

  const pivotCore = summarizeSentenceCore(pivotSentence);
  const closingCore = summarizeSentenceCore(closingSentence);
  const openingSnippet = clipClause(openingSentence, 12);
  const pivotSnippet = clipClause(pivotSentence, 14);
  const concessionSnippet = clipClause(concessionSentence, 14);
  const causalSnippet = clipClause(causalSentence, 14);

  // Q1: Main Idea & Primary Purpose (Key: B)
  const q1Options: RCOption[] = [
    {
      letter: 'A',
      text: `To catalogue recent empirical advances in ${primaryTerm} and argue that traditional frameworks have been rendered wholly obsolete.`,
      flawTag: 'Too Extreme',
      explanation: `Wrong — Too extreme and misstates the opening premise. While the author opens by noting "${openingSnippet}", they never claim prior frameworks are wholly obsolete, advocating nuanced critique instead.`
    },
    {
      letter: 'B',
      text: `To challenge an overly simplified assumption regarding ${primaryTerm} by showing how structural factors shape ${secondaryTerm} and explaining the deeper consequences of overlooking them.`,
      flawTag: 'Correct Key',
      explanation: `Correct — Synthesizes both movements of the author's argument: from probing a linear assumption ("${pivotSnippet}") to establishing structural consequences and final implications ("${clipClause(closingSentence, 14)}").`
    },
    {
      letter: 'C',
      text: `To demonstrate that disagreements surrounding ${primaryTerm} arise chiefly from personal bias rather than from structural features of ${secondaryTerm}.`,
      flawTag: 'Reversal',
      explanation: `Wrong — Reverses the author's causal analysis. The text attributes divergence to structural dynamics ("${causalSnippet}") rather than individual bias.`
    },
    {
      letter: 'D',
      text: `To advocate abandoning analytical study of ${primaryTerm} altogether on the ground that ${tertiaryTerm} resists objective measurement.`,
      flawTag: 'Overshoots Claim',
      explanation: `Wrong — Unwarranted generalization. Even while highlighting inherent limits ("${concessionSnippet}"), the text cautions against fatalism.`
    }
  ];
  if (isGmat) {
    q1Options.push({
      letter: 'E',
      text: `To reconcile two competing schools of thought on ${primaryTerm} by proving that their empirical predictions are identical in practice.`,
      flawTag: 'Distortion',
      explanation: `Wrong — Distorts the passage. The author clarifies conceptual distinctions rather than claiming rival perspectives converge identically.`
    });
  }

  // Q2: Logical Inference (Key: C)
  const q2Options: RCOption[] = [
    {
      letter: 'A',
      text: `Practitioners concerned with ${primaryTerm} have deliberately concealed defects in ${secondaryTerm} to protect entrenched interests.`,
      flawTag: 'Unsupported Motive',
      explanation: `Wrong — Attributes deliberate malfeasance unsupported by the text. The discussion in "${concessionSnippet}" notes structural oversight rather than intentional deceit.`
    },
    {
      letter: 'B',
      text: `Increasing technical precision in measuring ${primaryTerm} automatically resolves underlying disagreements about ${tertiaryTerm}.`,
      flawTag: 'Contradicts Text',
      explanation: `Wrong — Contradicts the central pivot ("${pivotSnippet}"), which argues that greater technical volume does not guarantee conceptual agreement.`
    },
    {
      letter: 'C',
      text: `An approach to ${primaryTerm} can perform credibly on narrow operational criteria while still failing to account for crucial structural dimensions of ${secondaryTerm}.`,
      flawTag: 'Correct Key',
      explanation: `Correct — Directly supported by the text's concession: narrow operational metrics can succeed ("${concessionSnippet}") even while deeper dimensions (${closingCore}) remain uncaptured.`
    },
    {
      letter: 'D',
      text: `No meaningful distinction can be drawn between ${primaryTerm} and ${secondaryTerm} under any historical circumstances.`,
      flawTag: 'Absolute Quantifier',
      explanation: `Wrong — Flawed by extreme universal phrasing ("under any historical circumstances"). The author explores distinct, interacting dynamics.`
    }
  ];
  if (isGmat) {
    q2Options.push({
      letter: 'E',
      text: `Earlier observers understood ${primaryTerm} more accurately than contemporary specialists because they relied less on formal tools.`,
      flawTag: 'Unsupported Comparison',
      explanation: `Wrong — Unwarranted historical comparison. Historical parallels demonstrate recurring structural challenges, not superior ancient insight.`
    });
  }

  // Q3: Paragraph Function (Key: A) - Note: NO Paragraph numbers! Quoting beginning snippet.
  const q3Options: RCOption[] = [
    {
      letter: 'A',
      text: `Contextualize the central argument by showing that the structural tension surrounding ${primaryTerm} is not merely a fleeting anomaly, while clarifying what specifically sharpens its impact.`,
      flawTag: 'Correct Key',
      explanation: `Correct — Accurately describes the rhetorical function of the paragraph that begins "${targetParaSnippet}". It broadens the discussion and establishes underlying institutional incentives.`
    },
    {
      letter: 'B',
      text: `Retract the critique advanced earlier in the passage and endorse the conventional view of ${primaryTerm} without reservation.`,
      flawTag: 'Reversal',
      explanation: `Wrong — Reversal. The paragraph sharpens the author's critique rather than rescinding it.`
    },
    {
      letter: 'C',
      text: `Provide a statistical inventory proving that ${secondaryTerm} has declined steadily across every domain studied.`,
      flawTag: 'Fabricated Detail',
      explanation: `Wrong — Fabricates an empirical statistical inventory where the passage relies on historical and conceptual synthesis.`
    },
    {
      letter: 'D',
      text: `Digress from the main discussion of ${primaryTerm} in order to summarize biographical disputes among rival theorists.`,
      flawTag: 'Misreads Function',
      explanation: `Wrong — Misreads authorial intent. The section directly bolsters the structural argument rather than detailing biographical disputes.`
    }
  ];
  if (isGmat) {
    q3Options.push({
      letter: 'E',
      text: `Introduce a counterexample that the author acknowledges cannot be explained by the overarching thesis.`,
      flawTag: 'Distortion',
      explanation: `Wrong — The author integrates historical and contemporary observations into the framework rather than conceding an anomalous failure.`
    });
  }

  // Q4: Author's Tone (Key: D)
  const q4Options: RCOption[] = [
    {
      letter: 'A',
      text: `Polemical dismissal that treats defenders of conventional views on ${primaryTerm} as intellectually dishonest.`,
      flawTag: 'Wrong Tone',
      explanation: `Wrong — Misjudges the tone. The author acknowledges partial validity in conventional premises ("${concessionSnippet}") before detailing their systemic limits.`
    },
    {
      letter: 'B',
      text: `Unqualified enthusiasm for emerging reforms in ${secondaryTerm} coupled with confidence that all trade-offs will vanish.`,
      flawTag: 'Wrong Tone',
      explanation: `Wrong — Mischaracterizes the tone as uncritical optimism, conflicting with the author's deliberate, cautionary conclusion ("${clipClause(closingSentence, 13)}").`
    },
    {
      letter: 'C',
      text: `Detached neutrality that catalogues competing claims about ${primaryTerm} without taking an evaluative stance.`,
      flawTag: 'Understates Stance',
      explanation: `Wrong — The author advances a distinct analytical diagnosis ("${pivotSnippet}") rather than maintaining indifferent balance.`
    },
    {
      letter: 'D',
      text: `Measured analytical critique that grants the partial force of familiar defences while exposing their deeper structural limits.`,
      flawTag: 'Correct Key',
      explanation: `Correct — Captures both the judicious style and the conceptual substance: acknowledging valid points ("${concessionSnippet}") while demonstrating why ${pivotCore}.`
    }
  ];
  if (isGmat) {
    q4Options.push({
      letter: 'E',
      text: `Resigned pessimism holding that human institutions are incapable of reflecting critically on ${primaryTerm}.`,
      flawTag: 'Too Fatalistic',
      explanation: `Wrong — Diagnosing systemic constraints is not fatalism. The conclusion emphasizes constructive awareness of boundaries.`
    });
  }

  const pickVariant = (variants: string[]) => variants[Math.floor(effectiveRng() * variants.length)];

  const q1Variants = [
    'Which of the following best states the primary purpose of the passage?',
    'Which of the following best captures the central idea of the passage?',
    'The passage as a whole is primarily concerned with which of the following?'
  ];
  if (focusMode === 'Inference & Implicit Logic') {
    q1Variants.unshift('Which of the following best captures the overarching proposition toward which the passage builds?');
  }

  const q2Variants = [
    'Which of the following can most reasonably be inferred from the passage?',
    'Which of the following assertions is most directly supported by the discussion in the passage?',
    'The arguments presented in the passage most strongly suggest which of the following conclusions?'
  ];

  const q3Variants = [
    `In the context of the passage as a whole, the paragraph that begins "${targetParaSnippet}..." primarily serves to:`,
    `The author includes the paragraph beginning "${targetParaSnippet}..." mainly in order to:`,
    `Which of the following best describes the rhetorical function of the paragraph that begins "${targetParaSnippet}..."?`
  ];

  const q4Variants = [
    "The author's overall attitude or tone throughout the passage is best described as:",
    "Which of the following best characterizes the author's tone in presenting the central argument?",
    "The analytical stance adopted by the author across the passage is most accurately described as:"
  ];

  const questions: RCQuestion[] = [
    {
      id: 'q1',
      type: 'Main Idea',
      stem: pickVariant(q1Variants),
      correctLetter: 'B',
      options: q1Options
    },
    {
      id: 'q2',
      type: 'Inference',
      stem: pickVariant(q2Variants),
      correctLetter: 'C',
      options: q2Options
    },
    {
      id: 'q3',
      type: 'Paragraph Function',
      stem: pickVariant(q3Variants),
      correctLetter: 'A',
      options: q3Options
    },
    {
      id: 'q4',
      type: 'Tone & Attitude',
      stem: pickVariant(q4Variants),
      correctLetter: 'D',
      options: q4Options
    }
  ];

  if (isGmat) {
    const q5Variants = [
      `Which of the following findings, if established, would most strongly support the author's concluding claim ("${clipClause(closingSentence, 15)}")?`,
      'Which of the following, if true, provides the strongest additional support for the overarching argument in the passage?',
      `The author's conclusion ("${clipClause(closingSentence, 15)}") would be most strengthened if which of the following were verified?`
    ];

    questions.push({
      id: 'q5',
      type: 'Strengthen / Weaken',
      stem: pickVariant(q5Variants),
      correctLetter: 'E',
      options: [
        {
          letter: 'A',
          text: `Organizations that rely exclusively on informal intuition outperform all peers across every short-term benchmark.`,
          flawTag: 'Overshoots Claim',
          explanation: `Wrong — The author does not advocate unguided intuition; an extreme assertion that intuition always wins contradicts the text.`
        },
        {
          letter: 'B',
          text: `Most practitioners working on ${primaryTerm} agree on standardized definitions of introductory technical terms.`,
          flawTag: 'Irrelevant Scope',
          explanation: `Wrong — Introductory semantic consensus does not address whether underlying evaluation paradigms are distorted.`
        },
        {
          letter: 'C',
          text: `Public interest in ${primaryTerm} fluctuates cyclically in response to media coverage rather than academic publications.`,
          flawTag: 'Out of Scope',
          explanation: `Wrong — Cyclical media reception is outside the passage's causal claims regarding systemic cognitive evaluation.`
        },
        {
          letter: 'D',
          text: `Computational costs associated with analyzing ${secondaryTerm} have fallen by half over the past decade.`,
          flawTag: 'Weakens / Neutral',
          explanation: `Wrong — Reduced processing costs reflect operational throughput, which the author distinguishes from critical understanding.`
        },
        {
          letter: 'E',
          text: `Fields that optimized solely for easily tracked indicators of ${primaryTerm} repeatedly missed compounding systemic failures until external reviews examined unmeasured assumptions.`,
          flawTag: 'Correct Key',
          explanation: `Correct — Directly reinforces the concluding argument ("${clipClause(closingSentence, 14)}") by providing empirical proof of the danger of ignoring unquantified boundary conditions.`
        }
      ]
    });
  }

  return shuffleQuestionsAndOptions(questions, isGmat, effectiveRng);
}

