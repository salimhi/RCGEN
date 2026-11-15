import type { RCQuestion } from '../types.ts';
import { extractJsonFromText } from './groqModels.ts';

export const REVIEWER_SYSTEM_INSTRUCTION = `You are a strict exam reviewer. You will see a passage and multiple-choice questions WITHOUT the answer key. Solve each question using only the passage. Do not guess what the question writer intended. Return only JSON.`;

export interface ReviewerQuestionInput {
  id: string;
  stem: string;
  options: {
    letter: 'A' | 'B' | 'C' | 'D' | 'E';
    text: string;
  }[];
}

export type ReviewProblem =
  | 'none'
  | 'ambiguous'
  | 'no_correct_option'
  | 'needs_outside_knowledge'
  | 'stem_unclear';

export interface ReviewerQuestionResult {
  id: string;
  chosenLetter: 'A' | 'B' | 'C' | 'D' | 'E';
  defensibleLetters: ('A' | 'B' | 'C' | 'D' | 'E')[];
  problem: ReviewProblem;
  note: string;
  obviouslyWrongLetters?: ('A' | 'B' | 'C' | 'D' | 'E')[];
}

export interface ReviewJudgeResult {
  passed: boolean;
  chosenLetter: string;
  expectedLetter: string;
  defensibleLetters: string[];
  problem: ReviewProblem;
  note: string;
  failureReason?: string;
}

export const REVIEWER_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    reviews: {
      type: 'ARRAY',
      description: 'Reviewer assessment for each question',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          chosenLetter: { type: 'STRING', enum: ['A', 'B', 'C', 'D', 'E'] },
          defensibleLetters: {
            type: 'ARRAY',
            items: { type: 'STRING', enum: ['A', 'B', 'C', 'D', 'E'] },
            description: 'Every option a careful reader could defend as correct'
          },
          problem: {
            type: 'STRING',
            enum: ['none', 'ambiguous', 'no_correct_option', 'needs_outside_knowledge', 'stem_unclear']
          },
          note: { type: 'STRING', description: 'Brief evaluation note at most 20 words' },
          obviouslyWrongLetters: {
            type: 'ARRAY',
            items: { type: 'STRING', enum: ['A', 'B', 'C', 'D', 'E'] },
            description: 'Option letters that can be eliminated immediately without careful reading. Empty array if none.'
          }
        },
        required: ['id', 'chosenLetter', 'defensibleLetters', 'problem', 'note']
      }
    }
  },
  required: ['reviews']
};

/**
 * Strips correctLetter, evidence, subtype, and explanations from questions
 * to build the blind review request input.
 */
export function buildReviewerInput(questions: RCQuestion[]): ReviewerQuestionInput[] {
  return questions.map((q) => ({
    id: q.id,
    stem: q.stem,
    options: q.options.map((opt) => ({
      letter: opt.letter,
      text: opt.text
    }))
  }));
}

/**
 * Formats the blind reviewer user prompt.
 * Options are lettered A to D for CAT and A to E for GMAT, taken from the exam type.
 */
export function buildReviewerPrompt(
  passage: string,
  inputs: ReviewerQuestionInput[],
  examType?: string
): string {
  const isGmat = examType === 'GMAT' || inputs.some((q) => q.options.some((o) => o.letter === 'E'));
  const letterRange = isGmat ? 'A to E' : 'A to D';

  const questionsFormatted = inputs
    .map((q, idx) => {
      const opts = q.options.map((o) => `(${o.letter}) ${o.text}`).join('\n');
      return `QUESTION ${idx + 1} [id: ${q.id}]:\nStem: ${q.stem}\nOptions:\n${opts}`;
    })
    .join('\n\n');

  return `PASSAGE:
${passage}

QUESTIONS TO REVIEW:
${questionsFormatted}

TASK:
You are a strict exam reviewer. Solve each question using only the passage. Do not guess what the question writer intended. Options are lettered ${letterRange}. Return only JSON.
Some stems are negative (EXCEPT, NOT, cannot be inferred, least likely to agree). For those, chosenLetter is the one option the passage does NOT support, and defensibleLetters must contain only options the passage fails to support.

JSON SHAPE:
{"reviews":[{"id":"q1","chosenLetter":"B","defensibleLetters":["B"],"problem":"none","note":"","obviouslyWrongLetters":[]}]}

ALLOWED VALUES FOR "problem":
- "none": exactly one clear, defensible answer supported by the text.
- "ambiguous": more than one option is defensible.
- "no_correct_option": no option is supported by the passage.
- "needs_outside_knowledge": cannot be answered from the passage alone.
- "stem_unclear": stem is incoherent or quotes text not in passage.

In addition, list any options in obviouslyWrongLetters that can be eliminated immediately without careful reading. If none, return an empty array.

Note must be at most 20 words.`;
}

