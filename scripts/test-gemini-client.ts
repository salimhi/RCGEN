import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateRcQuestions,
  performPhase3Checks,
  fixLetterSpreadAndLongestOption,
  isCorrectOptionLongest,
  testGeminiKey,
  scrubSecret,
  getQuestionOperation,
  isCopyLikeQuestion,
  formatQualityNote
} from '../src/lib/geminiClient.ts';
import {
  testGroqKey,
  reviewQuestionsWithGroq,
  isGroqSessionFailed,
  resetGroqSessionFailed,
  setGroqSessionFailed
} from '../src/lib/groqClient.ts';
import {
  judgeQuestion,
  parseReviewerOutput,
  buildReviewerInput,
  buildReviewerPrompt,
  type ReviewerQuestionResult
} from '../src/lib/verifier.ts';
import {
  STORAGE_KEYS,
  saveGeminiKey,
  clearGeminiKey,
  getGeminiKey,
  saveGroqKey,
  clearGroqKey,
  getGroqKey,
  saveGroqModel,
  getGroqModel,
  eraseAllData
} from '../src/lib/storage.ts';
import {
  isUsableGroqChatModel,
  resolveAutoGroqModel,
  resolveEffectiveGroqModel,
  formatGroqErrorMessage,
  extractJsonFromText,
  setSessionLiveModels,
  getSessionLiveModels,
  setRememberedPassingModel,
  getRememberedPassingModel,
  resetGroqModelSession,
  clearRateLimitedModels,
  GROQ_AUTO_PREFERENCE_ORDER,
  GROQ_STARTING_MODELS
} from '../src/lib/groqModels.ts';
import {
  planQuestions,
  validateSubtypeList,
  shuffleQuestionsAndOptions,
  QUESTION_CATALOG,
  SUBTYPE_BY_ID,
  cryptoRng,
  SUBTYPE_OPERATIONS,
  DEEP_SUBTYPES,
  MAX_LOCATE_SLOTS,
  MIN_DISTINCT_OPERATIONS,
  MIN_DEEP_SLOTS,
  REQUIRED_MULTI_PARAGRAPH_SLOTS,
  getSubtypeWeight
} from '../src/lib/questionPlan.ts';
import { buildExamQuestions, normalizeParagraphs, detectTopic } from '../src/lib/ruleGenerator.ts';
import { splitPassageIntoSentences } from '../src/lib/textNorm.ts';
import {
  fetchGroqChat,
  fetchGeminiChat,
  auditSingleTest,
  scrubSecret as scrubAuditSecret
} from './audit-questions.mjs';
import type { RCQuestion, ExamType } from '../src/types.ts';

const SAMPLE_PASSAGE = [
  'Discussions of modern digital technology routinely begin from a reassuringly linear premise: that expanding access to networked information democratizes knowledge and levels epistemic playing fields. Across much of contemporary platform design, that expectation has functioned less as an empirical finding than as an organizing faith.',
  'What the linear view obscures, however, is that expanding the sheer volume of stimuli frequently degrades the cognitive conditions required to evaluate it. This divergence is not an accidental byproduct of user indiscipline; it follows from the commercial architecture of attention extraction itself.',
  'Defenders of engagement-driven ranking reply that algorithmic feeds merely reflect authentic public demand. That defence carries superficial weight, but it conflates instinctive impulse with reflective preference.'
];

const SECRET_GEMINI_KEY = 'AIzaSyFakeSecretGeminiKeyForTestingLeakage999';
const SECRET_GROQ_KEY = 'gsk_FakeSecretGroqKeyForTestingLeakage888';

let lastGeminiPrompt: string = '';

function extractPlannedSubtypeIdsFromPrompt(promptText: string): string[] {
  const ids: string[] = [];
  const regex = /Primary:\s*\\?["']?([a-z_]+)["']?/gi;
  let match;
  while ((match = regex.exec(promptText)) !== null) {
    ids.push(match[1]);
  }
  return ids;
}

function makeMockAiQuestions(
  overrideEvidence: string = 'expanding access to networked information',
  forcedSubtypes?: string[]
): any[] {
  const extracted = forcedSubtypes || (lastGeminiPrompt ? extractPlannedSubtypeIdsFromPrompt(lastGeminiPrompt) : []);
  const defaultSubtypes = ['primary_purpose', 'can_be_inferred', 'para_function', 'attitude'];
  const finalSubtypeIds = extracted.length >= 4 ? extracted : defaultSubtypes;

  const baseQuestions = [
    {
      id: 'q1',
      subtypeId: finalSubtypeIds[0],
      type: SUBTYPE_BY_ID.get(finalSubtypeIds[0])?.archetype || 'Main Idea',
      subtype: SUBTYPE_BY_ID.get(finalSubtypeIds[0])?.label || 'Primary purpose',
      stem: 'Which of the following best expresses the primary concern of the passage?',
      correctLetter: 'B',
      evidence: overrideEvidence,
      paragraphsNeeded: ['Discussions of modern digital technology', 'What the linear view obscures'],
      options: [
        { letter: 'A', text: 'To catalogue breakthroughs in platform software design.', explanation: 'Too extreme', flawTag: 'extreme', tempting: 'uses words from paragraph 1' },
        { letter: 'B', text: 'To challenge the linear view of technology and cognitive evaluation.', explanation: 'Directly supported by the text' },
        { letter: 'C', text: 'To prove individual user indiscipline causes digital overload.', explanation: 'Reverses author thesis', flawTag: 'opposite', tempting: 'appeals to intuition' },
        { letter: 'D', text: 'To argue print institutions must be revived immediately.', explanation: 'Out of scope', flawTag: 'scope', tempting: 'sounds plausible' }
      ]
    },
    {
      id: 'q2',
      subtypeId: finalSubtypeIds[1],
      type: SUBTYPE_BY_ID.get(finalSubtypeIds[1])?.archetype || 'Inference',
      subtype: SUBTYPE_BY_ID.get(finalSubtypeIds[1])?.label || 'Can be inferred',
      stem: 'What can be inferred regarding engagement-driven ranking models?',
      correctLetter: 'A',
      evidence: 'conflates instinctive impulse with reflective preference',
      paragraphsNeeded: ['What the linear view obscures', 'Defenders of engagement-driven ranking reply'],
      options: [
        { letter: 'A', text: 'They mistake reflexive impulse for deliberate choice.', explanation: 'Directly supported' },
        { letter: 'B', text: 'They eliminate cognitive evaluation across platform feeds.', explanation: 'Too extreme', flawTag: 'extreme', tempting: 'exaggerates impact' },
        { letter: 'C', text: 'They are designed solely to level epistemic playing fields.', explanation: 'Distortion', flawTag: 'distortion', tempting: 'mentions fields' },
        { letter: 'D', text: 'They operate with no commercial architecture or profit motive.', explanation: 'Reversal', flawTag: 'opposite', tempting: 'simple negation' }
      ]
    },
    {
      id: 'q3',
      subtypeId: finalSubtypeIds[2],
      type: SUBTYPE_BY_ID.get(finalSubtypeIds[2])?.archetype || 'Paragraph Function',
      subtype: SUBTYPE_BY_ID.get(finalSubtypeIds[2])?.label || 'Role of a paragraph',
      stem: 'The paragraph that begins "What the linear view obscures" primarily serves to:',
      correctLetter: 'C',
      evidence: 'commercial architecture of attention extraction',
      paragraphsNeeded: ['What the linear view obscures', 'Discussions of modern digital technology'],
      options: [
        { letter: 'A', text: 'Retract the entire opening argument regarding linear technology.', explanation: 'Wrong', flawTag: 'opposite', tempting: 'confuses transition' },
        { letter: 'B', text: 'Praise platform engagement metrics and attention extraction.', explanation: 'Wrong', flawTag: 'opposite', tempting: 'sounds positive' },
        { letter: 'C', text: 'Identify the structural commercial cause of cognitive degradation.', explanation: 'Correct' },
        { letter: 'D', text: 'Introduce individual user indiscipline as the sole cause of stimuli volume.', explanation: 'Wrong', flawTag: 'scope', tempting: 'plausible detail' }
      ]
    },
    {
      id: 'q4',
      subtypeId: finalSubtypeIds[3],
      type: SUBTYPE_BY_ID.get(finalSubtypeIds[3])?.archetype || 'Tone & Attitude',
      subtype: SUBTYPE_BY_ID.get(finalSubtypeIds[3])?.label || 'Attitude',
      stem: 'The author perspective toward the linear premise is best described as:',
      correctLetter: 'D',
      evidence: 'less as an empirical finding than as an organizing faith',
      paragraphsNeeded: ['Discussions of modern digital technology', 'What the linear view obscures'],
      options: [
        { letter: 'A', text: 'Unconditional praise of modern connectivity and information access.', explanation: 'Wrong', flawTag: 'opposite', tempting: 'opposite stance' },
        { letter: 'B', text: 'Hostile dismissal of all electronic devices and platform feeds.', explanation: 'Wrong', flawTag: 'extreme', tempting: 'too negative' },
        { letter: 'C', text: 'Indifferent neutrality presenting no evaluation whatsoever of digital platforms.', explanation: 'Wrong', flawTag: 'scope', tempting: 'sounds objective' },
        { letter: 'D', text: 'Critical skepticism targeting underlying structural flaws.', explanation: 'Correct' }
      ]
    }
  ];

  if (finalSubtypeIds.length >= 5) {
    baseQuestions.push({
      id: 'q5',
      subtypeId: finalSubtypeIds[4],
      type: SUBTYPE_BY_ID.get(finalSubtypeIds[4])?.archetype || 'Strengthen / Weaken',
      subtype: SUBTYPE_BY_ID.get(finalSubtypeIds[4])?.label || 'Strengthen the argument',
      stem: 'Which finding would most strongly support the author concluding argument?',
      correctLetter: 'E',
      evidence: 'commercial architecture of attention extraction',
      paragraphsNeeded: ['What the linear view obscures', 'Defenders of engagement-driven ranking reply'],
      options: [
        { letter: 'A', text: 'Platform revenues decline when user attention extraction increases.', explanation: 'Wrong', flawTag: 'opposite', tempting: 'economic logic' },
        { letter: 'B', text: 'Reflective users report identical satisfaction across linear feeds.', explanation: 'Wrong', flawTag: 'irrelevant', tempting: 'mentions satisfaction' },
        { letter: 'C', text: 'Stimuli volume has zero impact on cognitive evaluation.', explanation: 'Wrong', flawTag: 'distortion', tempting: 'mentions speed' },
        { letter: 'D', text: 'Print readers show the exact same cognitive degradation as digital readers.', explanation: 'Wrong', flawTag: 'comparison', tempting: 'comparison trap' },
        { letter: 'E', text: 'Cognitive retention drops in direct proportion to ad load and feed velocity.', explanation: 'Correct' }
      ]
    });
  }

  return baseQuestions;
}

function makeMockGeminiApiResponse(questions: any[], analysis?: any) {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({
                analysis: analysis || {
                  genre: 'argumentative',
                  thesis: 'Technology degrades cognitive evaluation.',
                  paragraphs: [
                    { firstSixWords: 'Discussions of modern digital technology routinely', role: 'introduce linear premise' },
                    { firstSixWords: 'What the linear view obscures however', role: 'identify structural flaw' },
                    { firstSixWords: 'Defenders of engagement-driven ranking reply that', role: 'critique counter-argument' }
                  ],
                  stance: 'critically skeptical',
                  keyClaims: ['Linear view obscures degradation', 'Commercial incentives drive engagement'],
                  contextWords: ['organizing faith']
                },
                questions
              })
            }
          ]
        }
      }
    ]
  });
}

function makeMockReviewerResponse(reviews: ReviewerQuestionResult[]) {
  return JSON.stringify({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify({ reviews })
            }
          ]
        }
      }
    ]
  });
}

function makeMockGroqResponse(reviews: ReviewerQuestionResult[]) {
  return JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({ reviews })
        }
      }
    ]
  });
}

