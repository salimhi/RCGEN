import type {
  RCQuestion,
  RCOption,
  ExamType,
  DifficultyLevel,
  QuestionType,
  RCTest
} from '../types.ts';
import { mapSubtypeToType } from '../types.ts';
import {
  planQuestions,
  validateSubtypeList,
  shuffleQuestionsAndOptions,
  QUESTION_CATALOG,
  SUBTYPE_BY_ID,
  MAX_LOCATE_SLOTS,
  MIN_DISTINCT_OPERATIONS,
  MIN_DEEP_SLOTS,
  DEEP_SUBTYPES,
  SUBTYPE_OPERATIONS,
  type QuestionPlan,
  type SubtypeCatalogItem,
  type CognitiveOperation
} from './questionPlan.ts';
import {
  GEMINI_MODEL,
  VERIFIER_MODEL,
  GEMINI_CALL_TIMEOUT_MS,
  TOTAL_PIPELINE_TIMEOUT_MS,
  COPY_LIKE_OVERLAP,
  MAX_COPY_LIKE_CAT,
  MAX_COPY_LIKE_GMAT,
  MAX_OBVIOUS_WRONG,
  MIN_CONTENT_WORD_LEN,
  MAX_TEMPTING_WORDS
} from '../config.ts';
import {
  SYSTEM_INSTRUCTION,
  buildUserPrompt,
  GENERATION_JSON_SCHEMA
} from './rcPrompt.ts';
import { buildExamQuestions, type BuildQuestionsOptions } from './ruleGenerator.ts';
import {
  normalizeLoose,
  isSubstringLoose,
  checkEvidenceFound,
  extractQuotedPhrases,
  matchesParagraphBeginning,
  extractContentWords,
  splitPassageIntoSentences,
  getQuestionBestSentenceOverlap,
  findMatchingParagraphIndex
} from './textNorm.ts';
import {
  REVIEWER_SYSTEM_INSTRUCTION,
  REVIEWER_JSON_SCHEMA,
  buildReviewerInput,
  buildReviewerPrompt,
  parseReviewerOutput,
  judgeQuestion,
  type ReviewerQuestionInput,
  type ReviewerQuestionResult
} from './verifier.ts';
import { reviewQuestionsWithGroq, isGroqSessionFailed, setGroqSessionFailed } from './groqClient.ts';
import {
  isUsableGroqChatModel,
  resolveEffectiveGroqModel,
  getSessionLiveModels,
  formatGroqErrorMessage
} from './groqModels.ts';

export function scrubSecret(text: string, apiKey?: string): string {
  let out = text || '';
  if (apiKey && apiKey.length >= 8) {
    const esc = apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'g'), '[REDACTED]');
  }
  return out
    .replace(/AIza[0-9A-Za-z-_]{20,}/g, '[REDACTED]')
    .replace(/gsk_[0-9A-Za-z]{20,}/g, '[REDACTED]');
}

/**
 * Backward-compatible evidence checker.
 * Uses loose normalization (NFKC, lowercase, punctuation to spaces, collapsed whitespace, ellipsis fragments).
 */
export function isEvidenceInPassage(evidence: string, passage: string): boolean {
  if (!evidence || typeof evidence !== 'string') return true;
  const raw = evidence.trim();
  if (raw.length < 5) return true;
  return isSubstringLoose(raw, passage);
}

export interface GenerationDiagnostics {
  httpStatus?: number;
  finishReason?: string;
  tokenUsage?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
  };
  questionsReturned?: number;
  questionsChecked?: number;
  questionsPassed?: number;
  rejectionReasons?: string[];
  reviewerUsed?: 'groq' | 'gemini' | 'none';
  groqUnavailable?: boolean;
  groqModelUsed?: string;
  groqModelsTried?: string[];
  groqFailureMessage?: string;
  groqFailureClass?: string;
  errorMessage?: string;
  perQuestionEvidence?: { id: string; evidenceFound: boolean | null }[];
  flags?: string[];
  qualityFlags?: string[];
  modelUsed?: string;
  timestamp?: string;

  // Real-run instrumentation
  plannedSubtypes?: { slotIndex: number; primary: string; backups: [string, string] }[];
  actualReturnedSubtypes?: string[];
  substitutionCount?: number;
  repairBreakdown?: {
    constraint: number;
    crossOption: number;
    lengthBias: number;
    exactText: number;
    reviewer: number;
  };
  questionsSentToRepair?: number;
  apiCallCount?: number;
}

export function isCorrectOptionLongest(q: RCQuestion): boolean {
  const correctOpt = q.options.find((o) => o.letter === q.correctLetter);
  if (!correctOpt) return false;
  const correctLen = correctOpt.text.length;
  return q.options.every(
    (o) => o.letter === q.correctLetter || correctLen > o.text.length
  );
}

export function getQuestionOperation(q: RCQuestion): CognitiveOperation {
  if (q.subtypeId && SUBTYPE_OPERATIONS[q.subtypeId]) {
    return SUBTYPE_OPERATIONS[q.subtypeId];
  }
  if (q.subtype) {
    const found = QUESTION_CATALOG.find((c) => c.label.toLowerCase() === q.subtype?.toLowerCase());
    if (found?.operation) return found.operation;
  }
  if (q.type === 'Detail & Logic' || q.type === 'Vocabulary in Context') return 'locate';
  if (q.type === 'Paragraph Function') return 'interpret';
  if (q.type === 'Main Idea') return 'synthesize';
  if (q.type === 'Strengthen / Weaken') return 'evaluate';
  return 'infer';
}

export function formatQualityNote(flag: string): string | null {
  switch (flag) {
    case 'weak_distractors':
      return 'Distractors: some options were more easily eliminated than intended.';
    case 'length_bias':
      return 'Distractor length: the correct option was noticeably longer in several questions.';
    case 'theme_unmet:multi_paragraph':
      return 'Question variety: all questions focus on single-paragraph details.';
    case 'theme_unmet:deep':
      return 'Question variety: set lacked a subtle implication or multi-level reasoning question.';
    case 'theme_unmet:cognitive_diversity':
      return 'Question variety: fewer distinct operations than planned.';
    case 'direct_paraphrase':
      return 'Direct paraphrase: more questions than usual closely mirror the passage text.';
    case 'deep_waived':
      return 'Deep reasoning: passage was treated as factual; deep-inference question waived.';
    case 'distractors_offtopic':
      return 'Distractors: some options did not reuse passage vocabulary.';
    case 'missing_tempting':
      return 'Distractors: distractors lacked explicit rationale.';
    default:
      if (flag.startsWith('theme_unmet:')) {
        return `Question variety: ${flag.replace('theme_unmet:', '')} criteria unmet.`;
      }
      return null;
  }
}

export function isCopyLikeQuestion(
  q: RCQuestion,
  passageSentences: string[],
  threshold: number = COPY_LIKE_OVERLAP
): boolean {
  const correctOpt = q.options.find((o) => o.letter === q.correctLetter);
  if (!correctOpt) return false;
  const overlap = getQuestionBestSentenceOverlap(correctOpt.text, passageSentences);
  return overlap >= threshold;
}

export interface GenerationResult {
  questions: RCQuestion[];
  source: 'ai' | 'fallback' | 'algorithm';
  reason?: string;
  diagnostics?: GenerationDiagnostics;
  verification_info?: {
    reviewer: 'groq' | 'gemini' | 'none';
    questionsChecked: number;
    questionsKept: number;
    groqUnavailable?: boolean;
    groqModelUsed?: string;
    groqModelsTried?: string[];
    groqFailureMessage?: string;
    groqFailureClass?: string;
  };
}

export interface GeminiTestResult {
  ok: boolean;
  message: string;
  models?: string[];
  httpStatus?: number;
}

/**
 * Tests Gemini API key validity by querying Google's model list endpoint.
 */