/**
 * Validates and parses reviewer JSON output into ReviewerQuestionResult array.
 * If a reply is missing defensibleLetters or problem for any question, treats the whole reply as malformed.
 */
export function parseReviewerOutput(rawJsonText: string): ReviewerQuestionResult[] {
  let parsed: any;
  try {
    parsed = extractJsonFromText(rawJsonText);
  } catch {
    throw new Error('Reviewer response is not valid JSON');
  }

  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.reviews)
    ? parsed.reviews
    : [];

  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error('Reviewer response contains no reviews');
  }

  const validProblems: ReviewProblem[] = [
    'none',
    'ambiguous',
    'no_correct_option',
    'needs_outside_knowledge',
    'stem_unclear'
  ];

  return rawList.map((item: any, i: number) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`Reviewer item ${i + 1} is not an object`);
    }

    const id = String(item.id || '').trim();
    if (!id) {
      throw new Error(`Reviewer item ${i + 1} is missing required 'id'`);
    }

    if (!item.chosenLetter || typeof item.chosenLetter !== 'string') {
      throw new Error(`Reviewer question ${id} is missing required 'chosenLetter'`);
    }
    const chosenLetter = item.chosenLetter.toUpperCase().trim() as 'A' | 'B' | 'C' | 'D' | 'E';
    if (!['A', 'B', 'C', 'D', 'E'].includes(chosenLetter)) {
      throw new Error(`Reviewer question ${id} has invalid chosenLetter "${item.chosenLetter}"`);
    }

    // defensibleLetters is strictly required and must be an array
    if (item.defensibleLetters === undefined || item.defensibleLetters === null || !Array.isArray(item.defensibleLetters)) {
      throw new Error(`Reviewer question ${id} is missing required 'defensibleLetters' array`);
    }
    const defensibleLetters = item.defensibleLetters
      .map((l: any) => String(l).toUpperCase().trim())
      .filter((l: string): l is 'A' | 'B' | 'C' | 'D' | 'E' => ['A', 'B', 'C', 'D', 'E'].includes(l));

    // problem is strictly required
    if (item.problem === undefined || item.problem === null || typeof item.problem !== 'string') {
      throw new Error(`Reviewer question ${id} is missing required 'problem' field`);
    }
    const rawProblem = item.problem.trim();
    if (!rawProblem) {
      throw new Error(`Reviewer question ${id} has empty 'problem' field`);
    }
    const problem = (validProblems.includes(rawProblem as ReviewProblem)
      ? rawProblem
      : rawProblem) as ReviewProblem;

    const note = typeof item.note === 'string' ? item.note.slice(0, 200).trim() : '';

    let obviouslyWrongLetters: ('A' | 'B' | 'C' | 'D' | 'E')[] | undefined;
    if (Array.isArray(item.obviouslyWrongLetters)) {
      obviouslyWrongLetters = item.obviouslyWrongLetters
        .map((l: any) => String(l).toUpperCase().trim())
        .filter((l: string): l is 'A' | 'B' | 'C' | 'D' | 'E' => ['A', 'B', 'C', 'D', 'E'].includes(l));
    }

    return {
      id,
      chosenLetter,
      defensibleLetters,
      problem,
      note,
      obviouslyWrongLetters
    };
  });
}

/**
 * Judges whether a question passed the blind review.
 * A question passes only if:
 * 1. chosenLetter === correctLetter
 * 2. defensibleLetters contains no letter other than correctLetter
 * 3. problem === "none"
 * Does NOT treat a missing list as "only the chosen letter".
 */
export function judgeQuestion(
  original: RCQuestion,
  review: ReviewerQuestionResult
): ReviewJudgeResult {
  const chosenLetter = review.chosenLetter;
  const expectedLetter = original.correctLetter;
  const defLetters = review.defensibleLetters;

  const letterMatches = chosenLetter === expectedLetter;
  const noOtherDefensible = defLetters.length > 0 && defLetters.every((l) => l === expectedLetter);
  const noProblem = review.problem === 'none';

  const passed = letterMatches && noOtherDefensible && noProblem;

  let failureReason: string | undefined;
  if (!letterMatches) {
    failureReason = `Reviewer selected option ${chosenLetter} instead of intended key ${expectedLetter}`;
  } else if (!noOtherDefensible) {
    const others = defLetters.filter((l) => l !== expectedLetter).join(', ');
    failureReason = others
      ? `Multiple options defensible (${others} in addition to ${expectedLetter})`
      : `No defensible options provided by reviewer`;
  } else if (!noProblem) {
    failureReason = `Reviewer flagged problem "${review.problem}": ${review.note || 'No details'}`;
  }

  return {
    passed,
    chosenLetter,
    expectedLetter,
    defensibleLetters: defLetters,
    problem: review.problem,
    note: review.note,
    failureReason
  };
}
