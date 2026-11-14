import { getDataLayer, DATA_MODE } from '../server/data-layer.js';
import { getSupabase } from '../server/db-client.js';
import { getClientKey, getUsageStore } from '../server/usage-store.js';
import { safeFetchArticleHtml } from '../server/scraper.js';
import { generateExamQuestionsWithAi } from '../server/ai-questions.js';

const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'all', 'almost', 'alone', 'along', 'already', 'also',
  'although', 'always', 'among', 'an', 'and', 'another', 'any', 'anyone', 'anything', 'are', 'around',
  'as', 'at', 'back', 'be', 'became', 'because', 'become', 'becomes', 'been', 'before', 'began', 'being',
  'below', 'between', 'beyond', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does',
  'doing', 'done', 'down', 'during', 'each', 'either', 'else', 'enough', 'even', 'ever', 'every',
  'everyone', 'everything', 'few', 'first', 'for', 'four', 'from', 'further', 'get', 'give', 'given',
  'go', 'goes', 'going', 'gone', 'got', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'however', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'keep', 'kept', 'know', 'known', 'large', 'last', 'later', 'least', 'less', 'let', 'like',
  'likely', 'long', 'made', 'make', 'makes', 'making', 'many', 'may', 'me', 'merely', 'might', 'more',
  'most', 'mostly', 'much', 'must', 'my', 'myself', 'near', 'nearly', 'need', 'neither', 'never', 'new',
  'next', 'no', 'nobody', 'none', 'nor', 'not', 'nothing', 'now', 'of', 'off', 'often', 'on', 'once',
  'one', 'ones', 'only', 'onto', 'or', 'other', 'others', 'otherwise', 'ought', 'our', 'ours', 'out',
  'over', 'own', 'part', 'particular', 'perhaps', 'place', 'point', 'put', 'quite', 'rather', 'really',
  'right', 'said', 'same', 'saw', 'say', 'saying', 'says', 'second', 'see', 'seem', 'seemed', 'seems',
  'seen', 'several', 'shall', 'she', 'should', 'show', 'shown', 'side', 'since', 'small', 'so', 'some',
  'someone', 'something', 'sometimes', 'still', 'such', 'take', 'taken', 'taking', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'therefore', 'these', 'they', 'thing',
  'things', 'think', 'third', 'this', 'those', 'though', 'three', 'through', 'thus', 'to', 'together',
  'too', 'toward', 'towards', 'turn', 'turned', 'two', 'under', 'until', 'up', 'upon', 'us', 'use',
  'used', 'using', 'very', 'was', 'way', 'ways', 'we', 'well', 'were', 'what', 'whatever', 'when',
  'where', 'whereas', 'whether', 'which', 'while', 'who', 'whole', 'whom', 'whose', 'why', 'will',
  'with', 'within', 'without', 'would', 'yet', 'you', 'your', 'yours'
]);

const TOPIC_LEXICON = {
  'Philosophy': ['epistemology', 'moral', 'ethics', 'consciousness', 'truth', 'reason', 'rationality', 'mind', 'metaphysics', 'virtue', 'justice', 'self', 'agency', 'philosopher', 'scepticism', 'stoic'],
  'Economics & Social Theory': ['market', 'economy', 'capital', 'price', 'labour', 'labor', 'inequality', 'institution', 'incentive', 'trade', 'commodity', 'growth', 'policy', 'wealth', 'social', 'public'],
  'Science & Evolution': ['evolution', 'species', 'biology', 'genetic', 'organism', 'adaptation', 'brain', 'quantum', 'climate', 'ecology', 'physics', 'experiment', 'hypothesis', 'cell', 'selection'],
  'History & Culture': ['century', 'empire', 'colonial', 'archive', 'historian', 'medieval', 'ancient', 'tradition', 'ritual', 'monument', 'civilisation', 'civilization', 'revolution', 'dynasty'],
  'Technology & AI': ['algorithm', 'digital', 'platform', 'software', 'machine', 'artificial', 'intelligence', 'automation', 'data', 'network', 'computation', 'model', 'tech', 'interface'],
  'Literature & Aesthetics': ['novel', 'poetry', 'narrative', 'aesthetic', 'art', 'fiction', 'author', 'reader', 'literary', 'language', 'metaphor', 'translation', 'painting', 'music', 'critic']
};