export async function testGeminiKey(
  apiKey: string,
  signal?: AbortSignal
): Promise<GeminiTestResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { ok: false, message: 'Please enter a Gemini API key.' };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'x-goog-api-key': cleanKey
      },
      signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const scrubbed = scrubSecret(errText.slice(0, 200), cleanKey);
      if (res.status === 404) {
        return {
          ok: false,
          message:
            'Google Gemini endpoint returned 404. Please verify your model and API endpoint.',
          httpStatus: 404
        };
      }
      return {
        ok: false,
        message: `Gemini error (HTTP ${res.status}): ${scrubbed || res.statusText}`,
        httpStatus: res.status
      };
    }

    const data = await res.json();
    const modelList = Array.isArray(data?.models)
      ? data.models
        .filter((m: any) =>
          Array.isArray(m?.supportedGenerationMethods)
            ? m.supportedGenerationMethods.includes('generateContent')
            : true
        )
        .map((m: any) => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean)
      : [];

    return {
      ok: true,
      message: `Gemini key verified successfully (${modelList.length} models accessible).`,
      models: modelList,
      httpStatus: 200
    };
  } catch (err: any) {
    if (signal?.aborted || err.name === 'AbortError') {
      return { ok: false, message: 'Test cancelled.' };
    }
    return {
      ok: false,
      message: `Could not connect to Gemini API: ${scrubSecret(err.message, cleanKey)}`
    };
  }
}

interface RawGeminiResponse {
  parsedData: any;
  httpStatus: number;
  finishReason?: string;
  usageMetadata?: {
    promptTokens?: number;
    candidatesTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Low-level call to Gemini generateContent.
 */
async function callGeminiApi(
  apiKey: string,
  model: string,
  promptText: string,
  systemInstructionText: string,
  jsonSchema: any,
  maxOutputTokens: number,
  temperature: number,
  userSignal?: AbortSignal
): Promise<RawGeminiResponse> {
  if (userSignal?.aborted) {
    throw new Error('User aborted generation');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(
      new Error(`Gemini API request timed out after ${GEMINI_CALL_TIMEOUT_MS / 1000}s`)
    );
  }, GEMINI_CALL_TIMEOUT_MS);

  const abortHandler = () => {
    clearTimeout(timeoutId);
    controller.abort(new Error('User aborted generation'));
  };

  if (userSignal) userSignal.addEventListener('abort', abortHandler, { once: true });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: jsonSchema,
          temperature,
          maxOutputTokens
        }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    if (userSignal) userSignal.removeEventListener('abort', abortHandler);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const scrubbed = scrubSecret(errText.slice(0, 200), apiKey);
      const err: any = new Error(`Gemini API error (HTTP ${res.status}): ${scrubbed}`);
      err.httpStatus = res.status;
      throw err;
    }

    const data = await res.json();
    const finishReason = data?.candidates?.[0]?.finishReason;
    const usage = data?.usageMetadata
      ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        candidatesTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount
      }
      : undefined;

    if (finishReason === 'MAX_TOKENS') {
      const err: any = new Error(
        'Gemini generation reached the maximum output token limit (MAX_TOKENS).'
      );
      err.finishReason = finishReason;
      err.httpStatus = 200;
      throw err;
    }

    const rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawContent) {
      const err: any = new Error('Gemini API returned an empty response.');
      err.httpStatus = 200;
      err.finishReason = finishReason;
      throw err;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const err: any = new Error('Gemini response could not be parsed as valid JSON.');
      err.httpStatus = 200;
      err.finishReason = finishReason;
      throw err;
    }

    return {
      parsedData: parsed,
      httpStatus: 200,
      finishReason,
      usageMetadata: usage
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (userSignal) userSignal.removeEventListener('abort', abortHandler);
    throw err;
  }
}

/**
 * Phase 3 Checks: Structural, Exact-Text, and Soft Evidence Checks.
 * Evidence is NEVER a gate and never causes rejection or fallback.
 */
export interface QuestionRepairItem {
  question: RCQuestion;
  reason: string;
  category?: 'constraint' | 'crossOption' | 'lengthBias' | 'exactText' | 'reviewer';
}

export interface Phase3CheckResult {
  validQuestions: RCQuestion[];
  needsRepair: QuestionRepairItem[];
  perQuestionEvidence: { id: string; evidenceFound: boolean | null }[];
  diagnostics: string[];
  flags?: string[];
}