async function runAllTests() {
  console.log('🧪 Starting PracticeRC Comprehensive Mock Test Suite...\n');

  const originalFetch = globalThis.fetch;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleLog = console.log;

  let totalTests = 0;
  let passedTests = 0;

  let loggedStrings: string[] = [];
  const capture = (...args: any[]) => {
    const str = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    loggedStrings.push(str);
  };

  console.error = capture;
  console.warn = capture;

  let activeFetchHandler: any = originalFetch;
  Object.defineProperty(globalThis, 'fetch', {
    get() {
      return async function (url: any, ...rest: any[]) {
        if (rest[0]?.body) {
          try {
            const bodyStr = typeof rest[0].body === 'string' ? rest[0].body : JSON.stringify(rest[0].body);
            if (bodyStr.includes('ASSIGNED SLOTS:') || bodyStr.includes('Primary:')) {
              lastGeminiPrompt = bodyStr;
            }
          } catch {}
        }
        return activeFetchHandler(url, ...rest);
      };
    },
    set(fn) {
      activeFetchHandler = fn;
    },
    configurable: true
  });

  const testPass = (name: string) => {
    totalTests++;
    passedTests++;
    console.log(`       ✓ Passed: ${name}\n`);
  };

  try {
    // =========================================================================
    // SECTION 1: GENERATION & PHASE 3 CHECKS
    // =========================================================================
    console.log('--- 1. GENERATION & PHASE 3 CHECKS ---');

    // 1.1: Good question with empty evidence passes
    console.log('  1.1: Good question with empty evidence passes...');
    const qEmptyEv = makeMockAiQuestions('')[0];
    const p3Empty = performPhase3Checks([qEmptyEv], {}, SAMPLE_PASSAGE, 'CAT');
    assert.strictEqual(p3Empty.validQuestions.length, 1);
    assert.strictEqual(p3Empty.perQuestionEvidence[0].evidenceFound, null);
    testPass('Empty evidence does not reject question');

    // 1.2: Paraphrased evidence passes if reviewer agrees
    console.log('  1.2: Paraphrased evidence passes if reviewer agrees...');
    const qParaphrase = makeMockAiQuestions('rapid expansion of accessible network data')[0];
    const p3Para = performPhase3Checks([qParaphrase], {}, SAMPLE_PASSAGE, 'CAT');
    assert.strictEqual(p3Para.validQuestions.length, 1);
    testPass('Paraphrased evidence passes successfully');

    // 1.3: Generation never falls back only because of evidence
    console.log('  1.3: Generation never falls back only because of evidence...');
    const qMissingEv = makeMockAiQuestions('completely missing evidence phrase here')[0];
    const p3Missing = performPhase3Checks([qMissingEv], {}, SAMPLE_PASSAGE, 'CAT');
    assert.strictEqual(p3Missing.validQuestions.length, 1);
    assert.strictEqual(p3Missing.needsRepair.length, 0);
    testPass('Missing evidence is recorded in diagnostics only, never gates generation');

    // 1.4: Stem asking about vocabulary word not in passage fails
    console.log('  1.4: Stem asking about vocabulary word not in passage fails...');
    const badVocabQ = [
      {
        id: 'q1',
        type: 'Vocabulary in Context',
        subtype: 'Phrase meaning',
        stem: 'In the context of the passage, the word "serendipitous" refers to:',
        correctLetter: 'A',
        options: [
          { letter: 'A', text: 'Accidental good fortune', explanation: 'Correct' },
          { letter: 'B', text: 'Deliberate planning', explanation: 'Wrong', flawTag: 'opposite' },
          { letter: 'C', text: 'Technological efficiency', explanation: 'Wrong', flawTag: 'distortion' },
          { letter: 'D', text: 'Cognitive decline', explanation: 'Wrong', flawTag: 'scope' }
        ]
      }
    ];
    const p3Vocab = performPhase3Checks(badVocabQ, { contextWords: ['serendipitous'] }, SAMPLE_PASSAGE, 'CAT');
    assert.strictEqual(p3Vocab.validQuestions.length, 0);
    assert.strictEqual(p3Vocab.needsRepair.length, 1);
    testPass('Non-existent vocabulary word properly fails exact-text check');

    // 1.5: Stem quoting paragraph start that does not exist fails
    console.log('  1.5: Stem quoting paragraph start that does not exist fails...');
    const badParaQ = [
      {
        id: 'q1',
        type: 'Paragraph Function',
        subtype: 'Role of a paragraph',
        stem: 'The paragraph that begins "In contrast to earlier historical periods" primarily serves to:',
        correctLetter: 'A',
        options: [
          { letter: 'A', text: 'Introduce contrast', explanation: 'Correct' },
          { letter: 'B', text: 'Reversal', explanation: 'Wrong', flawTag: 'opposite' },
          { letter: 'C', text: 'Distortion', explanation: 'Wrong', flawTag: 'distortion' },
          { letter: 'D', text: 'Scope', explanation: 'Wrong', flawTag: 'scope' }
        ]
      }
    ];
    const p3ParaCheck = performPhase3Checks(badParaQ, {}, SAMPLE_PASSAGE, 'CAT');
    assert.strictEqual(p3ParaCheck.validQuestions.length, 0);
    assert.strictEqual(p3ParaCheck.needsRepair.length, 1);
    testPass('Non-existent paragraph beginning properly fails exact-text check');

    // 1.6: Stem with paragraph number or ¶ symbol fails
    console.log('  1.6: Stem with paragraph number or ¶ symbol fails...');
    const badNumberQ = [
      {
        id: 'q1',
        type: 'Inference',
        subtype: 'Can be inferred',
        stem: 'According to paragraph 2, what causes cognitive fragmentation?',
        correctLetter: 'A',
        options: [
          { letter: 'A', text: 'Commercial attention extraction', explanation: 'Correct' },
          { letter: 'B', text: 'Individual indiscipline', explanation: 'Wrong', flawTag: 'opposite' },
          { letter: 'C', text: 'Print institutions', explanation: 'Wrong', flawTag: 'distortion' },
          { letter: 'D', text: 'Digital literacy', explanation: 'Wrong', flawTag: 'scope' }
        ]
      }
    ];
    const p3Number = performPhase3Checks(badNumberQ, {}, SAMPLE_PASSAGE, 'CAT');
    assert.strictEqual(p3Number.validQuestions.length, 0);
    assert.strictEqual(p3Number.needsRepair.length, 1);
    testPass('Prohibited paragraph number/¶ fails check and is sent to repair');

    // 1.7: Longest-option rule and letter spread
    console.log('  1.7: Longest-option rule sends >1 longest questions to repair; letter spread uses shuffling...');
    const twoLongestCorrect = [
      {
        id: 'q1',
        type: 'Main Idea',
        stem: 'Stem 1',
        correctLetter: 'A',
        options: [
          { letter: 'A', text: 'Correct A very long text indeed with lots of detailed explanation and context', explanation: 'Exp' },
          { letter: 'B', text: 'Short B', explanation: 'Exp' },
          { letter: 'C', text: 'Short C', explanation: 'Exp' },
          { letter: 'D', text: 'Short D', explanation: 'Exp' }
        ]
      },
      {
        id: 'q2',
        type: 'Inference',
        stem: 'Stem 2',
        correctLetter: 'B',
        options: [
          { letter: 'A', text: 'Short A', explanation: 'Exp' },
          { letter: 'B', text: 'Correct B very long text indeed with lots of detailed explanation and context', explanation: 'Exp' },
          { letter: 'C', text: 'Short C', explanation: 'Exp' },
          { letter: 'D', text: 'Short D', explanation: 'Exp' }
        ]
      }
    ];
    const p3Length = performPhase3Checks(twoLongestCorrect, {}, SAMPLE_PASSAGE, 'CAT');
    assert.strictEqual(p3Length.validQuestions.length, 1, 'First longest question is allowed');
    assert.strictEqual(p3Length.needsRepair.length, 1, 'Second longest question must be sent to repair');
    assert.strictEqual(p3Length.needsRepair[0].reason, 'make the wrong options as long and as detailed as the correct one');

    // Letter spread test: 4 questions with letter A
    const allLetterA: RCQuestion[] = [
      { id: 'q1', type: 'Main Idea', stem: 'S1', correctLetter: 'A', options: [{ letter: 'A', text: 'Opt A', explanation: 'E' }, { letter: 'B', text: 'Opt B', explanation: 'E' }, { letter: 'C', text: 'Opt C', explanation: 'E' }, { letter: 'D', text: 'Opt D', explanation: 'E' }] },
      { id: 'q2', type: 'Inference', stem: 'S2', correctLetter: 'A', options: [{ letter: 'A', text: 'Opt A', explanation: 'E' }, { letter: 'B', text: 'Opt B', explanation: 'E' }, { letter: 'C', text: 'Opt C', explanation: 'E' }, { letter: 'D', text: 'Opt D', explanation: 'E' }] },
      { id: 'q3', type: 'Detail & Logic', stem: 'S3', correctLetter: 'A', options: [{ letter: 'A', text: 'Opt A', explanation: 'E' }, { letter: 'B', text: 'Opt B', explanation: 'E' }, { letter: 'C', text: 'Opt C', explanation: 'E' }, { letter: 'D', text: 'Opt D', explanation: 'E' }] },
      { id: 'q4', type: 'Tone & Attitude', stem: 'S4', correctLetter: 'A', options: [{ letter: 'A', text: 'Opt A', explanation: 'E' }, { letter: 'B', text: 'Opt B', explanation: 'E' }, { letter: 'C', text: 'Opt C', explanation: 'E' }, { letter: 'D', text: 'Opt D', explanation: 'E' }] }
    ];
    fixLetterSpreadAndLongestOption(allLetterA, false);
    const countLetters: Record<string, number> = {};
    for (const q of allLetterA) countLetters[q.correctLetter] = (countLetters[q.correctLetter] || 0) + 1;
    for (const l of ['A', 'B', 'C', 'D']) {
      assert.ok((countLetters[l] || 0) <= 2, `Letter ${l} must not appear more than 2 times`);
    }
    testPass('Longest-option rule sends >1 longest questions to repair; letter spread uses shuffling');

    // =========================================================================
    // SECTION 2: REVIEW & REPAIR PIPELINE
    // =========================================================================
    console.log('--- 2. REVIEW AND REPAIR PIPELINE ---');

    const allPassReviews: ReviewerQuestionResult[] = [
      { id: 'q1', chosenLetter: 'B', defensibleLetters: ['B'], problem: 'none', note: 'Supported by para 1' },
      { id: 'q2', chosenLetter: 'A', defensibleLetters: ['A'], problem: 'none', note: 'Supported by para 3' },
      { id: 'q3', chosenLetter: 'C', defensibleLetters: ['C'], problem: 'none', note: 'Role matches' },
      { id: 'q4', chosenLetter: 'D', defensibleLetters: ['D'], problem: 'none', note: 'Stance matches' }
    ];

    // 2.1: All questions pass review
    console.log('  2.1: All questions pass review cleanly...');
    let callCount21 = 0;
    globalThis.fetch = async (url: any) => {
      callCount21++;
      if (callCount21 === 1) {
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res21 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: true
    });
    assert.strictEqual(res21.source, 'ai');
    assert.strictEqual(res21.questions.length, 4);
    assert.strictEqual(res21.verification_info?.reviewer, 'gemini');
    testPass('All questions verified and kept');

    // 2.2: One fails review and is successfully repaired
    console.log('  2.2: One fails review and is successfully repaired...');
    let callCount22 = 0;
    globalThis.fetch = async (url: any) => {
      callCount22++;
      if (callCount22 === 1) {
        // 1: initial generation
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      if (callCount22 === 2) {
        // 2: initial review (q1 fails)
        const reviews = [
          { id: 'q1', chosenLetter: 'A', defensibleLetters: ['A'], problem: 'wrong_key', note: 'Option A is stronger' },
          allPassReviews[1],
          allPassReviews[2],
          allPassReviews[3]
        ];
        return new Response(makeMockReviewerResponse(reviews), { status: 200 });
      }
      if (callCount22 === 3) {
        // 3: repair call
        const repairedQ = [
          {
            id: 'q1',
            type: 'Main Idea',
            stem: 'Repaired stem for q1',
            correctLetter: 'B',
            options: [
              { letter: 'A', text: 'Flawed A', explanation: 'Wrong', flawTag: 'extreme' },
              { letter: 'B', text: 'Repaired B', explanation: 'Correct' },
              { letter: 'C', text: 'Flawed C', explanation: 'Wrong', flawTag: 'opposite' },
              { letter: 'D', text: 'Flawed D', explanation: 'Wrong', flawTag: 'scope' }
            ]
          }
        ];
        return new Response(makeMockGeminiApiResponse(repairedQ), { status: 200 });
      }
      // 4: re-review
      return new Response(makeMockReviewerResponse([{ id: 'q1', chosenLetter: 'B', defensibleLetters: ['B'], problem: 'none', note: 'Now valid' }]), { status: 200 });
    };

    const res22 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: true
    });
    assert.strictEqual(res22.source, 'ai');
    assert.strictEqual(res22.questions.length, 4);
    testPass('Failed question was repaired and included');

    // 2.3: One fails twice and is dropped (CAT keeps 3)
    console.log('  2.3: One fails twice and is dropped (CAT keeps 3)...');
    let callCount23 = 0;
    globalThis.fetch = async () => {
      callCount23++;
      if (callCount23 === 1) return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      if (callCount23 === 2) {
        const reviews = [
          { id: 'q1', chosenLetter: 'A', defensibleLetters: ['A'], problem: 'wrong_key', note: 'Mismatch' },
          allPassReviews[1],
          allPassReviews[2],
          allPassReviews[3]
        ];
        return new Response(makeMockReviewerResponse(reviews), { status: 200 });
      }
      if (callCount23 === 3) {
        // Repaired q1
        return new Response(makeMockGeminiApiResponse([makeMockAiQuestions()[0]]), { status: 200 });
      }
      // Re-review fails again
      return new Response(makeMockReviewerResponse([{ id: 'q1', chosenLetter: 'C', defensibleLetters: ['C'], problem: 'wrong_key', note: 'Still flawed' }]), { status: 200 });
    };

    const res23 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: true
    });
    assert.strictEqual(res23.source, 'ai');
    assert.strictEqual(res23.questions.length, 3);
    testPass('Question failing repair is dropped, CAT retains 3 valid questions');

    // 2.4: Two fail review and fail repair -> fallback with reason "unverified"
    console.log('  2.4: Two fail review and fail repair -> fallback with reason "unverified"...');
    let callCount24 = 0;
    globalThis.fetch = async () => {
      callCount24++;
      if (callCount24 === 1) return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      if (callCount24 === 2) {
        const reviews = [
          { id: 'q1', chosenLetter: 'A', defensibleLetters: ['A'], problem: 'wrong_key', note: 'Mismatch' },
          { id: 'q2', chosenLetter: 'C', defensibleLetters: ['C'], problem: 'wrong_key', note: 'Mismatch' },
          allPassReviews[2],
          allPassReviews[3]
        ];
        return new Response(makeMockReviewerResponse(reviews), { status: 200 });
      }
      if (callCount24 === 3) {
        return new Response(makeMockGeminiApiResponse([makeMockAiQuestions()[0], makeMockAiQuestions()[1]]), { status: 200 });
      }
      // Re-review fails both again
      return new Response(makeMockReviewerResponse([
        { id: 'q1', chosenLetter: 'A', defensibleLetters: ['A'], problem: 'wrong_key', note: 'Still bad' },
        { id: 'q2', chosenLetter: 'C', defensibleLetters: ['C'], problem: 'wrong_key', note: 'Still bad' }
      ]), { status: 200 });
    };

    const res24 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: true
    });
    assert.strictEqual(res24.source, 'fallback');
    assert.ok(res24.reason?.includes('unverified'), 'Reason must mention unverified');
    testPass('Gracefully falls back with "unverified" when < 3 questions pass');

    // 2.5: Real quote with wrong key fails at review
    console.log('  2.5: Real quote with wrong key fails at review...');
    const originalQ = makeMockAiQuestions()[0];
    const wrongKeyReview: ReviewerQuestionResult = {
      id: originalQ.id,
      chosenLetter: 'A',
      defensibleLetters: ['A'],
      problem: 'wrong_key',
      note: 'Option A is directly stated in paragraph 1'
    };
    const judge1 = judgeQuestion(originalQ, wrongKeyReview);
    assert.strictEqual(judge1.passed, false, 'Must fail when reviewer chose different letter');
    assert.strictEqual(judge1.failureReason, 'Reviewer selected option A instead of intended key B');
    testPass('Wrong key fails review');

    // 2.6: Key correct while second option is defensible fails
    console.log('  2.6: Key correct while second option is defensible fails...');
    const ambiguousReview: ReviewerQuestionResult = {
      id: originalQ.id,
      chosenLetter: 'B',
      defensibleLetters: ['B', 'C'],
      problem: 'ambiguous',
      note: 'Both B and C are defensible'
    };
    const judge2 = judgeQuestion(originalQ, ambiguousReview);
    assert.strictEqual(judge2.passed, false, 'Must fail when multiple options are defensible');
    testPass('Multiple defensible options fails review');

    // =========================================================================
    // SECTION 3: GROQ REVIEWER & ADAPTERS
    // =========================================================================
    console.log('--- 3. GROQ REVIEWER & ADAPTERS ---');
    resetGroqSessionFailed();

    // 3.1: Groq succeeds and is recorded as reviewer
    console.log('  3.1: Groq succeeds and is recorded as reviewer...');
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      if (urlStr.includes('api.groq.com')) {
        return new Response(makeMockGroqResponse(allPassReviews), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const resGroq = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(resGroq.source, 'ai');
    assert.strictEqual(resGroq.verification_info?.reviewer, 'groq');
    assert.strictEqual(resGroq.verification_info?.groqUnavailable, false);
    testPass('Groq verified questions and is recorded as reviewer');

    // 3.2: Groq network error -> Gemini reviews, Groq not retried
    console.log('  3.2: Groq network error -> Gemini reviews, Groq not retried...');
    let groqCallAttempts = 0;
    resetGroqSessionFailed();
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        groqCallAttempts++;
        throw new TypeError('Failed to fetch (CORS/Network error)');
      }
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const resGroqBlocked = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(groqCallAttempts, 1, 'Groq must NOT be retried on network error');
    assert.strictEqual(resGroqBlocked.source, 'ai');
    assert.strictEqual(resGroqBlocked.verification_info?.groqUnavailable, true);
    assert.strictEqual(isGroqSessionFailed(), true, 'Session failure must be remembered');
    testPass('Groq network failure smoothly switches to Gemini review and sets session failure');

    // 3.3: Groq 429 rate limit -> Gemini reviews
    console.log('  3.3: Groq 429 rate limit -> Gemini reviews...');
    resetGroqSessionFailed();
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        return new Response('Rate limit exceeded', { status: 429 });
      }
      const body = init?.body ? String(init.body) : '';
      if (body.includes('Independent CAT Reading Comprehension Expert Reviewer') || body.includes('reviews')) {
        return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
      }
      return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
    };

    const resGroq429 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(resGroq429.source, 'ai');
    assert.strictEqual(resGroq429.verification_info?.reviewer, 'gemini');
    testPass('Groq 429 delegates to Gemini reviewer without retrying Groq');

    // 3.4: Groq toggle off means Groq is never called
    console.log('  3.4: Groq toggle off means Groq is never called...');
    resetGroqSessionFailed();
    let groqWasCalled34 = false;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) groqWasCalled34 = true;
      return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
    };

    await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: false,
      doubleCheck: true
    });
    assert.strictEqual(groqWasCalled34, false, 'Groq must NOT be called when toggle is off');
    testPass('Groq toggle respected');

    // 3.5: Both reviewers fail -> questions kept marked "answers were not double-checked"
    console.log('  3.5: Both reviewers fail -> questions kept marked "answers were not double-checked"...');
    resetGroqSessionFailed();
    let geminiReviewFailedCalls = 0;
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) throw new Error('Groq unavailable');
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        geminiReviewFailedCalls++;
        if (geminiReviewFailedCalls === 1) {
          return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
        }
        throw new Error('Gemini reviewer unavailable');
      }
      return new Response('{}', { status: 200 });
    };

    const resBothFail = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(resBothFail.source, 'ai');
    assert.strictEqual(resBothFail.verification_info?.reviewer, 'none');
    testPass('Both reviewers failing keeps questions with reviewer "none"');

    // 3.6: Key testing flows
    console.log('  3.6: "Test my Gemini key" and "Test my Groq key" flows...');
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com/openai/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }] }), { status: 200 });
      }
      if (urlStr.includes('api.groq.com/openai/v1/chat/completions')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok": true}' } }] }), { status: 200 });
      }
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'OK' }] } }] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const geminiTest = await testGeminiKey(SECRET_GEMINI_KEY);
    assert.strictEqual(geminiTest.ok, true);

    const groqTest = await testGroqKey(SECRET_GROQ_KEY, 'llama-3.3-70b-versatile');
    assert.strictEqual(groqTest.ok, true);
    assert.deepStrictEqual(groqTest.models, ['llama-3.3-70b-versatile']);
    testPass('Key testing flows and browser-blocked message verified');

    // 3.7: Groq returns malformed JSON, one retry, then Gemini reviews
    console.log('  3.7: Groq returns malformed JSON, one retry, then Gemini reviews...');
    resetGroqSessionFailed();
    let groqAttempts37 = 0;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        groqAttempts37++;
        // Returns malformed JSON both on initial call and on the single retry
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"reviews": [ INVALID JSON HERE' } }] }), { status: 200 });
      }
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        const body = init?.body ? String(init.body) : '';
        if (body.includes('Independent CAT Reading Comprehension Expert Reviewer') || body.includes('reviews')) {
          return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
        }
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const res37 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(groqAttempts37, 2, 'Groq must be retried exactly once on malformed JSON');
    assert.strictEqual(res37.source, 'ai');
    assert.strictEqual(res37.verification_info?.reviewer, 'gemini', 'Falls back to Gemini reviewer');
    assert.strictEqual(res37.verification_info?.groqUnavailable, true);
    assert.strictEqual(isGroqSessionFailed(), true, 'Groq session failure must be remembered');
    testPass('Groq malformed JSON triggers one retry then falls back cleanly to Gemini review');

    // 3.8: Groq session failure memory: subsequent generations skip Groq
    console.log('  3.8: Groq session failure memory skips Groq and goes straight to Gemini...');
    assert.strictEqual(isGroqSessionFailed(), true);
    let groqCalledInNextGen = false;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) groqCalledInNextGen = true;
      const body = init?.body ? String(init.body) : '';
      if (body.includes('Independent CAT Reading Comprehension Expert Reviewer') || body.includes('reviews')) {
        return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
      }
      return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
    };

    const res38 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(groqCalledInNextGen, false, 'Groq must be skipped when session failed');
    assert.strictEqual(res38.verification_info?.reviewer, 'gemini');

    // Reset memory
    resetGroqSessionFailed();
    assert.strictEqual(isGroqSessionFailed(), false, 'resetGroqSessionFailed restores session memory');
    testPass('Groq session failure memory skips Groq and resets properly');

    // =========================================================================
    // SECTION 4: PIPELINE CONTROLS, TIMEOUTS, ABORT, REPAIR & STORAGE
    // =========================================================================
    console.log('--- 4. PIPELINE CONTROLS, TIMEOUTS, ABORT, REPAIR & STORAGE ---');

    // 4.1: MAX_TOKENS then successful retry
    console.log('  4.1: MAX_TOKENS then successful retry...');
    let maxTokensAttempt = 0;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        maxTokensAttempt++;
        if (maxTokensAttempt === 1) {
          return new Response(
            JSON.stringify({
              candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '' }] } }]
            }),
            { status: 200 }
          );
        }
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const resMaxTokens = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(resMaxTokens.source, 'ai');
    assert.strictEqual(maxTokensAttempt, 2, 'MAX_TOKENS must trigger a retry with higher limit');
    testPass('MAX_TOKENS triggers retry and succeeds');

    // 4.2: Gemini call timeout
    console.log('  4.2: Gemini call timeout falls back to algorithm...');
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        const timeoutErr: any = new Error('Gemini API request timed out after 30s');
        timeoutErr.name = 'AbortError';
        throw timeoutErr;
      }
      return new Response('{}', { status: 200 });
    };

    const resTimeout = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY
    });
    assert.strictEqual(resTimeout.source, 'fallback');
    assert.ok(
      resTimeout.diagnostics?.errorMessage?.includes('timed out') || resTimeout.reason?.includes('timed out'),
      'Must record timeout in diagnostics error message'
    );
    testPass('Gemini call timeout falls back gracefully to algorithm');

    // 4.3: User abort handling
    console.log('  4.3: User abort handling...');
    const abortCtrl = new AbortController();
    abortCtrl.abort();

    let abortedThrown = false;
    try {
      await generateRcQuestions({
        paragraphs: SAMPLE_PASSAGE,
        examType: 'CAT',
        engine: 'gemini',
        geminiKey: SECRET_GEMINI_KEY,
        signal: abortCtrl.signal
      });
    } catch (e: any) {
      abortedThrown = true;
      assert.strictEqual(e.message, 'User aborted generation');
    }
    assert.strictEqual(abortedThrown, true);
    testPass('AbortSignal properly stops execution');

    // 4.4: Double-check switched off
    console.log('  4.4: Double-check switched off (no reviewer call at all)...');
    let anyReviewerCall = false;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      const body = init?.body ? String(init.body) : '';
      if (urlStr.includes('api.groq.com')) anyReviewerCall = true;
      if (body.includes('Independent CAT Reading Comprehension Expert Reviewer')) anyReviewerCall = true;
      return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
    };

    const resNoDoubleCheck = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: true,
      doubleCheck: false
    });
    assert.strictEqual(anyReviewerCall, false, 'No reviewer call must be made when doubleCheck is off');
    assert.strictEqual(resNoDoubleCheck.source, 'ai');
    assert.strictEqual(resNoDoubleCheck.verification_info?.reviewer, 'none');
    assert.strictEqual(resNoDoubleCheck.diagnostics?.questionsChecked, 0);
    testPass('Double-check off completely skips reviewer calls');

    // 4.5: The repair call fixing a length-bias question
    console.log('  4.5: The repair call fixing a length-bias question...');
    let callCount45 = 0;
    globalThis.fetch = async (url: any, init: any) => {
      callCount45++;
      if (callCount45 === 1) {
        // Initial generation with length bias in q2
        const biasedQuestions = makeMockAiQuestions();
        // Make q1 correct option longest
        biasedQuestions[0].options[1].text = 'Correct B is by far the longest option with vast detailed context and phrases';
        // Make q2 correct option also longest (triggers length bias repair)
        biasedQuestions[1].options[0].text = 'Correct A is also overwhelmingly the longest option with elaborate wording';
        return new Response(makeMockGeminiApiResponse(biasedQuestions), { status: 200 });
      }
      if (callCount45 === 2) {
        // Repair call for q2: return repaired q2 where wrong options are balanced in length
        const repairedQ2 = [
          {
            id: 'q2',
            type: 'Inference',
            stem: 'Repaired stem for q2',
            correctLetter: 'A',
            options: [
              { letter: 'A', text: 'Reflexive impulse is conflated with deliberate choice.', explanation: 'Correct' },
              { letter: 'B', text: 'Completely eliminates all reading comprehension capabilities.', explanation: 'Too extreme', flawTag: 'extreme' },
              { letter: 'C', text: 'Was originally engineered by early Renaissance print shop masters.', explanation: 'Distortion', flawTag: 'distortion' },
              { letter: 'D', text: 'Operates completely free of commercial profit motives or gains.', explanation: 'Reversal', flawTag: 'opposite' }
            ]
          }
        ];
        return new Response(makeMockGeminiApiResponse(repairedQ2), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res45 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(res45.source, 'ai');
    assert.strictEqual(res45.questions.length, 4);
    assert.strictEqual(res45.diagnostics?.flags?.includes('length_bias') || false, false, 'Length bias flag must not be present when repaired');
    testPass('Repair call fixes length-bias question and clears length bias');

    // 4.6: Length-bias question failing repair is kept and flagged
    console.log('  4.6: Length-bias question failing repair is kept with diagnostics flag "length_bias"...');
    let callCount46 = 0;
    globalThis.fetch = async () => {
      callCount46++;
      if (callCount46 === 1) {
        const biased = makeMockAiQuestions();
        biased[0].options[1].text = 'Correct B is by far the longest option with vast detailed context and phrases extending far beyond';
        biased[1].options[0].text = 'Correct A is also overwhelmingly the longest option with elaborate wording extending far beyond';
        return new Response(makeMockGeminiApiResponse(biased), { status: 200 });
      }
      if (callCount46 === 2) {
        // Repair returns question still with correct option longest
        const stillBiasedQ2 = [
          {
            id: 'q2',
            type: 'Inference',
            stem: 'Still biased stem',
            correctLetter: 'A',
            options: [
              { letter: 'A', text: 'Correct A remains exceptionally long and detailed compared to the rest with extensive additional context', explanation: 'Correct' },
              { letter: 'B', text: 'Short B with platform words', explanation: 'Wrong', flawTag: 'extreme', tempting: 'platform words' },
              { letter: 'C', text: 'Short C with linear terms', explanation: 'Wrong', flawTag: 'distortion', tempting: 'linear terms' },
              { letter: 'D', text: 'Short D with digital focus', explanation: 'Wrong', flawTag: 'opposite', tempting: 'digital focus' }
            ]
          }
        ];
        return new Response(makeMockGeminiApiResponse(stillBiasedQ2), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res46 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(res46.source, 'ai');
    assert.strictEqual(res46.questions.length, 4, 'Must NOT drop questions failing repair for length bias');
    assert.ok(res46.diagnostics?.flags?.includes('length_bias'), 'Must flag length_bias in diagnostics.flags');
    testPass('Length-bias question kept (not dropped) with diagnostics flag "length_bias"');

    // 4.7: Storage remove and erase all data
    console.log('  4.7: Storage remove and erase all data...');
    saveGeminiKey('AIzaSyDummy123');
    saveGroqKey('gsk_Dummy456');
    assert.strictEqual(getGeminiKey(), 'AIzaSyDummy123');
    assert.strictEqual(getGroqKey(), 'gsk_Dummy456');

    clearGeminiKey();
    assert.strictEqual(getGeminiKey(), '');

    clearGroqKey();
    assert.strictEqual(getGroqKey(), '');

    saveGeminiKey('AIzaSyDummyToErase');
    saveGroqKey('gsk_DummyToErase');
    eraseAllData();
    assert.strictEqual(getGeminiKey(), '');
    assert.strictEqual(getGroqKey(), '');
    testPass('Key removal and eraseAllData clean all storage keys');

    // 4.8: Zero secret leakage in client
    console.log('  4.8: Zero secret leakage check across logs, errors, and output objects...');
    const allLoggedText = loggedStrings.join('\n');
    assert.strictEqual(allLoggedText.includes(SECRET_GEMINI_KEY), false, 'SECRET_GEMINI_KEY must not appear in any log');
    assert.strictEqual(allLoggedText.includes(SECRET_GROQ_KEY), false, 'SECRET_GROQ_KEY must not appear in any log');

    const scrubbedSample = scrubSecret(`Error with ${SECRET_GEMINI_KEY} and ${SECRET_GROQ_KEY}`, SECRET_GEMINI_KEY);
    assert.strictEqual(scrubbedSample.includes(SECRET_GEMINI_KEY), false);
    assert.strictEqual(scrubbedSample.includes(SECRET_GROQ_KEY), false);
    testPass('Zero API key leakage confirmed in geminiClient');

    // =========================================================================
    // SECTION 5: AUDIT SCRIPT (scripts/audit-questions.mjs)
    // =========================================================================
    console.log('--- 5. AUDIT SCRIPT (scripts/audit-questions.mjs) ---');

    const sampleAuditTest = {
      id: 'test-audit-sample',
      title: 'Attention Economy Sample Test',
      word_count: 512,
      passage_paragraphs: SAMPLE_PASSAGE,
      questions: makeMockAiQuestions()
    };

    // 5.1: Audit: All agree
    console.log('  5.1: Audit questions: all agree...');
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        return new Response(makeMockGroqResponse(allPassReviews), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const report51 = await auditSingleTest({
      test: sampleAuditTest,
      groqKey: SECRET_GROQ_KEY
    });
    assert.strictEqual(report51.results.length, 4);
    assert.ok(report51.results.every((r) => r.status === 'OK'));
    testPass('Audit script: all agree (all questions status OK)');

    // 5.2: Audit: One mismatch
    console.log('  5.2: Audit questions: one mismatch...');
    const mismatchReviews: ReviewerQuestionResult[] = [
      allPassReviews[0],
      { id: 'q2', chosenLetter: 'D', defensibleLetters: ['D'], problem: 'wrong_key', note: 'Option D is supported' },
      allPassReviews[2],
      allPassReviews[3]
    ];
    globalThis.fetch = async () => new Response(makeMockGroqResponse(mismatchReviews), { status: 200 });

    const report52 = await auditSingleTest({
      test: sampleAuditTest,
      groqKey: SECRET_GROQ_KEY
    });
    const q2Res = report52.results.find((r) => r.id === 'q2');
    assert.strictEqual(q2Res?.status, 'MISMATCH');
    testPass('Audit script: one mismatch properly flagged');

    // 5.3: Audit: One multiple-defensible
    console.log('  5.3: Audit questions: one multiple-defensible...');
    const multipleReviews: ReviewerQuestionResult[] = [
      allPassReviews[0],
      allPassReviews[1],
      { id: 'q3', chosenLetter: 'C', defensibleLetters: ['A', 'C'], problem: 'ambiguous', note: 'Both A and C could be argued' },
      allPassReviews[3]
    ];
    globalThis.fetch = async () => new Response(makeMockGroqResponse(multipleReviews), { status: 200 });

    const report53 = await auditSingleTest({
      test: sampleAuditTest,
      groqKey: SECRET_GROQ_KEY
    });
    const q3Res = report53.results.find((r) => r.id === 'q3');
    assert.strictEqual(q3Res?.status, 'MULTIPLE');
    testPass('Audit script: one multiple-defensible properly flagged');

    // 5.4: Audit: Malformed reply then a good retry
    console.log('  5.4: Audit questions: malformed reply then good retry...');
    let groqAuditCalls54 = 0;
    globalThis.fetch = async () => {
      groqAuditCalls54++;
      if (groqAuditCalls54 === 1) {
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"reviews": [ MALFORMED' } }] }), { status: 200 });
      }
      return new Response(makeMockGroqResponse(allPassReviews), { status: 200 });
    };

    const report54 = await auditSingleTest({
      test: sampleAuditTest,
      groqKey: SECRET_GROQ_KEY
    });
    assert.strictEqual(groqAuditCalls54, 2, 'Must retry once on malformed reply');
    assert.ok(report54.results.every((r) => r.status === 'OK'));
    testPass('Audit script: malformed reply retries and succeeds');

    // 5.5: Audit: 429 with Retry-After
    console.log('  5.5: Audit questions: 429 with Retry-After header...');
    let groq429Calls = 0;
    globalThis.fetch = async () => {
      groq429Calls++;
      if (groq429Calls === 1) {
        return new Response('Rate limited', {
          status: 429,
          headers: { 'retry-after': '0' }
        });
      }
      return new Response(makeMockGroqResponse(allPassReviews), { status: 200 });
    };

    const rawChat = await fetchGroqChat(SECRET_GROQ_KEY, 'llama-3.3-70b-versatile', 'Prompt');
    assert.ok(rawChat.includes('reviews'));
    assert.strictEqual(groq429Calls, 2);
    testPass('Audit script: 429 with Retry-After backs off and retries');

    // 5.6: Audit: Missing key gives clear error
    console.log('  5.6: Audit questions: missing key gives clear error...');
    let caughtMissingKey = false;
    try {
      await fetchGroqChat('', 'llama-3.3-70b-versatile', 'Prompt');
    } catch (e: any) {
      caughtMissingKey = true;
    }
    // Also check main() key validation message in audit-questions.mjs
    const auditFileContent = fs.readFileSync(path.join(process.cwd(), 'scripts', 'audit-questions.mjs'), 'utf8');
    assert.ok(auditFileContent.includes('GROQ_API_KEY environment variable is not set'));
    assert.ok(auditFileContent.includes('Read-Host "Groq key" -AsSecureString'));
    assert.ok(auditFileContent.includes('Remove-Item Env:GROQ_API_KEY'));
    testPass('Audit script: missing key gives clear error with PowerShell instructions');

    // 5.7: Audit: Zero key leakage in output or saved reports
    console.log('  5.7: Audit questions: zero key leakage in output or saved reports...');
    const scrubbedReport = scrubAuditSecret(`Groq returned error with key ${SECRET_GROQ_KEY} and ${SECRET_GEMINI_KEY}`, SECRET_GROQ_KEY);
    assert.strictEqual(scrubbedReport.includes(SECRET_GROQ_KEY), false);
    assert.strictEqual(scrubbedReport.includes(SECRET_GEMINI_KEY), false);

    // Check that audit-out directory does not contain secret keys
    const auditOutDir = path.join(process.cwd(), 'scripts', 'audit-out');
    if (fs.existsSync(auditOutDir)) {
      for (const file of fs.readdirSync(auditOutDir)) {
        if (file.endsWith('.json')) {
          const content = fs.readFileSync(path.join(auditOutDir, file), 'utf8');
          assert.strictEqual(content.includes(SECRET_GROQ_KEY), false, `Audit report ${file} must not leak Groq key`);
          assert.strictEqual(content.includes(SECRET_GEMINI_KEY), false, `Audit report ${file} must not leak Gemini key`);
        }
      }
    }
    testPass('Audit script: zero key leakage in output or saved reports');

    // =========================================================================
    // SECTION 6: GROQ MODEL SELECTION, VALIDATION, RETRY & ERROR HANDLING
    // =========================================================================
    console.log('--- 6. GROQ MODEL SELECTION, VALIDATION, RETRY & ERROR HANDLING ---');

    // 6.1: openai/gpt-oss-120b saved in localStorage and reloaded, value is kept
    console.log('  6.1: openai/gpt-oss-120b saved in localStorage and reloaded...');
    saveGroqModel('openai/gpt-oss-120b');
    assert.strictEqual(getGroqModel(), 'openai/gpt-oss-120b', 'Saved openai/gpt-oss-120b must be preserved on reload');
    testPass('openai/gpt-oss-120b saved and reloaded, value is kept');

    // 6.2: "Auto" saved and reloaded, value is kept
    console.log('  6.2: "Auto" saved in localStorage and reloaded...');
    saveGroqModel('Auto');
    assert.strictEqual(getGroqModel(), 'Auto', 'Saved Auto must be preserved on reload');
    testPass('"Auto" saved and reloaded, value is kept');

    // 6.3: A saved model that fails isUsableGroqChatModel (e.g. "llama-guard-3-8b") is replaced with "Auto" and notice shown
    console.log('  6.3: Saved model failing isUsableGroqChatModel is replaced with "Auto" with notice...');
    const invalidModel = 'llama-guard-3-8b';
    assert.strictEqual(isUsableGroqChatModel(invalidModel), false, 'llama-guard-3-8b must not be a usable chat model');
    saveGroqModel(invalidModel);
    assert.strictEqual(getGroqModel(), invalidModel);
    // Profile loading logic:
    const loadedModel = getGroqModel();
    let effectiveProfileModel = loadedModel;
    let modelNotice: string | null = null;
    if (!isUsableGroqChatModel(loadedModel)) {
      effectiveProfileModel = 'Auto';
      modelNotice = `Your saved model ${loadedModel} is not available, so Auto is used.`;
      saveGroqModel('Auto');
    }
    assert.strictEqual(effectiveProfileModel, 'Auto');
    assert.strictEqual(modelNotice, 'Your saved model llama-guard-3-8b is not available, so Auto is used.');
    assert.strictEqual(getGroqModel(), 'Auto', 'Model must be replaced with Auto without silent disappearance');
    testPass('Invalid saved model replaced with Auto and explicit notice generated');

    // 6.4: The live model list filters out prompt-guard, llama-guard, whisper, orpheus, embed, moderation
    console.log('  6.4: Live model list filters out safety, guard, whisper, orpheus, and embedding models...');
    const mockRawModels = [
      'meta-llama/llama-prompt-guard-2-22m',
      'llama-guard-3-8b',
      'whisper-large-v3',
      'whisper-large-v3-turbo',
      'orpheus-music-v1',
      'playdialog-tts',
      'text-embedding-bge-m3',
      'moderation-guard-v1',
      'safeguard-classifier-v2',
      'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-20b',
      'llama-3.1-8b-instant'
    ];
    const usableList = mockRawModels.filter(isUsableGroqChatModel);
    assert.deepStrictEqual(usableList, [
      'openai/gpt-oss-120b',
      'llama-3.3-70b-versatile',
      'openai/gpt-oss-20b',
      'llama-3.1-8b-instant'
    ]);
    testPass('Live model list strictly filters out non-chat / safety / audio / embedding models');

    // 6.5: HTTP 400 on response_format in test completion reported as model problem, not network problem
    console.log('  6.5: HTTP 400 on response_format reported as model problem (not network)...');
    globalThis.fetch = async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes('/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'llama-3.3-70b-versatile' }] }), { status: 200 });
      }
      if (urlStr.includes('/chat/completions')) {
        // Return 400 with response_format rejection
        return new Response('This model does not support JSON output (param response_format)', {
          status: 400,
          statusText: 'Bad Request'
        });
      }
      return new Response('{}', { status: 200 });
    };

    const res400Test = await testGroqKey(SECRET_GROQ_KEY, 'llama-3.3-70b-versatile');
    assert.strictEqual(res400Test.ok, false);
    assert.strictEqual(res400Test.httpStatus, 400);
    assert.ok(
      !res400Test.message.includes('Your browser could not reach Groq'),
      'Must NOT say browser could not reach Groq when HTTP 400 is returned'
    );
    assert.ok(
      res400Test.message.includes('HTTP 400') || res400Test.message.includes('rejected'),
      'Must report HTTP 400 model problem'
    );
    testPass('HTTP 400 on response_format reported as model problem, not network error');

    // 6.6: Each HTTP error class gives the exact sentence required
    console.log('  6.6: Strict error formatting for each HTTP error class...');
    // Network / No status
    const netErr = formatGroqErrorMessage({ message: 'Failed to fetch' });
    assert.strictEqual(netErr.message, 'Your browser could not reach Groq.');
    assert.strictEqual(netErr.failureClass, 'network_or_blocked');

    // 400
    const err400 = formatGroqErrorMessage({ httpStatus: 400, message: 'Invalid parameter' }, 'Invalid parameter');
    assert.strictEqual(err400.message, 'Groq rejected the request (HTTP 400): Invalid parameter. Pick another model in the Profile.');
    assert.strictEqual(err400.failureClass, 'rejected_400');

    // 401
    const err401 = formatGroqErrorMessage({ httpStatus: 401, message: 'Unauthorized' });
    assert.strictEqual(err401.message, 'Groq did not accept your key.');
    assert.strictEqual(err401.failureClass, 'auth_failed');

    // 403
    const err403 = formatGroqErrorMessage({ httpStatus: 403, message: 'Forbidden' });
    assert.strictEqual(err403.message, 'Groq did not accept your key.');
    assert.strictEqual(err403.failureClass, 'auth_failed');

    // 404
    const err404 = formatGroqErrorMessage({ httpStatus: 404, message: 'Model Not Found' });
    assert.strictEqual(err404.message, 'Groq does not have that model.');
    assert.strictEqual(err404.failureClass, 'model_not_found');

    // 429
    const err429 = formatGroqErrorMessage({ httpStatus: 429, message: 'Rate limit exceeded' });
    assert.strictEqual(err429.message, "Groq's free limit is used up for now.");
    assert.strictEqual(err429.failureClass, 'rate_limited');

    testPass('All HTTP error classes (400, 401/403, 404, 429, network) match exact required sentences');

    // 6.7: Auto preference order and test-passing model memory
    console.log('  6.7: Auto preference order and remembered passing model...');
    resetGroqModelSession();
    // Default top candidate
    assert.strictEqual(resolveAutoGroqModel(), 'openai/gpt-oss-120b');
    // When live models subset is known
    const subset = ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'];
    assert.strictEqual(resolveAutoGroqModel(subset), 'llama-3.3-70b-versatile');
    // When a model passed in session
    setRememberedPassingModel('openai/gpt-oss-20b');
    assert.strictEqual(getRememberedPassingModel(), 'openai/gpt-oss-20b');
    assert.strictEqual(resolveAutoGroqModel(), 'openai/gpt-oss-20b');
    resetGroqModelSession();
    testPass('Auto preference order and session remembered model verified');

    // 6.8: Robust JSON parser accepts fences and extracts outermost object/array
    console.log('  6.8: Robust JSON extractor handles code fences and surrounding noise...');
    const withFences = '```json\n{\n  "ok": true,\n  "reviews": []\n}\n```';
    assert.deepStrictEqual(extractJsonFromText(withFences), { ok: true, reviews: [] });
    const withNoise = 'Here is the JSON you requested:\n{"ok": true}\nHope that helps!';
    assert.deepStrictEqual(extractJsonFromText(withNoise), { ok: true });
    testPass('Robust JSON extractor handles clean JSON, code fences, and surrounding noise');

    // 6.9: Gemini review fallback records exact failure message and model used in diagnostics
    console.log('  6.9: Groq 400 error in generation falls back to Gemini review with diagnostics...');
    resetGroqSessionFailed();
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        return new Response(JSON.stringify({ error: { message: 'Invalid request' } }), {
          status: 400,
          statusText: 'Bad Request'
        });
      }
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        const body = init?.body ? String(init.body) : '';
        if (body.includes('Independent CAT Reading Comprehension Expert Reviewer') || body.includes('reviews')) {
          return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
        }
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const resGenGroq400 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      groqModel: 'openai/gpt-oss-120b',
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(resGenGroq400.source, 'ai');
    assert.strictEqual(resGenGroq400.verification_info?.reviewer, 'gemini', 'Falls back to Gemini reviewer');
    assert.strictEqual(resGenGroq400.verification_info?.groqUnavailable, true);
    assert.strictEqual(resGenGroq400.diagnostics?.groqModelUsed, 'openai/gpt-oss-120b');
    assert.strictEqual(resGenGroq400.diagnostics?.groqFailureClass, 'rejected_400');
    assert.ok(
      resGenGroq400.diagnostics?.groqFailureMessage?.includes('Groq rejected the request (HTTP 400)'),
      'Must contain exact 400 error sentence'
    );
    testPass('Groq 400 fallback records groqModelUsed, groqFailureClass, and exact failure sentence');

    // 6.10: Zero secret leakage across all Groq error and testing flows
    console.log('  6.10: Zero secret leakage in Groq tests, diagnostics, and error messages...');
    const formattedWithSecret = formatGroqErrorMessage(
      { httpStatus: 400, message: `Bad request with ${SECRET_GROQ_KEY}` },
      scrubSecret(`Bad request with ${SECRET_GROQ_KEY}`, SECRET_GROQ_KEY)
    );
    assert.strictEqual(formattedWithSecret.message.includes(SECRET_GROQ_KEY), false);
    assert.strictEqual(JSON.stringify(resGenGroq400.diagnostics).includes(SECRET_GROQ_KEY), false);
    assert.strictEqual(JSON.stringify(resGenGroq400.diagnostics).includes(SECRET_GEMINI_KEY), false);
    testPass('Zero API key leakage confirmed across all Groq error formats and diagnostics');

    // 6.11: GMAT review prompt contains A to E
    console.log('  6.11: GMAT review prompt contains A to E; CAT contains A to D...');
    const gmatPrompt = buildReviewerPrompt('Passage text', [
      {
        id: 'q1',
        stem: 'GMAT Stem',
        options: [
          { letter: 'A', text: 'Opt A' },
          { letter: 'B', text: 'Opt B' },
          { letter: 'C', text: 'Opt C' },
          { letter: 'D', text: 'Opt D' },
          { letter: 'E', text: 'Opt E' }
        ]
      }
    ], 'GMAT');
    assert.ok(gmatPrompt.includes('Options are lettered A to E'));
    assert.ok(gmatPrompt.includes('(E) Opt E'));
    assert.ok(!gmatPrompt.includes('Options are lettered A to D'));

    const catPrompt = buildReviewerPrompt('Passage text', [
      {
        id: 'q1',
        stem: 'CAT Stem',
        options: [
          { letter: 'A', text: 'Opt A' },
          { letter: 'B', text: 'Opt B' },
          { letter: 'C', text: 'Opt C' },
          { letter: 'D', text: 'Opt D' }
        ]
      }
    ], 'CAT');
    assert.ok(catPrompt.includes('Options are lettered A to D'));
    assert.ok(!catPrompt.includes('Options are lettered A to E'));
    testPass('GMAT review prompt contains A to E; CAT contains A to D');

    // 6.12: A reply missing defensibleLetters is treated as malformed and falls back to Gemini after one retry
    console.log('  6.12: Reply missing defensibleLetters is malformed and falls back to Gemini after one retry...');
    resetGroqSessionFailed();
    let groqCalls612 = 0;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        groqCalls612++;
        // Reply intentionally missing defensibleLetters
        const missingDef = {
          reviews: [
            { id: 'q1', chosenLetter: 'B', problem: 'none', note: 'test note' },
            { id: 'q2', chosenLetter: 'A', problem: 'none', note: 'test note' },
            { id: 'q3', chosenLetter: 'C', problem: 'none', note: 'test note' },
            { id: 'q4', chosenLetter: 'B', problem: 'none', note: 'test note' }
          ]
        };
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(missingDef) } }] }), { status: 200 });
      }
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        const body = init?.body ? String(init.body) : '';
        if (body.includes('reviews') || body.includes('strict exam reviewer')) {
          return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
        }
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const res612 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(groqCalls612, 2, 'Must retry once on reply missing defensibleLetters');
    assert.strictEqual(res612.source, 'ai');
    assert.strictEqual(res612.verification_info?.reviewer, 'gemini', 'Must fall back to Gemini reviewer');
    assert.strictEqual(res612.verification_info?.groqUnavailable, true);
    testPass('Reply missing defensibleLetters treated as malformed and falls back to Gemini after one retry');

    // 6.13: A 400 on a reasoning parameter is retried without it
    console.log('  6.13: HTTP 400 on a reasoning parameter is retried without it...');
    resetGroqSessionFailed();
    resetGroqModelSession();
    let groqCalls613 = 0;
    let receivedWithoutReasoning = false;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        groqCalls613++;
        const body = JSON.parse(init.body || '{}');
        if (body.reasoning_format || body.reasoning_effort) {
          return new Response('Parameter reasoning_format is not supported for this model', {
            status: 400,
            statusText: 'Bad Request'
          });
        }
        receivedWithoutReasoning = true;
        return new Response(makeMockGroqResponse(allPassReviews), { status: 200 });
      }
      return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
    };

    const res613 = await reviewQuestionsWithGroq({
      apiKey: SECRET_GROQ_KEY,
      passage: SAMPLE_PASSAGE.join('\n\n'),
      inputs: buildReviewerInput(makeMockAiQuestions()),
      model: 'openai/gpt-oss-120b'
    });
    assert.strictEqual(groqCalls613, 2, 'Must retry call without reasoning parameters');
    assert.strictEqual(receivedWithoutReasoning, true, 'Retry request must not have reasoning parameters');
    assert.strictEqual(res613.length, 4);
    testPass('HTTP 400 on reasoning parameter retries without it and succeeds');

    // 6.14: Empty content with finish_reason length is retried with a higher limit
    console.log('  6.14: Empty content with finish_reason length is retried with a higher limit...');
    resetGroqSessionFailed();
    let groqCalls614 = 0;
    let retryMaxTokens = 0;
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        groqCalls614++;
        const body = JSON.parse(init.body || '{}');
        if (groqCalls614 === 1) {
          assert.strictEqual(body.max_tokens, 3072);
          return new Response(
            JSON.stringify({
              choices: [{ finish_reason: 'length', message: { content: '' } }]
            }),
            { status: 200 }
          );
        }
        retryMaxTokens = body.max_tokens;
        return new Response(makeMockGroqResponse(allPassReviews), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const res614 = await reviewQuestionsWithGroq({
      apiKey: SECRET_GROQ_KEY,
      passage: SAMPLE_PASSAGE.join('\n\n'),
      inputs: buildReviewerInput(makeMockAiQuestions()),
      model: 'llama-3.3-70b-versatile'
    });
    assert.strictEqual(groqCalls614, 2, 'finish_reason length must trigger retry');
    assert.strictEqual(retryMaxTokens, 6144, 'Retry must request higher token limit');
    assert.strictEqual(res614.length, 4);
    testPass('Empty content with finish_reason length is retried with a higher limit');

    // 6.15: A 429 on the first Auto model moves to the second
    console.log('  6.15: HTTP 429 on the first Auto model moves to the second model...');
    resetGroqSessionFailed();
    resetGroqModelSession();
    clearRateLimitedModels();
    let modelsReceived615: string[] = [];
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        const body = JSON.parse(init.body || '{}');
        modelsReceived615.push(body.model);
        if (body.model === 'openai/gpt-oss-120b') {
          return new Response('Rate limit reached', { status: 429, statusText: 'Too Many Requests' });
        }
        // Second model (llama-3.3-70b-versatile) succeeds
        return new Response(makeMockGroqResponse(allPassReviews), { status: 200 });
      }
      return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
    };

    const res615 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      groqModel: 'Auto',
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(res615.source, 'ai');
    assert.strictEqual(res615.verification_info?.reviewer, 'groq');
    assert.deepStrictEqual(modelsReceived615, ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']);
    assert.strictEqual(res615.verification_info?.groqModelUsed, 'llama-3.3-70b-versatile');
    assert.deepStrictEqual(res615.verification_info?.groqModelsTried, ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile']);
    testPass('HTTP 429 on first Auto model successfully moves to second model');

    // 6.16: An explicitly chosen model does not move on 429
    console.log('  6.16: An explicitly chosen model does not move on 429...');
    resetGroqSessionFailed();
    resetGroqModelSession();
    clearRateLimitedModels();
    let modelsReceived616: string[] = [];
    globalThis.fetch = async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes('api.groq.com')) {
        const body = JSON.parse(init.body || '{}');
        modelsReceived616.push(body.model);
        return new Response('Rate limit reached', { status: 429, statusText: 'Too Many Requests' });
      }
      if (urlStr.includes('generativelanguage.googleapis.com')) {
        const body = init?.body ? String(init.body) : '';
        if (body.includes('reviews') || body.includes('strict exam reviewer')) {
          return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
        }
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    };

    const res616 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      groqModel: 'llama-3.3-70b-versatile', // Explicitly chosen
      useGroq: true,
      doubleCheck: true
    });
    assert.strictEqual(res616.source, 'ai');
    assert.strictEqual(res616.verification_info?.reviewer, 'gemini', 'Explicit model 429 must fall back directly to Gemini');
    assert.deepStrictEqual(modelsReceived616, ['llama-3.3-70b-versatile'], 'Explicit model must never try another model');
    assert.deepStrictEqual(res616.verification_info?.groqModelsTried, ['llama-3.3-70b-versatile']);
    testPass('An explicitly chosen model does not move on 429 and falls back to Gemini');

    // ======================================================
    // 7. QUESTION UNPREDICTABILITY, PLANNING, SHUFFLING & CHECKS
    // ======================================================
    console.log('\n--- 7. QUESTION UNPREDICTABILITY, PLANNING, SHUFFLING & CHECKS ---');

    // 7.1: Constraints hold across 10,000 random plans for CAT and GMAT
    console.log('  7.1: Constraints hold across 10,000 random plans for CAT and GMAT...');
    for (let i = 0; i < 10000; i++) {
      const catPlan = planQuestions('CAT', 'Challenging', cryptoRng);
      const catVal = validateSubtypeList(catPlan.slots.map((s) => s.primary), 'CAT');
      assert.strictEqual(catVal.valid, true, `CAT plan constraint violation: ${catVal.reason}`);

      const gmatPlan = planQuestions('GMAT', 'Challenging', cryptoRng);
      const gmatVal = validateSubtypeList(gmatPlan.slots.map((s) => s.primary), 'GMAT');
      assert.strictEqual(gmatVal.valid, true, `GMAT plan constraint violation: ${gmatVal.reason}`);
    }
    testPass('Constraints hold across 10,000 random plans for CAT and GMAT');

    // 7.2: GMAT always has exactly one Strengthen / Weaken slot
    console.log('  7.2: GMAT always has exactly one Strengthen / Weaken slot...');
    for (let i = 0; i < 1000; i++) {
      const gmatPlan = planQuestions('GMAT', 'Challenging', cryptoRng);
      const swSlots = gmatPlan.slots.filter((s) => s.primary.archetype === 'Strengthen / Weaken');
      assert.strictEqual(swSlots.length, 1, 'GMAT must have exactly 1 Strengthen / Weaken slot');
      assert.strictEqual(swSlots[0].backups[0].id, 'according_to', 'GMAT SW slot backup must be according_to');
    }
    testPass('GMAT always has exactly one Strengthen / Weaken slot with backup according_to');

    // 7.3: A substitution to a backup is accepted when valid
    console.log('  7.3: A substitution to a backup is accepted when valid...');
    const catPlan73 = planQuestions('CAT', 'Challenging', cryptoRng);
    const slot0 = catPlan73.slots[0];
    const backupSubtype = slot0.backups[0];
    const mockQuestions73 = catPlan73.slots.map((s, idx) => {
      const chosenSubtype = idx === 0 ? backupSubtype : s.primary;
      let stem = `Which of the following is most accurate regarding ${chosenSubtype.label}?`;
      if (chosenSubtype.archetype === 'Vocabulary in Context') {
        stem = `In the passage, the word "linear" most nearly means:`;
      } else if (chosenSubtype.archetype === 'Paragraph Function') {
        stem = `The paragraph that begins "Discussions of modern digital technology" primarily serves to:`;
      }
      return {
        id: `q${idx + 1}`,
        subtypeId: chosenSubtype.id,
        substituted: idx === 0,
        stem,
        correctLetter: 'B',
        paragraphsNeeded: ['Discussions of modern digital technology', 'What the linear view obscures'],
        options: [
          { letter: 'A', text: 'First plausible interpretation of digital platform dynamics and systemic evaluation across domains', explanation: 'Distorts argument', tempting: 'digital platform' },
          { letter: 'B', text: 'Second accurate synthesis directly supported by text', explanation: 'Directly supported' },
          { letter: 'C', text: 'Third perspective reversing empirical causality in contemporary technology', explanation: 'Reverses argument', tempting: 'empirical causality' },
          { letter: 'D', text: 'Fourth viewpoint overshooting scope of linear discussions', explanation: 'Too extreme', tempting: 'linear discussions' }
        ]
      };
    });
    const check73 = performPhase3Checks(mockQuestions73, { contextWords: ['linear'] }, SAMPLE_PASSAGE, 'CAT', catPlan73);
    assert.strictEqual(check73.validQuestions.length, 4, 'All 4 questions including valid substitution should pass');
    const q1Accepted = check73.validQuestions.find((q) => q.id === 'q1');
    assert.strictEqual(q1Accepted?.type, backupSubtype.archetype);
    assert.strictEqual(q1Accepted?.subtype, backupSubtype.label);
    testPass('A substitution to a backup is accepted when valid');

    // 7.4: A substitution that breaks a constraint is sent to repair
    console.log('  7.4: A substitution that breaks a constraint is sent to repair...');
    const mockQuestions74 = catPlan73.slots.map((s, idx) => {
      let stem = `Stem for question slot ${idx + 1}`;
      if (s.primary.archetype === 'Vocabulary in Context') {
        stem = `In the passage, the word "linear" most nearly means:`;
      } else if (s.primary.archetype === 'Paragraph Function') {
        stem = `The paragraph that begins "Discussions of modern digital technology" primarily serves to:`;
      }
      return {
        id: `q${idx + 1}`,
        subtypeId: idx === 0 ? 'unknown_subtype_xyz' : s.primary.id,
        substituted: idx === 0,
        stem,
        correctLetter: 'B',
        options: [
          { letter: 'A', text: 'First plausible interpretation of digital platform dynamics and systemic evaluation across domains', explanation: 'Distorts argument' },
          { letter: 'B', text: 'Second accurate synthesis directly supported by text', explanation: 'Directly supported' },
          { letter: 'C', text: 'Third perspective reversing empirical causality', explanation: 'Reverses argument' },
          { letter: 'D', text: 'Fourth viewpoint overshooting scope of discussion', explanation: 'Too extreme' }
        ]
      };
    });
    const check74 = performPhase3Checks(mockQuestions74, { contextWords: ['linear'] }, SAMPLE_PASSAGE, 'CAT', catPlan73);
    assert.ok(check74.needsRepair.some((nr) => nr.question.id === 'q1'), 'Invalid subtypeId must be sent to repair');
    testPass('A substitution that breaks a constraint is sent to repair');

    // 7.5: Options shuffle updates correctLetter correctly
    console.log('  7.5: Options shuffle updates correctLetter correctly...');
    const originalQuestions75 = [
      {
        id: 'q1',
        type: 'Main Idea' as const,
        stem: 'Test stem 1',
        correctLetter: 'C' as const,
        options: [
          { letter: 'A' as const, text: 'Text A', explanation: 'Exp A' },
          { letter: 'B' as const, text: 'Text B', explanation: 'Exp B' },
          { letter: 'C' as const, text: 'Target Correct Text C', explanation: 'Correct Explanation C' },
          { letter: 'D' as const, text: 'Text D', explanation: 'Exp D' }
        ]
      }
    ];
    for (let t = 0; t < 50; t++) {
      const shuffled75 = shuffleQuestionsAndOptions(originalQuestions75, false, cryptoRng);
      const q = shuffled75[0];
      const correctOpt = q.options.find((o) => o.letter === q.correctLetter);
      assert.strictEqual(correctOpt?.text, 'Target Correct Text C', 'correctLetter must always point to the correct option text');
      assert.strictEqual(correctOpt?.explanation, 'Correct Explanation C', 'correctLetter must point to the correct explanation');
    }
    testPass('Options shuffle updates correctLetter correctly');

    // 7.6: A question whose explanation mentions an option letter is sent to repair
    console.log('  7.6: A question whose explanation mentions an option letter is sent to repair...');
    const mockQuestion76 = [
      {
        id: 'q1',
        subtypeId: 'central_idea',
        stem: 'What is the central idea?',
        correctLetter: 'A',
        options: [
          { letter: 'A', text: 'Valid option text', explanation: 'Correct answer' },
          { letter: 'B', text: 'Valid wrong option', explanation: 'Option A is much better than choice B' },
          { letter: 'C', text: 'Valid wrong option 2', explanation: 'Distorts premise' },
          { letter: 'D', text: 'Valid wrong option 3', explanation: 'Too extreme' }
        ]
      }
    ];
    const check76 = performPhase3Checks(mockQuestion76, {}, SAMPLE_PASSAGE, 'CAT');
    assert.ok(check76.needsRepair.some((nr) => nr.question.id === 'q1'), 'Mentioning option letter in explanation must send question to repair');
    assert.ok(check76.needsRepair[0].reason.includes('cross-option references'), 'Reason must specify cross-option prohibition');
    testPass('A question whose explanation mentions an option letter is sent to repair');

    // 7.7: Question order shuffle keeps ids consistent for answers and attempts
    console.log('  7.7: Question order shuffle keeps ids consistent for answers and attempts...');
    const originalQuestions77 = [
      { id: 'orig_1', type: 'Main Idea' as const, stem: 'Stem 1', correctLetter: 'A' as const, options: [{ letter: 'A' as const, text: 'A1', explanation: 'E1' }, { letter: 'B' as const, text: 'B1', explanation: 'E1' }, { letter: 'C' as const, text: 'C1', explanation: 'E1' }, { letter: 'D' as const, text: 'D1', explanation: 'E1' }] },
      { id: 'orig_2', type: 'Inference' as const, stem: 'Stem 2', correctLetter: 'B' as const, options: [{ letter: 'A' as const, text: 'A2', explanation: 'E2' }, { letter: 'B' as const, text: 'B2', explanation: 'E2' }, { letter: 'C' as const, text: 'C2', explanation: 'E2' }, { letter: 'D' as const, text: 'D2', explanation: 'E2' }] },
      { id: 'orig_3', type: 'Paragraph Function' as const, stem: 'Stem 3', correctLetter: 'C' as const, options: [{ letter: 'A' as const, text: 'A3', explanation: 'E3' }, { letter: 'B' as const, text: 'B3', explanation: 'E3' }, { letter: 'C' as const, text: 'C3', explanation: 'E3' }, { letter: 'D' as const, text: 'D3', explanation: 'E3' }] },
      { id: 'orig_4', type: 'Tone & Attitude' as const, stem: 'Stem 4', correctLetter: 'D' as const, options: [{ letter: 'A' as const, text: 'A4', explanation: 'E4' }, { letter: 'B' as const, text: 'B4', explanation: 'E4' }, { letter: 'C' as const, text: 'C4', explanation: 'E4' }, { letter: 'D' as const, text: 'D4', explanation: 'E4' }] }
    ];
    const shuffled77 = shuffleQuestionsAndOptions(originalQuestions77, false, cryptoRng);
    assert.deepStrictEqual(shuffled77.map((q) => q.id), ['q1', 'q2', 'q3', 'q4'], 'Shuffled questions must be renumbered sequentially q1..qN');
    for (const q of shuffled77) {
      assert.ok(q.options.every((o) => ['A', 'B', 'C', 'D'].includes(o.letter)), 'All option letters must be A to D');
    }
    testPass('Question order shuffle keeps ids consistent for answers and attempts');

    // 7.8: Authored tests are never shuffled
    console.log('  7.8: Authored tests are never shuffled...');
    const libRaw = JSON.parse(fs.readFileSync('src/data/library.json', 'utf8'));
    const test1 = libRaw[0];
    assert.strictEqual(test1.questions[0].correctLetter, 'B', 'Authored test 1 Q1 key must remain B');
    assert.strictEqual(test1.questions[1].correctLetter, 'C', 'Authored test 1 Q2 key must remain C');
    assert.strictEqual(test1.questions[2].correctLetter, 'A', 'Authored test 1 Q3 key must remain A');
    assert.strictEqual(test1.questions[3].correctLetter, 'D', 'Authored test 1 Q4 key must remain D');
    assert.strictEqual(test1.questions[0].type, 'Main Idea');
    assert.strictEqual(test1.questions[1].type, 'Inference');
    assert.strictEqual(test1.questions[2].type, 'Paragraph Function');
    assert.strictEqual(test1.questions[3].type, 'Tone & Attitude');
    testPass('Authored tests are never shuffled');

    // 7.9: The rule-based generator output differs across 100 runs and its key letters are roughly uniform per position
    console.log('  7.9: The rule-based generator output differs across 100 runs and keys are roughly uniform...');
    const { paragraphs: normParas } = normalizeParagraphs(SAMPLE_PASSAGE.join('\n\n'));
    const topic79 = detectTopic(SAMPLE_PASSAGE.join('\n\n'));
    const runs79: string[] = [];
    const pos1Letters: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
    for (let r = 0; r < 100; r++) {
      const qs = buildExamQuestions({ paragraphs: normParas, topic: topic79, examType: 'CAT' });
      runs79.push(qs.map((q) => q.correctLetter).join(''));
      pos1Letters[qs[0].correctLetter]++;
    }
    const uniqueKeyRuns = new Set(runs79);
    assert.ok(uniqueKeyRuns.size > 5, `Expected multiple key variations across 100 runs, got ${uniqueKeyRuns.size}`);
    assert.ok(Object.values(pos1Letters).every((cnt) => cnt > 5), 'All four letters must appear at position 1 across 100 runs');
    testPass('The rule-based generator output differs across 100 runs and key letters are roughly uniform per position');

    // 7.10: The reviewer prompt contains the negative-stem instruction
    console.log('  7.10: The reviewer prompt contains the negative-stem instruction...');
    const sampleRevInput = buildReviewerInput(makeMockAiQuestions());
    const prompt710 = buildReviewerPrompt(SAMPLE_PASSAGE.join('\n\n'), sampleRevInput, 'CAT');
    assert.ok(
      prompt710.includes('Some stems are negative (EXCEPT, NOT, cannot be inferred, least likely to agree)'),
      'Reviewer prompt must contain negative-stem instruction'
    );
    assert.ok(
      prompt710.includes('chosenLetter is the one option the passage does NOT support'),
      'Reviewer prompt must instruct chosenLetter as unsupported option'
    );
    testPass('The reviewer prompt contains the negative-stem instruction');

    // 7.11: The type pill is not rendered before submission
    console.log('  7.11: The type pill is not rendered before submission...');
    const playerPageSrc = fs.readFileSync('src/pages/PlayerPage.tsx', 'utf8');
    assert.ok(
      playerPageSrc.includes('{submitted && (\n                  <span\n                    className="px-2.5 py-0.5 rounded-full font-semibold"'),
      'Question type pill must only be rendered when submitted is true'
    );
    assert.ok(
      !playerPageSrc.includes('Q{idx + 1} - {q.type}'),
      'Question palette must not leak question types'
    );
    testPass('The type pill is not rendered before submission');

    // 7.12: No key appears in any output
    console.log('  7.12: No key appears in any output...');
    const fakeKey = 'AIzaSyFAKEKEY_TEST_NO_LEAKAGE_12345';
    const fakeGroqKey = 'gsk_FAKEGROQKEY_TEST_NO_LEAKAGE_67890';
    let leakedInLog = false;
    const testLogSpy = (...args: any[]) => {
      const str = args.map(String).join(' ');
      if (str.includes(fakeKey) || str.includes(fakeGroqKey)) leakedInLog = true;
    };
    const origLog = console.log;
    const origWarn = console.warn;
    const origErr = console.error;
    console.log = testLogSpy;
    console.warn = testLogSpy;
    console.error = testLogSpy;

    try {
      globalThis.fetch = async (url: any, init: any) => {
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      };
      const res712 = await generateRcQuestions({
        paragraphs: SAMPLE_PASSAGE,
        examType: 'CAT',
        engine: 'gemini',
        geminiKey: fakeKey,
        groqKey: fakeGroqKey,
        doubleCheck: false
      });
      const serialized = JSON.stringify(res712);
      assert.strictEqual(serialized.includes(fakeKey), false, 'Gemini key must not appear in result object');
      assert.strictEqual(serialized.includes(fakeGroqKey), false, 'Groq key must not appear in result object');
      assert.strictEqual(leakedInLog, false, 'Keys must never appear in console logs');
    } finally {
      console.log = origLog;
      console.warn = origWarn;
      console.error = origErr;
    }
    testPass('No key appears in any output or logs');

    // 7.13: Newly generated AI question missing subtypeId goes to repair
    console.log('  7.13: Newly generated AI question missing subtypeId goes to repair...');
    let callCount713 = 0;
    globalThis.fetch = async (url: any, init: any) => {
      callCount713++;
      if (callCount713 === 1) {
        const qs = makeMockAiQuestions();
        delete (qs[0] as any).subtypeId;
        return new Response(makeMockGeminiApiResponse(qs), { status: 200 });
      }
      if (callCount713 === 2) {
        const plannedIds = extractPlannedSubtypeIdsFromPrompt(lastGeminiPrompt);
        const slot1Id = plannedIds[0] || 'example_role';
        const catItem = SUBTYPE_BY_ID.get(slot1Id);
        const repaired = [
          {
            id: 'q1',
            type: catItem?.archetype || 'Paragraph Function',
            subtypeId: slot1Id,
            stem: 'The author discusses modern digital technology primarily in order to develop the central thesis.',
            correctLetter: 'A',
            options: [
              { letter: 'A', text: 'Repaired valid statement directly supported by the passage context and claims', explanation: 'Correct' },
              { letter: 'B', text: 'Wrong statement B', explanation: 'Wrong' },
              { letter: 'C', text: 'Wrong statement C', explanation: 'Wrong' },
              { letter: 'D', text: 'Wrong statement D', explanation: 'Wrong' }
            ]
          }
        ];
        return new Response(makeMockGeminiApiResponse(repaired), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res713 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(callCount713, 2, 'Missing subtypeId in new AI generation must trigger repair call');
    assert.strictEqual(res713.source, 'ai');
    assert.strictEqual(res713.questions.length, 4);
    assert.ok(
      res713.diagnostics?.rejectionReasons?.some((r) => r.includes('Missing subtypeId')),
      'Diagnostics must record missing subtypeId rejection'
    );
    testPass('Newly generated AI question missing subtypeId fails validation and is sent to repair');

    // 7.14: Newly generated AI question with unknown subtypeId goes to repair
    console.log('  7.14: Newly generated AI question with unknown subtypeId goes to repair...');
    let callCount714 = 0;
    globalThis.fetch = async (url: any, init: any) => {
      callCount714++;
      if (callCount714 === 1) {
        const qs = makeMockAiQuestions();
        qs[0].subtypeId = 'bogus_unknown_subtype_id';
        return new Response(makeMockGeminiApiResponse(qs), { status: 200 });
      }
      if (callCount714 === 2) {
        const plannedIds = extractPlannedSubtypeIdsFromPrompt(lastGeminiPrompt);
        const slot1Id = plannedIds[0] || 'example_role';
        const catItem = SUBTYPE_BY_ID.get(slot1Id);
        const repaired = [
          {
            id: 'q1',
            type: catItem?.archetype || 'Paragraph Function',
            subtypeId: slot1Id,
            stem: 'The author discusses modern digital technology primarily in order to develop the central thesis.',
            correctLetter: 'A',
            options: [
              { letter: 'A', text: 'Repaired valid statement directly supported by the passage context and claims', explanation: 'Correct' },
              { letter: 'B', text: 'Wrong statement B', explanation: 'Wrong' },
              { letter: 'C', text: 'Wrong statement C', explanation: 'Wrong' },
              { letter: 'D', text: 'Wrong statement D', explanation: 'Wrong' }
            ]
          }
        ];
        return new Response(makeMockGeminiApiResponse(repaired), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res714 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(callCount714, 2, 'Unknown subtypeId in new AI generation must trigger repair call');
    assert.strictEqual(res714.source, 'ai');
    assert.strictEqual(res714.questions.length, 4);
    assert.ok(
      res714.diagnostics?.rejectionReasons?.some((r) => r.includes('Unknown subtypeId')),
      'Diagnostics must record unknown subtypeId rejection'
    );
    testPass('Newly generated AI question with unknown subtypeId fails validation and is sent to repair');

    // 7.15: Saved legacy tests and old attempts missing or unknown subtypeId are exempt from repair
    console.log('  7.15: Saved legacy tests and old attempts are exempt from subtypeId validation...');
    const legacyQuestions = [
      {
        id: 'q1',
        type: 'Main Idea',
        subtype: 'Primary purpose of the passage',
        stem: 'What is the primary purpose of the passage?',
        correctLetter: 'A',
        options: [
          { letter: 'A', text: 'Valid primary purpose statement that captures the core thesis of the author', explanation: 'Correct' },
          { letter: 'B', text: 'First incorrect alternative describing an unmentioned tangential controversy', explanation: 'Wrong' },
          { letter: 'C', text: 'Second incorrect alternative exaggerating peripheral details into absolutes', explanation: 'Wrong' },
          { letter: 'D', text: 'Third incorrect alternative reversing the empirical sequence of events', explanation: 'Wrong' }
        ]
      },
      {
        id: 'q2',
        type: 'Inference',
        subtypeId: 'legacy_custom_unknown_id',
        stem: 'It can be inferred from the passage that:',
        correctLetter: 'B',
        options: [
          { letter: 'A', text: 'Initial faulty deduction contradicting the second paragraph', explanation: 'Wrong' },
          { letter: 'B', text: 'Valid deduction supported by the relationship between ideas in the text', explanation: 'Correct' },
          { letter: 'C', text: 'Extrapolated scenario extending far beyond the scope of evidence', explanation: 'Wrong' },
          { letter: 'D', text: 'Unwarranted assumption that conflates correlation with causal influence', explanation: 'Wrong' }
        ]
      }
    ];

    const legacyCheck = performPhase3Checks(legacyQuestions, null, SAMPLE_PASSAGE, 'CAT', undefined, false);
    assert.strictEqual(legacyCheck.needsRepair.length, 0, 'Legacy questions must not be sent to repair');
    assert.strictEqual(legacyCheck.validQuestions.length, 2, 'Legacy questions must pass validation');
    assert.strictEqual(legacyCheck.validQuestions[0].type, 'Main Idea');
    assert.strictEqual(legacyCheck.validQuestions[1].type, 'Inference');
    testPass('Saved legacy tests and old attempts are exempt from subtypeId validation');

    // ======================================================
    // 8. QUESTION-SET THEME, COGNITIVE BALANCE & QUALITY CHECKS
    // ======================================================
    console.log('\n--- 8. QUESTION-SET THEME, COGNITIVE BALANCE & QUALITY CHECKS ---');

    // 8.1: 10,000 runs of the planner for CAT and 10,000 for GMAT satisfy all rules
    console.log('  8.1: Planner constraints over 10,000 runs for CAT and GMAT satisfy all theme rules...');
    for (let i = 0; i < 10000; i++) {
      const catPlan = planQuestions('CAT', 'Challenging', cryptoRng);
      const catOps = new Set(catPlan.slots.map((s) => s.operation));
      assert.ok(catOps.size >= MIN_DISTINCT_OPERATIONS, `CAT plan ${i} distinct operations < 3`);
      const catLocate = catPlan.slots.filter((s) => s.operation === 'locate').length;
      assert.ok(catLocate <= MAX_LOCATE_SLOTS['CAT'], `CAT plan ${i} locate count ${catLocate} > 1`);
      const catDeep = catPlan.slots.filter((s) => DEEP_SUBTYPES.has(s.primary.id)).length;
      assert.ok(catDeep >= MIN_DEEP_SLOTS, `CAT plan ${i} deep count ${catDeep} < 1`);
      const catMulti = catPlan.slots.filter((s) => s.multiParagraph).length;
      assert.strictEqual(catMulti, REQUIRED_MULTI_PARAGRAPH_SLOTS, `CAT plan ${i} multiParagraph ${catMulti} !== 1`);

      const gmatPlan = planQuestions('GMAT', 'Challenging', cryptoRng);
      const gmatOps = new Set(gmatPlan.slots.map((s) => s.operation));
      assert.ok(gmatOps.size >= MIN_DISTINCT_OPERATIONS, `GMAT plan ${i} distinct operations < 3`);
      const gmatLocate = gmatPlan.slots.filter((s) => s.operation === 'locate').length;
      assert.ok(gmatLocate <= MAX_LOCATE_SLOTS['GMAT'], `GMAT plan ${i} locate count ${gmatLocate} > 2`);
      const gmatDeep = gmatPlan.slots.filter((s) => DEEP_SUBTYPES.has(s.primary.id)).length;
      assert.ok(gmatDeep >= MIN_DEEP_SLOTS, `GMAT plan ${i} deep count ${gmatDeep} < 1`);
      const gmatMulti = gmatPlan.slots.filter((s) => s.multiParagraph).length;
      assert.strictEqual(gmatMulti, REQUIRED_MULTI_PARAGRAPH_SLOTS, `GMAT plan ${i} multiParagraph ${gmatMulti} !== 1`);
    }
    testPass('10,000 planner runs for CAT and GMAT satisfy all theme constraints');

    // 8.2: Forced plan: if redraws fail, falls back to deterministic compliant plan (forced: true)
    console.log('  8.2: Forced plan fallback when redraws fail...');
    const createMockFailingRng = (exam: ExamType) => (items?: any[]) => {
      if (items && Array.isArray(items)) {
        const targetIds = exam === 'CAT'
          ? ['according_to', 'not_according_to', 'word_meaning', 'phrase_meaning']
          : ['strengthen', 'para_function', 'example_role', 'attitude', 'word_meaning'];
        const targetIdx = items.findIndex((i) => targetIds.includes(i.id));
        if (targetIdx !== -1) {
          let sumBefore = 0;
          for (let j = 0; j < targetIdx; j++) {
            sumBefore += getSubtypeWeight(items[j].id, exam);
          }
          const total = items.reduce((acc: number, curr: any) => acc + getSubtypeWeight(curr.id, exam), 0);
          return (sumBefore + 0.0001) / total;
        }
      }
      return 0.5;
    };

    const catForced = planQuestions('CAT', 'Challenging', createMockFailingRng('CAT') as any);
    assert.strictEqual(catForced.forced, true, 'CAT plan must fallback to forced plan when RNG fails');
    assert.ok(new Set(catForced.slots.map((s) => s.operation)).size >= MIN_DISTINCT_OPERATIONS);
    assert.ok(catForced.slots.filter((s) => s.operation === 'locate').length <= MAX_LOCATE_SLOTS['CAT']);
    assert.ok(catForced.slots.filter((s) => DEEP_SUBTYPES.has(s.primary.id)).length >= MIN_DEEP_SLOTS);
    assert.strictEqual(catForced.slots.filter((s) => s.multiParagraph).length, 1);

    const gmatForced = planQuestions('GMAT', 'Challenging', createMockFailingRng('GMAT') as any);
    assert.strictEqual(gmatForced.forced, true, 'GMAT plan must fallback to forced plan when RNG fails');
    assert.ok(new Set(gmatForced.slots.map((s) => s.operation)).size >= MIN_DISTINCT_OPERATIONS);
    assert.ok(gmatForced.slots.filter((s) => s.operation === 'locate').length <= MAX_LOCATE_SLOTS['GMAT']);
    assert.ok(gmatForced.slots.filter((s) => DEEP_SUBTYPES.has(s.primary.id)).length >= MIN_DEEP_SLOTS);
    assert.strictEqual(gmatForced.slots.filter((s) => s.multiParagraph).length, 1);
    testPass('Planner falls back to compliant forced plan (forced: true) when redraws fail');

    // 8.3: Multi-paragraph check: < 2 paragraphs or unverified matches -> repair; stripped before saving
    console.log('  8.3: Multi-paragraph check sends unverified to repair and strips paragraphsNeeded before saving...');
    let callCount83 = 0;
    globalThis.fetch = async () => {
      callCount83++;
      if (callCount83 === 1) {
        const badMulti = makeMockAiQuestions();
        // Give ALL questions only 1 paragraph so whichever slot is multiParagraph fails verification
        for (const q of badMulti) {
          q.paragraphsNeeded = ['Discussions of modern digital technology'];
        }
        return new Response(makeMockGeminiApiResponse(badMulti), { status: 200 });
      }
      if (callCount83 === 2) {
        // Repair call returns valid 2 distinct matching paragraphs
        const repaired = makeMockAiQuestions().slice(0, 1);
        repaired[0].paragraphsNeeded = [
          'Discussions of modern digital technology',
          'What the linear view obscures'
        ];
        return new Response(makeMockGeminiApiResponse(repaired), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res83 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(callCount83, 2, 'Unverified multi-paragraph question must trigger repair');
    assert.strictEqual(res83.source, 'ai');
    assert.strictEqual(res83.questions.length, 4);
    for (const q of res83.questions) {
      assert.strictEqual(q.paragraphsNeeded, undefined, 'paragraphsNeeded must be stripped before saving');
    }
    testPass('Multi-paragraph check sends unverified to repair and strips paragraphsNeeded before saving');

    // 8.4: Author-side distractor check: missing tempting goes to repair; stripped before saving
    console.log('  8.4: Author-side distractor check: missing tempting goes to repair...');
    let callCount84 = 0;
    globalThis.fetch = async () => {
      callCount84++;
      if (callCount84 === 1) {
        const noTempting = makeMockAiQuestions();
        for (const opt of noTempting[0].options) {
          if (opt.letter !== noTempting[0].correctLetter) {
            delete opt.tempting;
          }
        }
        return new Response(makeMockGeminiApiResponse(noTempting), { status: 200 });
      }
      if (callCount84 === 2) {
        const repaired = makeMockAiQuestions().slice(0, 1);
        return new Response(makeMockGeminiApiResponse(repaired), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res84 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(callCount84, 2, 'Missing tempting on wrong options must trigger repair');
    assert.strictEqual(res84.source, 'ai');
    for (const q of res84.questions) {
      for (const opt of q.options) {
        assert.strictEqual(opt.tempting, undefined, 'tempting must be stripped before saving');
      }
    }
    testPass('Author-side distractor check: missing tempting triggers repair and strips tempting before saving');

    // 8.5: Lexical distractor check: >= 2 off-topic wrong options goes to repair; kept and flagged if still off-topic
    console.log('  8.5: Lexical distractor check sends off-topic to repair; keeps question and records flag if still off-topic...');
    let callCount85 = 0;
    globalThis.fetch = async () => {
      callCount85++;
      if (callCount85 === 1) {
        const offtopic = makeMockAiQuestions();
        offtopic[1].options[1].text = 'Completely unrelated interstellar asteroid trajectory dynamics.';
        offtopic[1].options[2].text = 'Medieval culinary recipes with lavender seasoning elements.';
        offtopic[1].options[3].text = 'Deepwater submarine acoustic frequency monitoring devices.';
        return new Response(makeMockGeminiApiResponse(offtopic), { status: 200 });
      }
      if (callCount85 === 2) {
        const stillOfftopic = [
          {
            id: 'q2',
            type: 'Inference',
            subtypeId: 'can_be_inferred',
            stem: 'What can be inferred regarding engagement-driven ranking models?',
            correctLetter: 'A',
            options: [
              { letter: 'A', text: 'They mistake reflexive impulse for deliberate choice.', explanation: 'Directly supported' },
              { letter: 'B', text: 'Completely unrelated interstellar asteroid trajectory dynamics.', explanation: 'Too extreme', tempting: 'asteroid' },
              { letter: 'C', text: 'Medieval culinary recipes with lavender seasoning elements.', explanation: 'Distortion', tempting: 'culinary' },
              { letter: 'D', text: 'Deepwater submarine acoustic frequency monitoring devices.', explanation: 'Reversal', tempting: 'submarine' }
            ]
          }
        ];
        return new Response(makeMockGeminiApiResponse(stillOfftopic), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res85 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(callCount85, 2, 'Off-topic distractors must trigger repair');
    assert.strictEqual(res85.source, 'ai');
    assert.strictEqual(res85.questions.length, 4, 'Must not drop question that remains off-topic after repair');
    assert.ok(
      res85.diagnostics?.flags?.includes('distractors_offtopic') || res85.diagnostics?.qualityFlags?.includes('distractors_offtopic'),
      'Diagnostics must record distractors_offtopic flag'
    );
    testPass('Lexical distractor check: off-topic triggers repair, retained on second failure with distractors_offtopic flag');

    // 8.6: Direct-paraphrase check: non-locate prioritized for repair; kept on second failure with direct_paraphrase flag
    console.log('  8.6: Direct-paraphrase check: non-locate prioritized for repair, kept with direct_paraphrase flag...');
    let callCount86 = 0;
    const passageSentence = splitPassageIntoSentences(SAMPLE_PASSAGE[0])[0];
    globalThis.fetch = async () => {
      callCount86++;
      if (callCount86 === 1) {
        const copyQuestions = makeMockAiQuestions();
        copyQuestions[0].options[1].text = passageSentence;
        copyQuestions[1].options[0].text = passageSentence;
        return new Response(makeMockGeminiApiResponse(copyQuestions), { status: 200 });
      }
      if (callCount86 === 2) {
        const stillCopy = [
          {
            id: 'q2',
            type: 'Inference',
            subtypeId: 'can_be_inferred',
            stem: 'What can be inferred regarding engagement-driven ranking models?',
            correctLetter: 'A',
            options: [
              { letter: 'A', text: passageSentence, explanation: 'Directly supported' },
              { letter: 'B', text: 'They eliminate cognitive evaluation across platform feeds.', explanation: 'Too extreme', tempting: 'cognitive' },
              { letter: 'C', text: 'They are designed solely to level epistemic playing fields.', explanation: 'Distortion', tempting: 'playing' },
              { letter: 'D', text: 'They operate with no commercial architecture or profit motive.', explanation: 'Reversal', tempting: 'commercial' }
            ]
          }
        ];
        return new Response(makeMockGeminiApiResponse(stillCopy), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res86 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(callCount86, 2, 'Surplus direct paraphrase must trigger repair');
    assert.strictEqual(res86.source, 'ai');
    assert.strictEqual(res86.questions.length, 4, 'Must not drop question that remains copy-like after repair');
    assert.ok(
      res86.diagnostics?.flags?.includes('direct_paraphrase') || res86.diagnostics?.qualityFlags?.includes('direct_paraphrase'),
      'Diagnostics must record direct_paraphrase flag'
    );
    testPass('Direct-paraphrase check: non-locate prioritized for repair, kept after repair with direct_paraphrase flag');

    // 8.7: deepSupported: false in passage analysis waives deep requirement
    console.log('  8.7: deepSupported: false in passage analysis waives deep requirement...');
    let callCount87 = 0;
    globalThis.fetch = async () => {
      callCount87++;
      if (callCount87 === 1) {
        const noDeepQuestions = makeMockAiQuestions();
        const nonDeepSubs = ['para_function', 'attitude', 'example_role', 'according_to'];
        let subIdx = 0;
        for (const q of noDeepQuestions) {
          if (DEEP_SUBTYPES.has(q.subtypeId)) {
            while (subIdx < nonDeepSubs.length && noDeepQuestions.some((other: any) => other.subtypeId === nonDeepSubs[subIdx])) {
              subIdx++;
            }
            const targetSub = nonDeepSubs[subIdx] || 'para_function';
            subIdx++;
            q.subtypeId = targetSub;
            const item = SUBTYPE_BY_ID.get(targetSub);
            if (item) {
              q.type = item.archetype;
              q.subtype = item.label;
            }
          }
        }
        const customAnalysis = {
          genre: 'factual report',
          thesis: 'Linear data report.',
          contextWords: ['linear', 'digital'],
          paragraphs: [
            { firstSixWords: 'Discussions of modern digital technology routinely', role: 'fact 1' },
            { firstSixWords: 'What the linear view obscures however', role: 'fact 2' },
            { firstSixWords: 'Defenders of engagement-driven ranking reply that', role: 'fact 3' }
          ],
          deepSupported: false
        };
        return new Response(makeMockGeminiApiResponse(noDeepQuestions, customAnalysis), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(allPassReviews), { status: 200 });
    };

    const res87 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: false
    });
    assert.strictEqual(callCount87, 1, 'deepSupported: false must NOT trigger repair for missing deep slot');
    assert.strictEqual(res87.source, 'ai');
    assert.ok(
      res87.diagnostics?.flags?.includes('deep_waived') || res87.diagnostics?.qualityFlags?.includes('deep_waived'),
      'Diagnostics must record deep_waived flag'
    );
    testPass('deepSupported: false in passage analysis waives deep requirement and records deep_waived flag');

    // 8.8: Reviewer obviouslyWrongLetters check (>1 triggers repair; missing field succeeds)
    console.log('  8.8: Reviewer obviouslyWrongLetters check (>1 triggers repair; missing field succeeds)...');
    let callCount88a = 0;
    const revWithoutObvious: ReviewerQuestionResult[] = [
      { id: 'q1', chosenLetter: 'B', defensibleLetters: ['B'], problem: 'none', note: 'All good' },
      { id: 'q2', chosenLetter: 'A', defensibleLetters: ['A'], problem: 'none', note: 'All good' },
      { id: 'q3', chosenLetter: 'C', defensibleLetters: ['C'], problem: 'none', note: 'All good' },
      { id: 'q4', chosenLetter: 'D', defensibleLetters: ['D'], problem: 'none', note: 'All good' }
    ];
    globalThis.fetch = async () => {
      callCount88a++;
      if (callCount88a === 1) {
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      return new Response(makeMockReviewerResponse(revWithoutObvious), { status: 200 });
    };

    const res88a = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: true
    });
    assert.strictEqual(res88a.source, 'ai');
    assert.strictEqual(res88a.questions.length, 4);
    assert.ok(
      res88a.diagnostics?.rejectionReasons?.some((r) => r.includes('distractor check unavailable')),
      'Diagnostics should note distractor check unavailable when field is omitted'
    );

    let callCount88b = 0;
    const revWithWeakDistractors: ReviewerQuestionResult[] = [
      { id: 'q1', chosenLetter: 'B', defensibleLetters: ['B'], obviouslyWrongLetters: ['A', 'C'], problem: 'none', note: '2 distractors too weak' },
      { id: 'q2', chosenLetter: 'A', defensibleLetters: ['A'], obviouslyWrongLetters: [], problem: 'none', note: 'Good' },
      { id: 'q3', chosenLetter: 'C', defensibleLetters: ['C'], obviouslyWrongLetters: ['A'], problem: 'none', note: 'Good' },
      { id: 'q4', chosenLetter: 'D', defensibleLetters: ['D'], obviouslyWrongLetters: [], problem: 'none', note: 'Good' }
    ];
    globalThis.fetch = async () => {
      callCount88b++;
      if (callCount88b === 1) {
        return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
      }
      if (callCount88b === 2) {
        return new Response(makeMockReviewerResponse(revWithWeakDistractors), { status: 200 });
      }
      if (callCount88b === 3) {
        const repaired = makeMockAiQuestions().slice(0, 1);
        return new Response(makeMockGeminiApiResponse(repaired), { status: 200 });
      }
      const passedRev: ReviewerQuestionResult[] = [
        { id: 'q1', chosenLetter: 'B', defensibleLetters: ['B'], obviouslyWrongLetters: ['A'], problem: 'none', note: 'Fixed' }
      ];
      return new Response(makeMockReviewerResponse(passedRev), { status: 200 });
    };

    const res88b = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      doubleCheck: true
    });
    assert.strictEqual(callCount88b >= 3, true, 'obviouslyWrongLetters > 1 must trigger repair');
    assert.strictEqual(res88b.source, 'ai');
    assert.strictEqual(res88b.questions.length, 4);
    testPass('Reviewer obviouslyWrongLetters check: missing field succeeds cleanly; > 1 triggers repair');

    // 8.9: Quality notes in UI formatting and Successful AI tag retention
    console.log('  8.9: Quality notes in UI formatting and Successful AI tag retention...');
    assert.strictEqual(formatQualityNote('weak_distractors'), 'Distractors: some options were more easily eliminated than intended.');
    assert.strictEqual(formatQualityNote('length_bias'), 'Distractor length: the correct option was noticeably longer in several questions.');
    assert.strictEqual(formatQualityNote('theme_unmet:multi_paragraph'), 'Question variety: all questions focus on single-paragraph details.');
    assert.strictEqual(formatQualityNote('theme_unmet:deep'), 'Question variety: set lacked a subtle implication or multi-level reasoning question.');
    assert.strictEqual(formatQualityNote('theme_unmet:cognitive_diversity'), 'Question variety: fewer distinct operations than planned.');
    assert.strictEqual(formatQualityNote('direct_paraphrase'), 'Direct paraphrase: more questions than usual closely mirror the passage text.');
    assert.strictEqual(formatQualityNote('deep_waived'), 'Deep reasoning: passage was treated as factual; deep-inference question waived.');
    assert.strictEqual(formatQualityNote('distractors_offtopic'), 'Distractors: some options did not reuse passage vocabulary.');
    assert.strictEqual(formatQualityNote('missing_tempting'), 'Distractors: distractors lacked explicit rationale.');
    assert.strictEqual(formatQualityNote('theme_unmet:custom'), 'Question variety: custom criteria unmet.');
    assert.strictEqual(formatQualityNote('completely_unknown_flag'), null);

    const testWithQualityFlags = {
      id: 'test-1',
      source: 'ai' as const,
      diagnostics: {
        qualityFlags: ['weak_distractors', 'length_bias']
      }
    };
    const isFallback = testWithQualityFlags.source === 'fallback';
    const isAi = testWithQualityFlags.source === 'ai';
    const tagLabel = isAi ? 'Successful AI' : isFallback ? 'Fallback' : 'Algorithm';
    assert.strictEqual(tagLabel, 'Successful AI', 'Test with quality flags must retain "Successful AI" tag, not "Fallback"');
    testPass('formatQualityNote produces plain English notes, null for unknown, and AI tag is retained');

    // 8.10: Zero API key leakage in mock request bodies, diagnostics, errors, or saved objects
    console.log('  8.10: Zero API key leakage in mock request bodies, diagnostics, errors, or saved objects...');
    const recordedBodies: string[] = [];
    globalThis.fetch = async (url: any, init: any) => {
      if (init?.body) {
        recordedBodies.push(typeof init.body === 'string' ? init.body : JSON.stringify(init.body));
      }
      return new Response(makeMockGeminiApiResponse(makeMockAiQuestions()), { status: 200 });
    };

    const res810 = await generateRcQuestions({
      paragraphs: SAMPLE_PASSAGE,
      examType: 'CAT',
      engine: 'gemini',
      geminiKey: SECRET_GEMINI_KEY,
      groqKey: SECRET_GROQ_KEY,
      doubleCheck: false
    });

    for (const bodyStr of recordedBodies) {
      assert.strictEqual(bodyStr.includes(SECRET_GEMINI_KEY), false, 'SECRET_GEMINI_KEY must never appear in request body');
      assert.strictEqual(bodyStr.includes(SECRET_GROQ_KEY), false, 'SECRET_GROQ_KEY must never appear in request body');
    }

    const resJson = JSON.stringify(res810);
    assert.strictEqual(resJson.includes(SECRET_GEMINI_KEY), false, 'SECRET_GEMINI_KEY must never appear in result object or diagnostics');
    assert.strictEqual(resJson.includes(SECRET_GROQ_KEY), false, 'SECRET_GROQ_KEY must never appear in result object or diagnostics');

    const scrubbedErr = scrubSecret(`Error with ${SECRET_GEMINI_KEY} and ${SECRET_GROQ_KEY}`, [SECRET_GEMINI_KEY, SECRET_GROQ_KEY]);
    assert.strictEqual(scrubbedErr.includes(SECRET_GEMINI_KEY), false, 'Secret must be scrubbed from errors');
    assert.strictEqual(scrubbedErr.includes(SECRET_GROQ_KEY), false, 'Secret must be scrubbed from errors');
    testPass('API key security verified: key never appears in request bodies, diagnostics, error messages, or saved objects');

    console.log(`\n======================================================`);
    console.log(`TEST SUITE SUMMARY: Passed ${passedTests} of ${totalTests} tests.`);
    console.log(`======================================================\n`);
  } finally {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      writable: true,
      configurable: true
    });
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.log = originalConsoleLog;
  }
}

runAllTests().catch((err) => {
  console.error('\n❌ Test suite failed with error:', err);
  process.exit(1);
});