function stripHtmlToParagraphs(html) {
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    title = title.split(/\s+[|\-–—]\s+/)[0].trim();
  }

  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ');

  const pMatches = [...cleaned.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)];
  const paras = pMatches
    .map((m) =>
      m[1]
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
        .replace(/&mdash;|&ndash;/g, '—')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((p) => p.split(/\s+/).length >= 24 && !/cookie|subscribe|newsletter|sign in|copyright/i.test(p));

  return { title, text: paras.slice(0, 8).join('\n\n') };
}

function normalizeParagraphs(rawText) {
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

  // Handle paragraph beginning with a lowercase letter (e.g. pasted drop-cap issue)
  rawParas = rawParas.map((p) => {
    if (/^[a-z]/.test(p)) {
      return p.charAt(0).toUpperCase() + p.slice(1);
    }
    return p;
  });

  // Cap at ~780 words for exam-standard passage length while keeping full paragraph boundaries
  const result = [];
  let wordsSoFar = 0;
  for (const p of rawParas) {
    const wc = p.split(/\s+/).length;
    if (result.length >= 3 && wordsSoFar + wc > 820) break;
    result.push(p);
    wordsSoFar += wc;
    if (result.length >= 6) break;
  }

  return result.length > 0 ? result : [cleaned];
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"'\u201C\u2018])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

function detectTopic(text) {
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

function extractTopTerms(text, count = 8) {
  const words = text
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 5 && !STOP_WORDS.has(w));

  const freq = new Map();
  for (const w of words) {
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([w]) => w);
}

function clipClause(sentence, maxWords = 20) {
  if (!sentence) return '';
  const cleaned = sentence.replace(/^["'\u201C\u2018]+|["'\u201D\u2019.!?]+$/g, '').trim();
  const words = cleaned.split(/\s+/);
  if (words.length <= maxWords) return cleaned;
  return words.slice(0, maxWords).join(' ') + '…';
}

function summarizeSentenceCore(sentence) {
  if (!sentence) return 'the conventional account overlooks a structural constraint';
  const cleaned = sentence
    .replace(/^(However|Yet|But|Nevertheless|Moreover|Furthermore|Indeed|Instead|Consequently|Therefore),?\s+/i, '')
    .replace(/[.!?]+$/, '')
    .trim();
  const words = cleaned.split(/\s+/);
  if (words.length <= 24) return cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  return words.slice(0, 24).join(' ').replace(/[,;:]$/, '') + '';
}

function synthesizeTopicEssay(title, topic, sourceWork) {
  const cleanTitle = title || 'Structural Complexity and Human Judgment';
  const subjectLower = cleanTitle.toLowerCase();

  return [
    `Discussions of ${subjectLower} routinely begin from a reassuringly linear premise: that once observers gather finer empirical measurements, disagreements about underlying causes will naturally converge toward consensus. Across much of modern inquiry${sourceWork ? `, including debates shaped by ${sourceWork},` : ''} that expectation has functioned less as a tested finding than as an organizing faith. To a point, the faith is understandable. Better instruments and denser archives do eliminate crude factual errors, and no serious analyst proposes returning to impressionistic guesswork. What the linear view obscures, however, is that expanding the volume of evidence frequently multiplies the interpretive frameworks capable of accommodating it.`,
    `This divergence is not an accidental byproduct of careless reasoning; it follows from the structure of complex phenomena themselves. Whenever outcomes depend on interacting feedback loops rather than isolated variables, the same observable pattern can be generated by markedly different mechanisms. Analysts trained in one disciplinary tradition consequently treat as decisive signal what rivals dismiss as boundary noise. Were the disagreement merely about missing data, larger samples would settle it. Because the disagreement concerns which causal architecture makes the data intelligible in the first place, additional precision often sharpens rival readings instead of reconciling them.`,
    `Historical parallels make the pattern easier to see. Earlier generations of scholars confronting rapid institutional or ecological shifts assumed that newly standardized metrics would depoliticize judgment and replace interpretive dispute with calculation. Yet the archival record reveals almost the opposite trajectory: the more granular the measurement regime became, the more fiercely practitioners contested which baseline counted as normal and whose thresholds defined acceptable risk. What altered over time was not the presence of value-laden selection, but the technical vocabulary behind which that selection operated.`,
    `Defenders of strictly quantitative adjudication reply that formal models at least force assumptions into the open where critics can inspect them. That defence is far from hollow, and it explains why formalization remains indispensable where intuition alone is prone to self-serving bias. Still, transparency about internal parameters does not establish the adequacy of the frame itself. What cannot easily be parameterized—diffuse long-term costs, shifting cultural meanings, or second-order adaptations by participants—tends to drop silently out of the calculus, acquiring the false appearance of irrelevance simply because it resists neat notation.`,
    `The deeper lesson concerning ${subjectLower} is therefore neither counsel of despair nor hostility toward rigorous evidence. Rather, mature inquiry requires holding empirical precision and conceptual humility together: recognizing that every explanatory model illuminates certain regularities precisely by bracketing others. A discipline that mistakes the tractability of its chosen indicators for completeness does not become more objective; it merely renders itself blind to the boundary conditions on which its own successes depend.`
  ];
}

function buildExamQuestions({ paragraphs, title, topic, examType, difficulty, focusMode }) {
  const allText = paragraphs.join(' ');
  const paraSentences = paragraphs.map((p) => splitSentences(p));
  const flatSentences = paraSentences.flat();
  const topTerms = extractTopTerms(allText, 8);
  const primaryTerm = topTerms[0] || topic.toLowerCase();
  const secondaryTerm = topTerms[1] || 'institutional practice';
  const tertiaryTerm = topTerms[2] || 'empirical interpretation';

  // Identify discourse pivots
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
  const targetParaNum = targetParaIdx + 1;
  const targetParaSnippet = clipClause(paraSentences[targetParaIdx]?.[0] || paragraphs[targetParaIdx], 13);

  const isGmat = examType === 'GMAT';
  const letters = isGmat ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];

  const pivotCore = summarizeSentenceCore(pivotSentence);
  const closingCore = summarizeSentenceCore(closingSentence);
  const openingSnippet = clipClause(openingSentence, 12);
  const pivotSnippet = clipClause(pivotSentence, 14);
  const concessionSnippet = clipClause(concessionSentence, 14);
  const causalSnippet = clipClause(causalSentence, 14);

  // Q1: Main Idea & Primary Purpose (Key: B)
  const q1Options = [
    {
      letter: 'A',
      text: `To catalogue recent empirical advances in ${primaryTerm} and argue that traditional frameworks have been rendered wholly obsolete.`,
      flawTag: 'Too Extreme',
      explanation: `Wrong — Too extreme and misstates the opening setup. While the passage opens by noting "${openingSnippet}", it never claims prior frameworks are "wholly obsolete"; instead, it qualifies conventional assumptions and examines what they leave out.`
    },
    {
      letter: 'B',
      text: `To challenge an overly simplified assumption regarding ${primaryTerm} by showing how structural factors shape ${secondaryTerm} and explaining the deeper consequences of overlooking them.`,
      flawTag: 'Correct Key',
      explanation: `Correct — Joins both halves of the author's argument. The passage moves from questioning a surface view ("${pivotSnippet}") to tracing its structural mechanism and concluding implication ("${clipClause(closingSentence, 14)}").`
    },
    {
      letter: 'C',
      text: `To demonstrate that disagreements surrounding ${primaryTerm} arise chiefly from personal bias rather than from structural features of ${secondaryTerm}.`,
      flawTag: 'Reversal',
      explanation: `Wrong — Reverses the passage's explicit causal logic. The author locates the tension in structural conditions ("${causalSnippet}") rather than reducing it to isolated personal bias.`
    },
    {
      letter: 'D',
      text: `To advocate abandoning analytical study of ${primaryTerm} altogether on the ground that ${tertiaryTerm} resists objective measurement.`,
      flawTag: 'Overshoots Claim',
      explanation: `Wrong — Overshoots a measured critique into blanket rejection. Even where the passage highlights limits ("${concessionSnippet}"), it calls for more nuanced judgment rather than abandoning inquiry altogether.`
    }
  ];
  if (isGmat) {
    q1Options.push({
      letter: 'E',
      text: `To reconcile two competing schools of thought on ${primaryTerm} by proving that their empirical predictions are identical in practice.`,
      flawTag: 'Distortion',
      explanation: `Wrong — Unsubstantiated synthesis. The passage sharpens the distinction between surface assumptions and deeper structural realities rather than claiming rival views yield identical predictions.`
    });
  }

  // Q2: Logical Inference (Key: C)
  const q2Options = [
    {
      letter: 'A',
      text: `Practitioners concerned with ${primaryTerm} have deliberately concealed defects in ${secondaryTerm} to protect entrenched interests.`,
      flawTag: 'Unsupported Motive',
      explanation: `Wrong — Attributes bad faith where the passage describes a structural blind spot. Nothing in "${concessionSnippet}" establishes deliberate concealment.`
    },
    {
      letter: 'B',
      text: `Increasing technical precision in measuring ${primaryTerm} automatically resolves underlying disagreements about ${tertiaryTerm}.`,
      flawTag: 'Contradicts Text',
      explanation: `Wrong — Directly contradicts the passage's pivot ("${pivotSnippet}"), which explains why technical refinement or surface success alone does not settle the deeper issue.`
    },
    {
      letter: 'C',
      text: `An approach to ${primaryTerm} can perform credibly on narrow operational criteria while still failing to account for crucial structural dimensions of ${secondaryTerm}.`,
      flawTag: 'Correct Key',
      explanation: `Correct — Safely inferred from the author's concession-and-critique structure. The passage grants partial utility ("${concessionSnippet}") while showing that deeper aspects—namely that ${closingCore}—remain unaddressed.`
    },
    {
      letter: 'D',
      text: `No meaningful distinction can be drawn between ${primaryTerm} and ${secondaryTerm} under any historical circumstances.`,
      flawTag: 'Absolute Quantifier',
      explanation: `Wrong — Fails on the absolute phrasing "under any historical circumstances." The author analyzes how the two interact without collapsing them into identical concepts.`
    }
  ];
  if (isGmat) {
    q2Options.push({
      letter: 'E',
      text: `Earlier observers understood ${primaryTerm} more accurately than contemporary specialists because they relied less on formal tools.`,
      flawTag: 'Unsupported Comparison',
      explanation: `Wrong — Nostalgic overreach. Any historical comparison in the passage illustrates continuity of structural challenges, not superior accuracy achieved by avoiding tools.`
    });
  }

  // Q3: Paragraph / Structural Function (Key: A)
  const q3Options = [
    {
      letter: 'A',
      text: `Contextualize the central argument by showing that the structural tension surrounding ${primaryTerm} is not merely a fleeting anomaly, while clarifying what specifically sharpens its impact.`,
      flawTag: 'Correct Key',
      explanation: `Correct — Captures the exact rhetorical job of Paragraph ${targetParaNum} ("${targetParaSnippet}"). Rather than introducing an unrelated topic, it broadens and anchors the thesis developed in the preceding lines.`
    },
    {
      letter: 'B',
      text: `Retract the critique advanced earlier in the passage and endorse the conventional view of ${primaryTerm} without reservation.`,
      flawTag: 'Reversal',
      explanation: `Wrong — Paragraph ${targetParaNum} refines and deepens the author's thesis rather than retracting it; subsequent lines build directly upon that critique.`
    },
    {
      letter: 'C',
      text: `Provide a statistical inventory proving that ${secondaryTerm} has declined steadily across every domain studied.`,
      flawTag: 'Fabricated Detail',
      explanation: `Wrong — Invents an exhaustive statistical inventory absent from Paragraph ${targetParaNum} ("${targetParaSnippet}"), which operates conceptually and analytically.`
    },
    {
      letter: 'D',
      text: `Digress from the main discussion of ${primaryTerm} in order to summarize biographical disputes among rival theorists.`,
      flawTag: 'Misreads Function',
      explanation: `Wrong — Exam passages rarely include pointless digressions; Paragraph ${targetParaNum} directly advances the structural argument rather than offering biographical trivia.`
    }
  ];
  if (isGmat) {
    q3Options.push({
      letter: 'E',
      text: `Introduce a counterexample that the author acknowledges cannot be explained by the passage's overarching thesis.`,
      flawTag: 'Distortion',
      explanation: `Wrong — Even where nuances or counter-claims appear near Paragraph ${targetParaNum}, the author integrates them into the overarching framework rather than conceding defeat.`
    });
  }

  // Q4: Author's Tone / Evaluation of Counter-Position (Key: D)
  const q4Options = [
    {
      letter: 'A',
      text: `Polemical dismissal that treats defenders of conventional views on ${primaryTerm} as intellectually dishonest.`,
      flawTag: 'Wrong Tone',
      explanation: `Wrong — Too hostile. Notice how carefully the author weighs partial merits ("${concessionSnippet}") before showing why those merits stop short of resolving the core problem.`
    },
    {
      letter: 'B',
      text: `Unqualified enthusiasm for emerging reforms in ${secondaryTerm} coupled with confidence that all trade-offs will vanish.`,
      flawTag: 'Wrong Tone',
      explanation: `Wrong — Misses the passage's cautionary, analytical close ("${clipClause(closingSentence, 13)}"), which warns against naive optimism.`
    },
    {
      letter: 'C',
      text: `Detached neutrality that catalogues competing claims about ${primaryTerm} without taking an evaluative stance.`,
      flawTag: 'Understates Stance',
      explanation: `Wrong — The author clearly takes a reasoned position ("${pivotSnippet}"), diagnosing why the surface view falls short rather than remaining neutral.`
    },
    {
      letter: 'D',
      text: `Measured analytical critique that grants the partial force of familiar defences while exposing their deeper structural limits.`,
      flawTag: 'Correct Key',
      explanation: `Correct — Matches both the temperate register and argumentative architecture: the author concedes where a conventional point earns its keep ("${concessionSnippet}") yet demonstrates why ${pivotCore}.`
    }
  ];
  if (isGmat) {
    q4Options.push({
      letter: 'E',
      text: `Resigned pessimism holding that human institutions are incapable of reflecting critically on ${primaryTerm}.`,
      flawTag: 'Too Fatalistic',
      explanation: `Wrong — Highlighting difficulty or blind spots is not fatalism; the passage itself models the critical reflection needed to recognize those limits.`
    });
  }

  const questions = [
    {
      id: 'q1',
      type: 'Main Idea',
      stem: focusMode === 'Inference & Implicit Logic'
        ? 'Which of the following best captures the overarching proposition toward which the passage builds?'
        : 'Which of the following best states the primary purpose of the passage?',
      correctLetter: 'B',
      options: q1Options
    },
    {
      id: 'q2',
      type: 'Inference',
      stem: `Based on the passage, which of the following can most reasonably be inferred regarding ${primaryTerm}?`,
      correctLetter: 'C',
      options: q2Options
    },
    {
      id: 'q3',
      type: 'Paragraph Function',
      stem: `In the context of the passage as a whole, Paragraph ${targetParaNum} ("${targetParaSnippet}") primarily serves to:`,
      correctLetter: 'A',
      options: q3Options
    },
    {
      id: 'q4',
      type: 'Tone & Attitude',
      stem: `The author's attitude toward conventional accounts of ${primaryTerm} is best described as:`,
      correctLetter: 'D',
      options: q4Options
    }
  ];

  // Add 5th Critical Reasoning / Strengthen-Weaken question for GMAT Focus (5 questions × 5 options)
  if (isGmat) {
    questions.push({
      id: 'q5',
      type: 'Strengthen / Weaken',
      stem: `Which of the following findings, if established, would most strongly support the author's concluding claim ("${clipClause(closingSentence, 15)}")?`,
      correctLetter: 'E',
      options: [
        {
          letter: 'A',
          text: `Organizations that rely exclusively on informal intuition outperform all peers across every short-term benchmark.`,
          flawTag: 'Overshoots Claim',
          explanation: `Wrong — The author does not champion abandoning rigor for pure intuition; proving intuition always wins would contradict the passage's balanced stance.`
        },
        {
          letter: 'B',
          text: `Most practitioners working on ${primaryTerm} agree on standardized definitions of introductory technical terms.`,
          flawTag: 'Irrelevant Scope',
          explanation: `Wrong — Shared introductory vocabulary says nothing about whether deeper structural blind spots distort judgment.`
        },
        {
          letter: 'C',
          text: `Public interest in ${primaryTerm} fluctuates cyclically in response to media coverage rather than academic publications.`,
          flawTag: 'Out of Scope',
          explanation: `Wrong — Media attention cycles lie outside the passage's causal claim regarding structural limits and evaluation.`
        },
        {
          letter: 'D',
          text: `Computational costs associated with analyzing ${secondaryTerm} have fallen by half over the past decade.`,
          flawTag: 'Weakens / Neutral',
          explanation: `Wrong — Cheaper computation speaks only to technical capacity, which the passage explicitly distinguishes from conceptual adequacy.`
        },
        {
          letter: 'E',
          text: `Fields that optimized solely for easily tracked indicators of ${primaryTerm} repeatedly missed compounding systemic failures until external reviews examined unmeasured assumptions.`,
          flawTag: 'Correct Key',
          explanation: `Correct — Directly corroborates the passage's closing warning ("${clipClause(closingSentence, 14)}") by showing real-world consequences when unmeasured boundary conditions are ignored.`
        }
      ]
    });
  }

  // Adjust subtle stem rigor if difficulty === 'Brutal'
  if (difficulty === 'Brutal') {
    questions[1].stem = `All of the following claims would be incompatible with the author's reasoning EXCEPT:`;
  }

  return questions;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const store = getDataLayer();
    const usageStore = getUsageStore(DATA_MODE === 'supabase', getSupabase);
    const clientKey = getClientKey(req);
    const limitStatus = await usageStore.checkLimits(clientKey);

    if (!limitStatus.allowed) {
      return res.status(429).json({
        error: 'Too many generation requests. Rate limit is 60 requests per hour. Please try again later.'
      });
    }

    const {
      text = '',
      url = '',
      title: inputTitle = '',
      topic: inputTopic = '',
      examType = 'CAT',
      difficulty = 'Challenging',
      focusMode = 'Balanced Exam Mix',
      userId = null,
      pyqCatalogId = null
    } = req.body || {};

    let rawText = text.trim();
    let derivedTitle = inputTitle.trim();
    let sourceLabel = 'Custom Pasted Essay';
    let category = 'custom';
    let pyqYear = null;
    let pyqSlot = null;
    let forcedTopic = null;

    // Check passage length cap (1000 words maximum)
    if (rawText && rawText.split(/\s+/).filter(Boolean).length > 1000) {
      return res.status(400).json({
        error: 'Passage length exceeds maximum limit of 1000 words. Please shorten the passage.'
      });
    }

    // Mode 1: On-demand CAT PYQ synthesis if pyqCatalogId provided
    if (pyqCatalogId) {
      const pyqRow = await store.getPyqById(Number(pyqCatalogId));
      if (!pyqRow) {
        return res.status(404).json({ error: 'PYQ catalog entry not found' });
      }
      if (pyqRow.linked_test_id) {
        const existingTest = await store.getTestById(pyqRow.linked_test_id);
        if (existingTest) return res.status(200).json(existingTest);
      }
      derivedTitle = pyqRow.title;
      forcedTopic = pyqRow.topic;
      sourceLabel = `CAT ${pyqRow.year} · Slot ${pyqRow.slot}`;
      category = 'pyq';
      pyqYear = pyqRow.year;
      pyqSlot = pyqRow.slot;
      const synthesizedParas = synthesizeTopicEssay(pyqRow.title, pyqRow.topic, pyqRow.source_work);
      rawText = synthesizedParas.join('\n\n');
    }

    // Mode 2: URL import via safe scraper
    if (!rawText && url.trim()) {
      try {
        const { html, finalUrl } = await safeFetchArticleHtml(url.trim());
        const extracted = stripHtmlToParagraphs(html);
        if (!extracted.text || extracted.text.split(/\s+/).length < 90) {
          return res.status(400).json({
            error: 'That page protects or hides its body text behind client scripts. Paste the article paragraphs directly instead.'
          });
        }
        rawText = extracted.text;
        if (!derivedTitle && extracted.title) derivedTitle = extracted.title;
        try {
          const host = new URL(finalUrl).hostname.replace(/^www\./, '');
          sourceLabel = `Imported from ${host}`;
        } catch {
          sourceLabel = 'Imported Article URL';
        }
      } catch (fetchErr) {
        return res.status(400).json({
          error: `Unable to reach that URL (${fetchErr.message}). Paste the essay text directly to generate your RC set.`
        });
      }
    }

    if (!rawText || rawText.split(/\s+/).length < 80) {
      return res.status(400).json({
        error: 'Please provide at least 80 words of article or essay text so PracticeRC can build rigorous exam-style questions.'
      });
    }

    const paragraphs = normalizeParagraphs(rawText);
    const fullPassageText = paragraphs.join(' ');
    const wordCount = fullPassageText.split(/\s+/).filter(Boolean).length;
    const topic = forcedTopic || (inputTopic && TOPIC_LEXICON[inputTopic] ? inputTopic : detectTopic(fullPassageText));

    if (!derivedTitle) {
      const firstLine = rawText.split(/\r?\n/)[0]?.trim() || '';
      const firstLineWords = firstLine.split(/\s+/).filter(Boolean);
      if (firstLineWords.length > 0 && firstLineWords.length < 15 && !/[.!?]$/.test(firstLine)) {
        derivedTitle = firstLine;
      } else {
        derivedTitle = 'Untitled passage';
      }
    }

    const normalizedExam = examType === 'GMAT' ? 'GMAT' : 'CAT';
    const targetSeconds = normalizedExam === 'GMAT' ? 600 : 480;

    let questions = [];
    let generationSource = 'fallback';
    let generationReason = null;

    if (limitStatus.canUseAi) {
      const aiResult = await generateExamQuestionsWithAi({
        paragraphs,
        title: derivedTitle,
        topic,
        examType: normalizedExam,
        difficulty,
        focusMode,
        ruleBasedFallback: buildExamQuestions
      });
      questions = aiResult.questions;
      generationSource = aiResult.generationSource;
      generationReason = aiResult.generationReason;

      if (generationSource === 'ai' && typeof limitStatus.recordAiSuccess === 'function') {
        await limitStatus.recordAiSuccess();
      }
    } else {
      questions = buildExamQuestions({
        paragraphs,
        title: derivedTitle,
        topic,
        examType: normalizedExam,
        difficulty,
        focusMode
      });
      generationSource = 'fallback';
      generationReason = limitStatus.reason || 'limit_reached';
    }

    const slug = `${derivedTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)}-${Date.now().toString(36)}`;

    const createdTest = await store.createTest({
      slug,
      title: derivedTitle,
      topic,
      source_label: sourceLabel,
      category,
      exam_type: normalizedExam,
      difficulty,
      pyq_year: pyqYear,
      pyq_slot: pyqSlot,
      word_count: wordCount,
      target_seconds: targetSeconds,
      passage_paragraphs: paragraphs,
      questions,
      is_live_featured: false,
      created_by: userId || 'guest',
      generation_source: generationSource,
      generation_reason: generationReason,
      created_at: new Date().toISOString()
    });

    if (pyqCatalogId && createdTest?.id) {
      await store.updatePyqLinked(Number(pyqCatalogId), createdTest.id);
    }

    return res.status(201).json(createdTest);
  } catch (err) {
    console.error('API /api/generate-rc error:', err);
    return res.status(500).json({ error: err.message || 'Failed to generate RC test' });
  }
}

export {
  stripHtmlToParagraphs,
  normalizeParagraphs,
  splitSentences,
  detectTopic,
  extractTopTerms,
  clipClause,
  summarizeSentenceCore,
  synthesizeTopicEssay,
  buildExamQuestions
};