export function performPhase3Checks(
  rawQuestions: any[],
  analysis: any,
  paragraphs: string[],
  examType: ExamType,
  plan?: QuestionPlan,
  isNewAiGeneration: boolean = false,
  isAfterRepair: boolean = false
): Phase3CheckResult {
  const isGmat = examType === 'GMAT';
  const expectedLetters = isGmat ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  const fullPassageText = paragraphs.join('\n\n');
  const flags: string[] = [];

  const validArchetypes: QuestionType[] = [
    'Main Idea',
    'Inference',
    'Paragraph Function',
    'Tone & Attitude',
    'Strengthen / Weaken',
    'Detail & Logic',
    'Vocabulary in Context'
  ];

  const seenSubtypes = new Set<string>();
  let negativeStemCount = 0;
  let longestCorrectCount = 0;
  const isNew = isNewAiGeneration || Boolean(plan);

  const validQuestions: RCQuestion[] = [];
  const needsRepair: QuestionRepairItem[] = [];
  const perQuestionEvidence: { id: string; evidenceFound: boolean | null }[] = [];
  const diagnostics: string[] = [];
  const deepSupported = analysis?.deepSupported !== false;

  const contextWords = Array.isArray(analysis?.contextWords)
    ? analysis.contextWords.map((w: any) => String(w).trim()).filter(Boolean)
    : [];

  const list = Array.isArray(rawQuestions) ? rawQuestions : [];

  for (let idx = 0; idx < list.length; idx++) {
    const q = list[idx];
    const qId = q?.id ? String(q.id) : `q${idx + 1}`;
    const label = `Q${idx + 1} (${qId})`;

    if (!q || typeof q !== 'object') {
      diagnostics.push(`${label}: Malformed object`);
      continue;
    }

    // 1. Evidence Check (SOFT ONLY)
    // Never gates, never rejects. Recorded strictly for diagnostics & eval.
    const evidenceFound = checkEvidenceFound(q.evidence, fullPassageText);
    perQuestionEvidence.push({ id: qId, evidenceFound });

    // 2. Structural checks
    let stem = String(q.stem || '').trim();
    if (!stem) {
      diagnostics.push(`${label}: Empty stem`);
      continue;
    }

    // Stem must not refer to paragraph numbers or ¶
    if (/¶|Paragraph\s+\d+|para\s+\d+/i.test(stem)) {
      const mockQ: RCQuestion = {
        id: qId,
        type: 'Paragraph Function',
        stem,
        correctLetter: 'A',
        options: []
      };
      needsRepair.push({
        question: mockQ,
        reason: 'Stem contains prohibited paragraph number or symbol (¶ or Paragraph <n>).',
        category: 'constraint'
      });
      diagnostics.push(`${label}: Prohibited paragraph number/symbol in stem`);
      continue;
    }

    // Validate options count and structure
    const rawOpts = Array.isArray(q.options) ? q.options : [];
    if (rawOpts.length < expectedLetters.length) {
      diagnostics.push(`${label}: Only ${rawOpts.length} options provided (expected ${expectedLetters.length})`);
      continue;
    }

    const options: RCOption[] = [];
    const seenOptTexts = new Set<string>();
    let optionFailed = false;

    // Forbidden cross-option reference regex
    const CROSS_OPTION_REGEX = /\b(?:option|choice)\s+[A-E]\b|\([A-E]\)|\b[A-E]\s+and\s+[A-E]\b|\bboth\b|\ball\s+of\s+the\s+above\b|\bnone\s+of\s+the\s+above\b/i;

    for (let optIdx = 0; optIdx < expectedLetters.length; optIdx++) {
      const opt = rawOpts[optIdx];
      const letter = expectedLetters[optIdx] as 'A' | 'B' | 'C' | 'D' | 'E';
      const text = String(opt?.text || '').trim();
      const explanation = String(opt?.explanation || '').trim();
      const flawTag = opt?.flawTag ? String(opt.flawTag).toLowerCase().trim() : undefined;

      if (!text || !explanation) {
        diagnostics.push(`${label}: Option ${letter} has missing text or explanation`);
        optionFailed = true;
        break;
      }

      // Check cross-option references in text or explanation
      if (CROSS_OPTION_REGEX.test(text) || CROSS_OPTION_REGEX.test(explanation)) {
        diagnostics.push(`${label}: Option ${letter} text or explanation contains forbidden cross-option reference`);
        const builtQ: RCQuestion = {
          id: qId,
          type: 'Inference',
          stem,
          correctLetter: 'A',
          options: []
        };
        needsRepair.push({
          question: builtQ,
          reason: 'Options and explanations must never mention option letters, other options, "all of the above", "both A and B", or cross-option references.',
          category: 'crossOption'
        });
        optionFailed = true;
        break;
      }

      // Check no identical options
      const normOpt = normalizeLoose(text);
      if (seenOptTexts.has(normOpt)) {
        diagnostics.push(`${label}: Duplicate identical options found`);
        optionFailed = true;
        break;
      }
      seenOptTexts.add(normOpt);

      const tempting = opt?.tempting ? String(opt.tempting).trim() : undefined;
      options.push({ letter, text, explanation, flawTag, tempting });
    }

    if (optionFailed || options.length !== expectedLetters.length) {
      continue;
    }

    // Correct letter
    let correctLetter = String(q.correctLetter || 'A').toUpperCase().trim() as
      | 'A'
      | 'B'
      | 'C'
      | 'D'
      | 'E';
    if (!expectedLetters.includes(correctLetter)) {
      correctLetter = expectedLetters[0] as 'A' | 'B' | 'C' | 'D' | 'E';
    }

    // Subtype validation
    const rawSubtypeId = q.subtypeId ? String(q.subtypeId).trim() : undefined;
    const catalogItem = rawSubtypeId ? SUBTYPE_BY_ID.get(rawSubtypeId) : undefined;

    // Resolve corresponding slot by question ID (e.g. "q1" -> slot 0, "q2" -> slot 1) or by idx
    let slotIndex = idx;
    const idMatch = qId.match(/^q(\d+)$/i);
    if (idMatch) {
      const parsedNum = parseInt(idMatch[1], 10) - 1;
      if (parsedNum >= 0 && plan && parsedNum < plan.slots.length) {
        slotIndex = parsedNum;
      }
    }
    const slot = plan?.slots[slotIndex];

    // Distractor check: tempting rationale on wrong options (for newly generated AI questions)
    if (isNew) {
      const missingTempting = options.some(
        (opt) => opt.letter !== correctLetter && (!opt.tempting || !opt.tempting.trim())
      );
      if (missingTempting) {
        diagnostics.push(`${label}: Missing tempting field on wrong option(s)`);
        if (!isAfterRepair) {
          const builtQ: RCQuestion = {
            id: qId,
            type: slot?.primary.archetype || 'Inference',
            subtype: slot?.primary.label,
            subtypeId: rawSubtypeId,
            stem,
            correctLetter,
            options
          };
          needsRepair.push({
            question: builtQ,
            reason: "fill 'tempting' for each wrong option explaining why a quick reader would pick it",
            category: 'constraint'
          });
          continue;
        } else {
          if (!flags.includes('missing_tempting')) flags.push('missing_tempting');
        }
      }
    }

    // Lexical distractor check: wrong options sharing no content words with passage (for newly generated AI questions)
    if (isNew) {
      const passageContentWords = new Set(extractContentWords(fullPassageText, MIN_CONTENT_WORD_LEN));
      let offtopicCount = 0;
      for (const opt of options) {
        if (opt.letter !== correctLetter) {
          const optWords = extractContentWords(opt.text, MIN_CONTENT_WORD_LEN);
          const sharesAny = optWords.some((w) => passageContentWords.has(w));
          if (!sharesAny) {
            offtopicCount++;
          }
        }
      }
      if (offtopicCount >= 2) {
        diagnostics.push(`${label}: ${offtopicCount} wrong options share no content words with the passage`);
        if (!isAfterRepair) {
          const builtQ: RCQuestion = {
            id: qId,
            type: slot?.primary.archetype || 'Inference',
            subtype: slot?.primary.label,
            subtypeId: rawSubtypeId,
            stem,
            correctLetter,
            options
          };
          needsRepair.push({
            question: builtQ,
            reason: 'make the wrong options reuse ideas and terms from the passage',
            category: 'constraint'
          });
          continue;
        } else {
          if (!flags.includes('distractors_offtopic')) flags.push('distractors_offtopic');
        }
      }
    }

    // Multi-paragraph slot check
    const rawParaNeeded = Array.isArray(q.paragraphsNeeded)
      ? q.paragraphsNeeded.map((p: any) => String(p).trim()).filter(Boolean)
      : [];
    if (slot?.multiParagraph) {
      const matchedParaIndices = new Set<number>();
      for (const pQuote of rawParaNeeded) {
        const pIdx = findMatchingParagraphIndex(pQuote, paragraphs);
        if (pIdx !== -1) {
          matchedParaIndices.add(pIdx);
        }
      }
      const isMultiParaValid = rawParaNeeded.length >= 2 && matchedParaIndices.size >= 2;
      if (!isMultiParaValid) {
        diagnostics.push(
          `${label}: multiParagraph slot question failed paragraphsNeeded verification (${rawParaNeeded.length} entries, ${matchedParaIndices.size} distinct matches)`
        );
        if (!isAfterRepair) {
          const builtQ: RCQuestion = {
            id: qId,
            type: slot?.primary.archetype || 'Inference',
            subtype: slot?.primary.label,
            subtypeId: rawSubtypeId,
            stem,
            correctLetter,
            options,
            paragraphsNeeded: rawParaNeeded
          };
          needsRepair.push({
            question: builtQ,
            reason: 'this question must combine ideas from at least two different paragraphs; list both in paragraphsNeeded',
            category: 'constraint'
          });
          continue;
        } else {
          if (!flags.includes('theme_unmet:multi_paragraph')) flags.push('theme_unmet:multi_paragraph');
        }
      }
    }
    if (isNew) {
      if (!rawSubtypeId) {
        diagnostics.push(`${label}: Missing subtypeId for newly generated AI question`);
        if (!isAfterRepair) {
          const builtQ: RCQuestion = {
            id: qId,
            type: slot?.primary.archetype || 'Inference',
            subtype: slot?.primary.label || 'Can be inferred',
            stem,
            correctLetter,
            options
          };
          needsRepair.push({
            question: builtQ,
            reason: slot
              ? `Question is missing subtypeId. Must be assigned subtype "${slot.primary.id}" or one of backups "${slot.backups[0].id}", "${slot.backups[1].id}".`
              : 'Question is missing subtypeId. Choose a valid subtype from catalog.',
            category: 'constraint'
          });
          continue;
        }
      }

      if (!catalogItem && rawSubtypeId) {
        diagnostics.push(`${label}: Unknown subtypeId "${rawSubtypeId}"`);
        if (!isAfterRepair) {
          const builtQ: RCQuestion = {
            id: qId,
            type: slot?.primary.archetype || 'Inference',
            subtype: rawSubtypeId,
            stem,
            correctLetter,
            options
          };
          needsRepair.push({
            question: builtQ,
            reason: slot
              ? `Question has unknown subtypeId "${rawSubtypeId}". Must be assigned subtype "${slot.primary.id}" or one of backups "${slot.backups[0].id}", "${slot.backups[1].id}".`
              : `Question has unknown subtypeId "${rawSubtypeId}". Choose a valid subtype from catalog.`,
            category: 'constraint'
          });
          continue;
        }
      }

      if (slot && catalogItem) {
        const isDeepSlot = DEEP_SUBTYPES.has(slot.primary.id);
        const allowSubst = !deepSupported && isDeepSlot;
        const validSubtypeIds = [slot.primary.id, slot.backups[0].id, slot.backups[1].id];
        if (rawSubtypeId && !validSubtypeIds.includes(rawSubtypeId) && !allowSubst) {
          diagnostics.push(`${label}: Subtype "${rawSubtypeId}" is neither assigned nor a backup`);
          if (!isAfterRepair) {
            const builtQ: RCQuestion = {
              id: qId,
              type: catalogItem.archetype,
              subtype: catalogItem.label,
              subtypeId: rawSubtypeId,
              stem,
              correctLetter,
              options
            };
            needsRepair.push({
              question: builtQ,
              reason: `Question must use assigned subtype "${slot.primary.id}" or one of backups "${slot.backups[0].id}", "${slot.backups[1].id}".`,
              category: 'constraint'
            });
            continue;
          }
        }
      }
    }

    // Resolve Question Type and Subtype
    let questionType: QuestionType = 'Inference';
    let subtype: string | undefined = undefined;

    if (catalogItem) {
      questionType = catalogItem.archetype;
      subtype = catalogItem.label;
    } else if (q.type && validArchetypes.includes(q.type as QuestionType)) {
      questionType = q.type as QuestionType;
      subtype = q.subtype ? String(q.subtype).trim() : undefined;
    } else if (q.subtype) {
      questionType = mapSubtypeToType(q.subtype);
      subtype = String(q.subtype).trim();
    }

    // Check duplicate subtypes
    if (subtype) {
      const normSub = subtype.toLowerCase();
      if (seenSubtypes.has(normSub)) {
        diagnostics.push(`${label}: Duplicate subtype "${subtype}"`);
        const builtQ: RCQuestion = {
          id: qId,
          type: questionType,
          subtype,
          subtypeId: rawSubtypeId,
          stem,
          correctLetter,
          options
        };
        needsRepair.push({
          question: builtQ,
          reason: `Duplicate subtype "${subtype}". Choose a different archetype/subtype.`,
          category: 'constraint'
        });
        continue;
      }
      seenSubtypes.add(normSub);
    }

    // Negative stem check (at most 1 for CAT, 2 for GMAT)
    const isNegativeStem = /\b(?:except|cannot\s+be\s+inferred|least\s+likely|not\s+true|not\s+supported|incorrect)\b/i.test(
      stem
    );
    const maxNegAllowed = isGmat ? 2 : 1;
    if (isNegativeStem) {
      negativeStemCount++;
      if (negativeStemCount > maxNegAllowed) {
        diagnostics.push(`${label}: More than ${maxNegAllowed} negative stem question(s)`);
        const builtQ: RCQuestion = {
          id: qId,
          type: questionType,
          subtype,
          subtypeId: rawSubtypeId,
          stem,
          correctLetter,
          options
        };
        needsRepair.push({
          question: builtQ,
          reason: `At most ${maxNegAllowed} question(s) may use a negative stem (EXCEPT/cannot be inferred).`,
          category: 'constraint'
        });
        continue;
      }
    }

    // Vocabulary question only if contextWords non-empty
    if (questionType === 'Vocabulary in Context' && contextWords.length === 0) {
      diagnostics.push(`${label}: Vocabulary in Context question generated with empty contextWords`);
      const builtQ: RCQuestion = {
        id: qId,
        type: questionType,
        subtype,
        subtypeId: rawSubtypeId,
        stem,
        correctLetter,
        options
      };
      needsRepair.push({
        question: builtQ,
        reason: 'Vocabulary in Context questions are only allowed when contextWords is non-empty.',
        category: 'constraint'
      });
      continue;
    }

    // 3. Exact-text checks (hard)
    let textCheckFailed = false;
    let textFailureReason = '';

    // A. Vocabulary target word in passage
    if (questionType === 'Vocabulary in Context') {
      const quoted = extractQuotedPhrases(stem);
      if (quoted.length > 0) {
        const found = quoted.some((w) => isSubstringLoose(w, fullPassageText));
        if (!found) {
          textCheckFailed = true;
          textFailureReason = `Target vocabulary phrase "${quoted[0]}" does not appear in passage text.`;
        }
      }
    }

    // B. Quoted text in stem (>= 4 chars) in passage
    if (!textCheckFailed) {
      const quotes = extractQuotedPhrases(stem);
      for (const quote of quotes) {
        if (quote.length >= 4 && !isSubstringLoose(quote, fullPassageText)) {
          textCheckFailed = true;
          textFailureReason = `Quoted text in stem "${quote}" does not appear in the passage.`;
          break;
        }
      }
    }

    // C. Paragraph beginning quote matches actual start
    if (!textCheckFailed) {
      const paraRef = matchesParagraphBeginning(stem, paragraphs);
      if (paraRef.isParagraphRef && !paraRef.matched) {
        textCheckFailed = true;
        textFailureReason = `Quoted paragraph beginning ("${paraRef.phrase || 'phrase'}") does not match the start of any paragraph.`;
      }
    }

    const candidateQuestion: RCQuestion = {
      id: qId,
      type: questionType,
      subtype,
      subtypeId: rawSubtypeId,
      stem,
      correctLetter,
      options,
      paragraphsNeeded: rawParaNeeded
    };

    if (textCheckFailed) {
      diagnostics.push(`${label}: Exact-text check failed: ${textFailureReason}`);
      needsRepair.push({
        question: candidateQuestion,
        reason: textFailureReason,
        category: 'exactText'
      });
      continue;
    }

    // Longest-option check: when the correct option is the longest in more than one question,
    // those questions are marked "needs repair" with feedback "make the wrong options as long and as detailed as the correct one"
    if (isCorrectOptionLongest(candidateQuestion)) {
      longestCorrectCount++;
      if (longestCorrectCount > 1) {
        diagnostics.push(`${label}: Correct option is longest in more than one question`);
        if (!isAfterRepair) {
          needsRepair.push({
            question: candidateQuestion,
            reason: 'make the wrong options as long and as detailed as the correct one',
            category: 'lengthBias'
          });
          continue;
        } else {
          if (!flags.includes('length_bias')) flags.push('length_bias');
        }
      }
    }

    validQuestions.push(candidateQuestion);
  }

  // Direct-paraphrase check (set-level, for newly generated AI questions)
  if (isNew) {
    const passageSentences = splitPassageIntoSentences(fullPassageText);
    const copyLikeList: { question: RCQuestion; index: number; overlap: number; isLocate: boolean }[] = [];

    for (let i = 0; i < validQuestions.length; i++) {
      const vq = validQuestions[i];
      const correctOpt = vq.options.find((o) => o.letter === vq.correctLetter);
      const overlap = getQuestionBestSentenceOverlap(correctOpt?.text || '', passageSentences);
      if (overlap >= COPY_LIKE_OVERLAP) {
        const op = getQuestionOperation(vq);
        copyLikeList.push({
          question: vq,
          index: i,
          overlap,
          isLocate: op === 'locate'
        });
      }
    }

    const maxCopyAllowed = isGmat ? MAX_COPY_LIKE_GMAT : MAX_COPY_LIKE_CAT;
    if (copyLikeList.length > maxCopyAllowed) {
      if (!isAfterRepair) {
        const surplusCount = copyLikeList.length - maxCopyAllowed;
        copyLikeList.sort((a, b) => {
          if (a.isLocate === b.isLocate) return b.overlap - a.overlap;
          return a.isLocate ? 1 : -1;
        });

        const toRemoveIndices = new Set<number>();
        for (let s = 0; s < surplusCount; s++) {
          const item = copyLikeList[s];
          toRemoveIndices.add(item.index);
          diagnostics.push(`Q (${item.question.id}): Direct paraphrase overlap ${item.overlap.toFixed(2)} exceeds cap`);
          needsRepair.push({
            question: item.question,
            reason: 'this question is a direct paraphrase of one sentence; rewrite it so the correct option requires inference, interpretation or combining ideas',
            category: 'constraint'
          });
        }

        const remainingValid = validQuestions.filter((_, idx) => !toRemoveIndices.has(idx));
        validQuestions.length = 0;
        validQuestions.push(...remainingValid);
      } else {
        diagnostics.push(`Direct paraphrase cap exceeded (${copyLikeList.length} > ${maxCopyAllowed})`);
        if (!flags.includes('direct_paraphrase')) flags.push('direct_paraphrase');
      }
    }
  }

  // Re-check constraints after substitutions (only if full set of questions is present)
  const expectedCount = isGmat ? 5 : 4;
  if (plan && validQuestions.length === expectedCount) {
    const chosenCatalogItems: SubtypeCatalogItem[] = [];
    for (const vq of validQuestions) {
      const subId = vq.subtypeId || (vq.subtype ? QUESTION_CATALOG.find((c) => c.label.toLowerCase() === vq.subtype?.toLowerCase())?.id : undefined);
      const cat = subId ? SUBTYPE_BY_ID.get(subId) : undefined;
      if (cat) {
        chosenCatalogItems.push(cat);
      }
    }

    const deepSupported = analysis?.deepSupported !== false;
    if (chosenCatalogItems.length === expectedCount) {
      const val = validateSubtypeList(chosenCatalogItems, examType, true, !deepSupported);
      if (!val.valid) {
        const violatingQ = validQuestions.pop()!;
        diagnostics.push(`Substitutions violated constraints: ${val.reason}`);
        needsRepair.push({
          question: violatingQ,
          reason: `Substitutions violated constraints: ${val.reason}. Please rewrite with an allowed backup.`,
          category: 'constraint'
        });
      }
    }
  }

  // Cognitive diversity check
  if (validQuestions.length === expectedCount) {
    const operations = validQuestions.map(getQuestionOperation);
    const distinctOps = new Set(operations);
    const locateCount = operations.filter((op) => op === 'locate').length;
    const maxLocate = isGmat ? MAX_LOCATE_SLOTS.GMAT : MAX_LOCATE_SLOTS.CAT;

    const deepSupported = analysis?.deepSupported !== false;
    const hasDeep = validQuestions.some((q) => {
      const catItem = q.subtypeId ? SUBTYPE_BY_ID.get(q.subtypeId) : undefined;
      return catItem ? DEEP_SUBTYPES.has(catItem.id) : (q.type === 'Tone & Attitude' || q.type === 'Strengthen / Weaken');
    });

    if (!deepSupported) {
      if (!flags.includes('deep_waived')) flags.push('deep_waived');
    }

    if (locateCount > maxLocate) {
      diagnostics.push(`Too many locate questions (${locateCount} > ${maxLocate})`);
      if (!isAfterRepair) {
        let surplusLocateIdx = -1;
        for (let i = validQuestions.length - 1; i >= 0; i--) {
          if (getQuestionOperation(validQuestions[i]) === 'locate') {
            surplusLocateIdx = i;
            break;
          }
        }
        if (surplusLocateIdx !== -1) {
          const surplusQ = validQuestions.splice(surplusLocateIdx, 1)[0];
          needsRepair.push({
            question: surplusQ,
            reason: `At most ${maxLocate} locate questions allowed. Rewrite this question requiring interpret, infer, synthesize or evaluate.`,
            category: 'constraint'
          });
        }
      }
    }

    if (distinctOps.size < MIN_DISTINCT_OPERATIONS) {
      diagnostics.push(`Cognitive diversity unmet: only ${distinctOps.size} distinct operations`);
      if (!isAfterRepair) {
        if (validQuestions.length > 0) {
          const candidateQ = validQuestions.pop()!;
          needsRepair.push({
            question: candidateQ,
            reason: 'Question set must feature at least 3 distinct cognitive operations (locate, interpret, infer, synthesize, evaluate).',
            category: 'constraint'
          });
        }
      } else {
        if (!flags.includes('theme_unmet:cognitive_diversity')) flags.push('theme_unmet:cognitive_diversity');
      }
    }

    if (deepSupported && !hasDeep) {
      diagnostics.push('Deep question requirement unmet');
      if (!isAfterRepair) {
        if (validQuestions.length > 0) {
          const candidateQ = validQuestions.pop()!;
          needsRepair.push({
            question: candidateQ,
            reason: 'Question set must contain at least one deep reasoning question (subtle implication, assumption, tone, or logical relationship).',
            category: 'constraint'
          });
        }
      } else {
        if (!flags.includes('theme_unmet:deep')) flags.push('theme_unmet:deep');
      }
    }
  }

  // Fix letter spread (no letter correct in > 2 questions) using option shuffling
  fixLetterSpreadAndLongestOption(validQuestions, isGmat);

  return {
    validQuestions,
    needsRepair,
    perQuestionEvidence,
    diagnostics,
    flags
  };
}

/**
       * Fixes letter spread (no letter correct in > 2 questions) by shuffling options and updating correctLetter.
       * Note: Longest-option rule cannot be solved by shuffling (shuffling options does not change which option is longest).
       * Any length bias is resolved in the repair pipeline or recorded in diagnostics.flags.
       */
      export function fixLetterSpreadAndLongestOption(questions: RCQuestion[], isGmat: boolean): void {
        const letters: ('A' | 'B' | 'C' | 'D' | 'E')[] = isGmat
          ? ['A', 'B', 'C', 'D', 'E']
          : ['A', 'B', 'C', 'D'];

        // Fix letter spread: ensure no letter is the correct answer in > 2 questions
        const counts: Record<string, number> = {};
        for (const q of questions) {
          counts[q.correctLetter] = (counts[q.correctLetter] || 0) + 1;
        }

        for (const q of questions) {
          if (counts[q.correctLetter] > 2) {
            const underLetter = letters.find((l) => (counts[l] || 0) < 2);
            if (underLetter) {
              const currIdx = letters.indexOf(q.correctLetter);
              const targetIdx = letters.indexOf(underLetter);
              if (currIdx !== -1 && targetIdx !== -1 && q.options[currIdx] && q.options[targetIdx]) {
                const tempText = q.options[currIdx].text;
                const tempExp = q.options[currIdx].explanation;
                const tempFlaw = q.options[currIdx].flawTag;

                q.options[currIdx].text = q.options[targetIdx].text;
                q.options[currIdx].explanation = q.options[targetIdx].explanation;
                q.options[currIdx].flawTag = q.options[targetIdx].flawTag;

                q.options[targetIdx].text = tempText;
                q.options[targetIdx].explanation = tempExp;
                q.options[targetIdx].flawTag = tempFlaw;

                counts[q.correctLetter]--;
                q.correctLetter = underLetter;
                counts[underLetter] = (counts[underLetter] || 0) + 1;
              }
            }
          }
        }
      }

      /**
       * Blind reviewer pass using Gemini.
       */
      export async function reviewQuestionsWithGemini(
        apiKey: string,
        passage: string,
        inputs: ReviewerQuestionInput[],
        model: string = VERIFIER_MODEL,
        signal?: AbortSignal,
        examType?: ExamType
      ): Promise<ReviewerQuestionResult[]> {
        const userPrompt = buildReviewerPrompt(passage, inputs, examType);

        let output: RawGeminiResponse;
        try {
          output = await callGeminiApi(
            apiKey,
            model,
            userPrompt,
            REVIEWER_SYSTEM_INSTRUCTION,
            REVIEWER_JSON_SCHEMA,
            4096,
            0,
            signal
          );
        } catch (err: any) {
          if (err.httpStatus === 400 || err.httpStatus === 403 || err.httpStatus === 429) {
            throw err;
          }
          // Retry once
          output = await callGeminiApi(
            apiKey,
            model,
            userPrompt,
            REVIEWER_SYSTEM_INSTRUCTION,
            REVIEWER_JSON_SCHEMA,
            4096,
            0,
            signal
          );
        }

        try {
          return parseReviewerOutput(JSON.stringify(output.parsedData));
        } catch {
          // Retry once on malformed JSON
          const retry = await callGeminiApi(
            apiKey,
            model,
            userPrompt + '\n\nIMPORTANT: Return valid JSON matching the schema.',
            REVIEWER_SYSTEM_INSTRUCTION,
            REVIEWER_JSON_SCHEMA,
            4096,
            0,
            signal
          );
          return parseReviewerOutput(JSON.stringify(retry.parsedData));
        }
      }

      /**
       * Single repair call to Gemini rewrites questions that failed Phase 3 checks or review.
       */
      export async function repairQuestionsWithGemini(
        apiKey: string,
        passage: string,
        failedItems: { question: RCQuestion; reason: string }[],
        examType: ExamType,
        model: string = GEMINI_MODEL,
        signal?: AbortSignal,
        plan?: QuestionPlan,
        outFlags?: string[]
      ): Promise<RCQuestion[]> {
        if (failedItems.length === 0) return [];

        const isGmat = examType === 'GMAT';
        const numOpts = isGmat ? 5 : 4;

        const failureDescriptions = failedItems
          .map((item, idx) => {
            const q = item.question;
            return `QUESTION ${idx + 1} [id: ${q.id}, type: ${q.type}, subtype: ${q.subtype || 'none'}]:
Original Stem: ${q.stem}
Failure Feedback: ${item.reason}`;
          })
          .join('\n\n');

        const repairPrompt = `EXAM: ${examType}
OPTIONS PER QUESTION: ${numOpts}, lettered from A

PASSAGE:
${passage}

THE FOLLOWING QUESTIONS FAILED EDITORIAL / REVIEW VERIFICATION AND MUST BE REWRITTEN:
${failureDescriptions}

INSTRUCTIONS:
1. Rewrite each failed question completely to fix the reported defect.
2. Maintain the same question type and subtype if possible.
3. Ensure the stem does not use paragraph numbers or ¶.
4. Ensure exact-text accuracy: any quoted phrase must be in the passage.
5. Provide parallel, clear options of similar length with exactly one defensible correct answer.
6. Provide explanations for all options and assign a flawTag (extreme, opposite, scope, distortion, comparison, causal, irrelevant) for wrong options.
7. Never mention option letters, other options, 'all of the above', 'both A and B', or cross-option references in option texts or explanations.
8. If repairing length bias, make the wrong options as long and as detailed as the correct one.
9. Distractors: every wrong option must be a plausible interpretation using passage ideas and terms. Fill 'tempting' for each wrong option (at most 15 words).
10. If the question requirement or slot is [MULTI-PARAGRAPH], include 'paragraphsNeeded' with first six words of at least 2 distinct paragraphs.
11. Avoid direct single-sentence paraphrasing; ensure options test inference, synthesis, or evaluation.

Return JSON matching the schema with key "questions".`;

        const repairSchema = {
          type: 'OBJECT',
          properties: {
            questions: GENERATION_JSON_SCHEMA.properties.questions
          },
          required: ['questions']
        };

        try {
          const res = await callGeminiApi(
            apiKey,
            model,
            repairPrompt,
            SYSTEM_INSTRUCTION,
            repairSchema,
            8192,
            0.3,
            signal
          );

          const rawList = res.parsedData?.questions || res.parsedData;
          const normalizedList = Array.isArray(rawList)
            ? rawList.map((rq: any, rIdx: number) => {
                if (rq && typeof rq === 'object' && !rq.subtypeId) {
                  const orig = failedItems.find((fi) => fi.question.id === rq.id) || failedItems[rIdx];
                  if (orig?.question?.subtypeId) {
                    return { ...rq, subtypeId: orig.question.subtypeId };
                  }
                }
                return rq;
              })
            : rawList;
          const checks = performPhase3Checks(normalizedList, {}, passage.split('\n\n'), examType, plan, true, true);
          if (outFlags && checks.flags) {
            for (const f of checks.flags) {
              if (!outFlags.includes(f)) outFlags.push(f);
            }
          }
          return checks.validQuestions;
        } catch (err) {
          console.warn('[GeminiClient] Repair call failed:', scrubSecret(String(err), apiKey));
          return [];
        }
      }

      export interface GenerateRcOptions {
        paragraphs: string[];
        title?: string;
        topic?: string;
        examType: ExamType;
        difficulty?: DifficultyLevel;
        focusMode?: string;
        engine: 'gemini' | 'algorithm';
        geminiKey?: string;
        groqKey?: string;
        useGroq?: boolean;
        doubleCheck?: boolean;
        geminiModel?: string;
        groqModel?: string;
        onStage?: (stage: 'reading' | 'writing' | 'checking' | 'saving') => void;
        signal?: AbortSignal;
      }

      /**
       * Main Question Generation Pipeline:
       * 1. Generate (Gemini) with Phase 2 senior prompt
       * 2. Phase 3 hard structural and exact-text checks (evidence is never a gate)
       * 3. Double-check review pass (Groq if enabled & saved; fallback to Gemini)
       * 4. ONE repair call for failed questions
       * 5. Accept test if >= 3 (CAT) or >= 4 (GMAT), else fallback with "unverified"
       * 6. Never saves evidence or analysis with the test.
       */
      export async function generateRcQuestions(
        options: GenerateRcOptions
      ): Promise<GenerationResult> {
        const {
          paragraphs,
          examType,
          difficulty = 'Challenging',
          engine,
          geminiKey,
          groqKey,
          useGroq = false,
          doubleCheck = true,
          geminiModel = GEMINI_MODEL,
          groqModel,
          onStage,
          signal
        } = options;

        if (engine === 'algorithm' || !geminiKey?.trim()) {
          const fallbackQuestions = buildExamQuestions(options as BuildQuestionsOptions);
          return {
            questions: fallbackQuestions,
            source: 'algorithm',
            verification_info: {
              reviewer: 'none',
              questionsChecked: 0,
              questionsKept: fallbackQuestions.length
            }
          };
        }

        if (signal?.aborted) {
          throw new Error('User aborted generation');
        }

        const cleanGeminiKey = geminiKey.trim();
        const cleanGroqKey = groqKey?.trim();
        const passageText = paragraphs.join('\n\n');
        const minRequired = examType === 'GMAT' ? 4 : 3;
        const effectiveGroqModel = resolveEffectiveGroqModel(groqModel, getSessionLiveModels());

        const diagnostics: GenerationDiagnostics = {
          rejectionReasons: [],
          reviewerUsed: 'none',
          groqUnavailable: false
        };

        let apiCallCount = 0;

        try {
          // Stage 1: Reading
          onStage?.('reading');

          // Stage 2: Writing questions with Phase 2 prompt
          onStage?.('writing');
          const plan = planQuestions(examType, difficulty);
          const userPrompt = buildUserPrompt({
            examType,
            difficulty,
            passage: passageText,
            plan
          });

          let genResponse: RawGeminiResponse;
          try {
            apiCallCount++;
            genResponse = await callGeminiApi(
              cleanGeminiKey,
              geminiModel,
              userPrompt,
              SYSTEM_INSTRUCTION,
              GENERATION_JSON_SCHEMA,
              8192,
              0.4,
              signal
            );
          } catch (firstErr: any) {
            if (signal?.aborted || firstErr.message === 'User aborted generation') throw firstErr;
            if (firstErr.httpStatus === 400 || firstErr.httpStatus === 403 || firstErr.httpStatus === 429) {
              throw firstErr;
            }
            if (firstErr.finishReason === 'MAX_TOKENS') {
              // Retry once with higher token limit
              apiCallCount++;
              genResponse = await callGeminiApi(
                cleanGeminiKey,
                geminiModel,
                userPrompt,
                SYSTEM_INSTRUCTION,
                GENERATION_JSON_SCHEMA,
                12000,
                0.4,
                signal
              );
            } else {
              console.warn('[GeminiClient] Gen Attempt 1 failed, retrying once...', scrubSecret(firstErr.message, cleanGeminiKey));
              apiCallCount++;
              genResponse = await callGeminiApi(
                cleanGeminiKey,
                geminiModel,
                userPrompt,
                SYSTEM_INSTRUCTION,
                GENERATION_JSON_SCHEMA,
                8192,
                0.4,
                signal
              );
            }
          }

          diagnostics.httpStatus = genResponse.httpStatus;
          diagnostics.finishReason = genResponse.finishReason;
          diagnostics.tokenUsage = genResponse.usageMetadata;

          const parsedData = genResponse.parsedData;
          const rawQuestions = Array.isArray(parsedData)
            ? parsedData
            : Array.isArray(parsedData?.questions)
              ? parsedData.questions
              : [];
          const analysis = parsedData?.analysis || {};

          diagnostics.questionsReturned = rawQuestions.length;

          // Phase 3 Checks (evidence is soft, never rejects)
          const p3Result = performPhase3Checks(rawQuestions, analysis, paragraphs, examType, plan, true);
          diagnostics.perQuestionEvidence = p3Result.perQuestionEvidence;
          diagnostics.rejectionReasons = [...p3Result.diagnostics];
          if (p3Result.flags && p3Result.flags.length > 0) {
            diagnostics.flags = [...(diagnostics.flags || []), ...p3Result.flags];
          }

          let passedQuestions = [...p3Result.validQuestions];
          let toRepair = [...p3Result.needsRepair];

          let reviewerUsed: 'groq' | 'gemini' | 'none' = 'none';
          let groqUnavailable = false;

          // Stage 3: Checking every answer (review)
          if (doubleCheck) {
            onStage?.('checking');

            let reviewResults: ReviewerQuestionResult[] = [];
            const canUseGroq = cleanGroqKey && useGroq && !isGroqSessionFailed() && isUsableGroqChatModel(effectiveGroqModel);

            if (canUseGroq) {
              diagnostics.groqModelUsed = effectiveGroqModel;
              try {
                apiCallCount++;
                const inputs = buildReviewerInput(passedQuestions);
                reviewResults = await reviewQuestionsWithGroq({
                  apiKey: cleanGroqKey,
                  passage: passageText,
                  inputs,
                  model: groqModel,
                  signal,
                  examType,
                  isAutoMode: !groqModel || groqModel.trim().toLowerCase() === 'auto'
                });
                reviewerUsed = 'groq';
                diagnostics.groqModelUsed = (reviewResults as any).modelUsed || effectiveGroqModel;
                diagnostics.groqModelsTried = (reviewResults as any).modelsTried || [effectiveGroqModel];
              } catch (groqErr: any) {
                groqUnavailable = true;
                setGroqSessionFailed(true);
                diagnostics.groqModelsTried = groqErr?.modelsTried || [effectiveGroqModel];
                diagnostics.groqModelUsed = groqErr?.groqModel || effectiveGroqModel;
                const formatted = formatGroqErrorMessage(groqErr, scrubSecret(groqErr?.message || '', cleanGroqKey));
                diagnostics.groqFailureMessage = formatted.message;
                diagnostics.groqFailureClass = formatted.failureClass;
                console.warn('[GeminiClient] Groq review failed, falling back to Gemini review:', formatted.message);
                // Do not retry Groq; review with Gemini instead
              }
            }

            if (reviewerUsed === 'none') {
              try {
                apiCallCount++;
                const inputs = buildReviewerInput(passedQuestions);
                reviewResults = await reviewQuestionsWithGemini(
                  cleanGeminiKey,
                  passageText,
                  inputs,
                  VERIFIER_MODEL,
                  signal,
                  examType
                );
                reviewerUsed = 'gemini';
              } catch (geminiRevErr: any) {
                console.warn('[GeminiClient] Gemini review failed; keeping questions unverified:', scrubSecret(geminiRevErr.message, cleanGeminiKey));
                reviewerUsed = 'none';
              }
            }

            diagnostics.reviewerUsed = reviewerUsed;
            diagnostics.groqUnavailable = groqUnavailable;
            diagnostics.questionsChecked = passedQuestions.length;

            // Judge questions if reviewer succeeded
            if (reviewerUsed !== 'none' && reviewResults.length > 0) {
              const remainingPassed: RCQuestion[] = [];
              for (const q of passedQuestions) {
                const rev = reviewResults.find((r) => r.id === q.id);
                if (rev) {
                  const judge = judgeQuestion(q, rev);
                  if (judge.passed) {
                    if (rev.obviouslyWrongLetters === undefined) {
                      diagnostics.rejectionReasons?.push(`Q (${q.id}): distractor check unavailable`);
                    } else if (rev.obviouslyWrongLetters.length > MAX_OBVIOUS_WRONG) {
                      toRepair.push({
                        question: q,
                        reason: `make the wrong options more tempting: options [${rev.obviouslyWrongLetters.join(', ')}] were too obviously wrong`,
                        category: 'reviewer'
                      });
                      diagnostics.rejectionReasons?.push(
                        `Q (${q.id}): Reviewer flagged obviously wrong options: ${rev.obviouslyWrongLetters.join(', ')}`
                      );
                      continue;
                    }
                    remainingPassed.push(q);
                  } else {
                    toRepair.push({
                      question: q,
                      reason: judge.failureReason || `Reviewer chose ${rev.chosenLetter}: ${rev.note}`,
                      category: 'reviewer'
                    });
                    diagnostics.rejectionReasons?.push(`Q (${q.id}): Review failed: ${judge.failureReason}`);
                  }
                } else {
                  remainingPassed.push(q);
                }
              }
              passedQuestions = remainingPassed;
            }
          } else {
            diagnostics.reviewerUsed = 'none';
            diagnostics.questionsChecked = 0;
          }

          // Repair call for failed questions (from Phase 3 checks or reviewer)
          if (toRepair.length > 0) {
            try {
              apiCallCount++;
              const repairedFlags: string[] = [];
              const repairedQuestions = await repairQuestionsWithGemini(
                cleanGeminiKey,
                passageText,
                toRepair,
                examType,
                geminiModel,
                signal,
                plan,
                repairedFlags
              );
              if (repairedFlags.length > 0) {
                if (!diagnostics.flags) diagnostics.flags = [];
                for (const rf of repairedFlags) {
                  if (!diagnostics.flags.includes(rf)) diagnostics.flags.push(rf);
                }
              }

              // Re-review repaired questions if reviewer was available and doubleCheck is active
              if (doubleCheck && reviewerUsed !== 'none' && repairedQuestions.length > 0) {
                const repairInputs = buildReviewerInput(repairedQuestions);
                let reReview: ReviewerQuestionResult[] = [];
                try {
                  apiCallCount++;
                  if (reviewerUsed === 'groq' && cleanGroqKey && !isGroqSessionFailed()) {
                    reReview = await reviewQuestionsWithGroq({
                      apiKey: cleanGroqKey,
                      passage: passageText,
                      inputs: repairInputs,
                      model: diagnostics.groqModelUsed || effectiveGroqModel,
                      signal,
                      examType,
                      isAutoMode: false
                    });
                  } else {
                    reReview = await reviewQuestionsWithGemini(
                      cleanGeminiKey,
                      passageText,
                      repairInputs,
                      VERIFIER_MODEL,
                      signal,
                      examType
                    );
                  }
                } catch {
                  // If review fails on repair, keep them
                }

                for (const rq of repairedQuestions) {
                  const rRev = reReview.find((r) => r.id === rq.id);
                  if (rRev) {
                    const judge = judgeQuestion(rq, rRev);
                    if (judge.passed) {
                      if (rRev.obviouslyWrongLetters && rRev.obviouslyWrongLetters.length > MAX_OBVIOUS_WRONG) {
                        if (!diagnostics.flags) diagnostics.flags = [];
                        if (!diagnostics.flags.includes('weak_distractors')) {
                          diagnostics.flags.push('weak_distractors');
                        }
                      }
                      passedQuestions.push(rq);
                    } else {
                      diagnostics.rejectionReasons?.push(`Repaired Q (${rq.id}): Re-review failed: ${judge.failureReason}`);
                    }
                  } else {
                    passedQuestions.push(rq);
                  }
                }
              } else {
                // Double-check off or reviewer was none: keep all repaired questions
                passedQuestions.push(...repairedQuestions);
              }
            } catch (repairErr: any) {
              console.warn('[GeminiClient] Repair process error:', scrubSecret(repairErr.message, cleanGeminiKey));
            }
          }

          // Evaluate quality flags on final set
          if (!diagnostics.flags) diagnostics.flags = [];

          // Multi-paragraph check on final set
          if (plan?.slots.some((s) => s.multiParagraph)) {
            const hasVerifiedMultiPara = passedQuestions.some((q) => {
              const matched = new Set<number>();
              for (const entry of q.paragraphsNeeded || []) {
                const idx = findMatchingParagraphIndex(entry, paragraphs);
                if (idx !== -1) matched.add(idx);
              }
              return (q.paragraphsNeeded?.length || 0) >= 2 && matched.size >= 2;
            });
            if (!hasVerifiedMultiPara) {
              if (!diagnostics.flags.includes('theme_unmet:multi_paragraph')) {
                diagnostics.flags.push('theme_unmet:multi_paragraph');
              }
            }
          }

          // Distractor plausibility checks on final set
          for (const q of passedQuestions) {
            // Check tempting
            if (q.options.some((opt) => opt.letter !== q.correctLetter && (!opt.tempting || !opt.tempting.trim()))) {
              if (!diagnostics.flags.includes('missing_tempting')) {
                diagnostics.flags.push('missing_tempting');
              }
            }
            // Check lexical distractor sharing
            const passageWords = new Set(extractContentWords(passageText, MIN_CONTENT_WORD_LEN));
            let offtopic = 0;
            for (const opt of q.options) {
              if (opt.letter !== q.correctLetter) {
                const optWords = extractContentWords(opt.text, MIN_CONTENT_WORD_LEN);
                if (!optWords.some((w) => passageWords.has(w))) {
                  offtopic++;
                }
              }
            }
            if (offtopic >= 2) {
              if (!diagnostics.flags.includes('distractors_offtopic')) {
                diagnostics.flags.push('distractors_offtopic');
              }
            }
          }

          // Direct paraphrase check on final set
          const finalSentences = splitPassageIntoSentences(passageText);
          const finalCopyLikeCount = passedQuestions.filter((q) => isCopyLikeQuestion(q, finalSentences)).length;
          const maxCopyAllowed = examType === 'GMAT' ? MAX_COPY_LIKE_GMAT : MAX_COPY_LIKE_CAT;
          if (finalCopyLikeCount > maxCopyAllowed) {
            if (!diagnostics.flags.includes('direct_paraphrase')) {
              diagnostics.flags.push('direct_paraphrase');
            }
          }

          // Cognitive diversity on final set
          const finalOps = new Set(passedQuestions.map(getQuestionOperation));
          if (finalOps.size < MIN_DISTINCT_OPERATIONS) {
            if (!diagnostics.flags.includes('theme_unmet:cognitive_diversity')) {
              diagnostics.flags.push('theme_unmet:cognitive_diversity');
            }
          }

          const deepSupported = analysis?.deepSupported !== false;
          const hasDeepFinal = passedQuestions.some((q) => {
            const catItem = q.subtypeId ? SUBTYPE_BY_ID.get(q.subtypeId) : undefined;
            return catItem ? DEEP_SUBTYPES.has(catItem.id) : (q.type === 'Tone & Attitude' || q.type === 'Strengthen / Weaken');
          });

          if (!deepSupported) {
            if (!diagnostics.flags.includes('deep_waived')) {
              diagnostics.flags.push('deep_waived');
            }
          } else if (!hasDeepFinal) {
            if (!diagnostics.flags.includes('theme_unmet:deep')) {
              diagnostics.flags.push('theme_unmet:deep');
            }
          }

          // Longest-option rule check on final questions:
          // If the correct option is the longest in more than one question after repair,
          // keep them (do not drop) and record diagnostics flag "length_bias".
          const finalLongestCount = passedQuestions.filter(isCorrectOptionLongest).length;
          if (finalLongestCount > 1) {
            if (!diagnostics.flags.includes('length_bias')) {
              diagnostics.flags.push('length_bias');
            }
          }

          diagnostics.qualityFlags = [...(diagnostics.flags || [])];

          // Strip tempting and paragraphsNeeded before saving so saved tests stay clean
          passedQuestions = passedQuestions.map((q) => {
            const { paragraphsNeeded, ...restQ } = q;
            return {
              ...restQ,
              options: restQ.options.map((opt) => {
                const { tempting, ...restOpt } = opt;
                return restOpt;
              })
            };
          });

          // Fix letter spread on final questions
          fixLetterSpreadAndLongestOption(passedQuestions, examType === 'GMAT');
          // Shuffle options and questions (for AI tests)
          passedQuestions = shuffleQuestionsAndOptions(passedQuestions, examType === 'GMAT');

          diagnostics.questionsPassed = passedQuestions.length;

          // Real-run instrumentation fields
          diagnostics.apiCallCount = apiCallCount;

          if (plan) {
            diagnostics.plannedSubtypes = plan.slots.map((s) => ({
              slotIndex: s.slotIndex,
              primary: s.primary.id,
              backups: [s.backups[0].id, s.backups[1].id]
            }));
          }

          diagnostics.actualReturnedSubtypes = passedQuestions.map(
            (q) => q.subtypeId || (q.subtype ? QUESTION_CATALOG.find((c) => c.label.toLowerCase() === q.subtype?.toLowerCase())?.id || q.subtype : '')
          );

          if (plan) {
            let subCount = 0;
            for (let i = 0; i < plan.slots.length; i++) {
              const assigned = plan.slots[i].primary.id;
              const actual = passedQuestions[i]?.subtypeId;
              if (actual && actual !== assigned) {
                subCount++;
              }
            }
            diagnostics.substitutionCount = subCount;
          } else {
            diagnostics.substitutionCount = 0;
          }

          const repairBreakdown = {
            constraint: 0,
            crossOption: 0,
            lengthBias: 0,
            exactText: 0,
            reviewer: 0
          };
          for (const item of toRepair) {
            const cat = item.category || 'constraint';
            repairBreakdown[cat] = (repairBreakdown[cat] || 0) + 1;
          }
          diagnostics.repairBreakdown = repairBreakdown;
          diagnostics.questionsSentToRepair = toRepair.length;

          // Stage 4: Saving
          onStage?.('saving');

          // Verification threshold: CAT >= 3, GMAT >= 4
          if (passedQuestions.length < minRequired) {
            throw new Error(
              `Only ${passedQuestions.length} questions survived validation and review (minimum required is ${minRequired}). Reason: unverified.`
            );
          }

          return {
            questions: passedQuestions,
            source: 'ai',
            diagnostics,
            verification_info: {
              reviewer: diagnostics.reviewerUsed || 'none',
              questionsChecked: diagnostics.questionsChecked || passedQuestions.length,
              questionsKept: passedQuestions.length,
              groqUnavailable: diagnostics.groqUnavailable,
              groqModelUsed: diagnostics.groqModelUsed,
              groqModelsTried: diagnostics.groqModelsTried,
              groqFailureMessage: diagnostics.groqFailureMessage,
              groqFailureClass: diagnostics.groqFailureClass
            }
          };
        } catch (err: any) {
          if (signal?.aborted || err.message === 'User aborted generation') {
            throw err;
          }

          const safeMessage = scrubSecret(err.message || 'Gemini request failed', cleanGeminiKey);
          console.error('[GeminiClient] Generation failed, falling back to algorithm:', safeMessage);

          if (err.httpStatus) diagnostics.httpStatus = err.httpStatus;
          if (err.finishReason) diagnostics.finishReason = err.finishReason;
          diagnostics.errorMessage = safeMessage;
          diagnostics.apiCallCount = apiCallCount;

          const fallbackQuestions = buildExamQuestions(options as BuildQuestionsOptions);
          return {
            questions: fallbackQuestions,
            source: 'fallback',
            reason: safeMessage,
            diagnostics,
            verification_info: {
              reviewer: 'none',
              questionsChecked: 0,
              questionsKept: fallbackQuestions.length,
              groqUnavailable: diagnostics.groqUnavailable,
              groqModelUsed: diagnostics.groqModelUsed,
              groqModelsTried: diagnostics.groqModelsTried,
              groqFailureMessage: diagnostics.groqFailureMessage,
              groqFailureClass: diagnostics.groqFailureClass
            }
          };
        }
      }
