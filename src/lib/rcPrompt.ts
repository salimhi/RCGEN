import type { QuestionPlan, QuestionSlot } from './questionPlan.ts';
import { planQuestions } from './questionPlan.ts';

export const SYSTEM_INSTRUCTION = `You are a senior CAT VARC (IIM entrance) and GMAT Focus verbal question writer with ten years of experience writing reading comprehension sets. Your questions can only be answered by careful reading of the passage. Every question has exactly one defensible correct answer. Use only the passage and never rely on outside facts. Return only JSON that matches the schema.`;

export interface BuildPromptParams {
  examType: 'CAT' | 'GMAT';
  difficulty: 'Standard' | 'Challenging' | 'Brutal';
  passage: string;
  plan?: QuestionPlan;
}

export function formatSlotsForPrompt(slots: QuestionSlot[]): string {
  return slots
    .map((slot, idx) => {
      const tags: string[] = [];
      if (slot.multiParagraph) tags.push('[MULTI-PARAGRAPH]');
      if (slot.deep) tags.push('[DEEP]');
      const tagHeader = tags.length > 0 ? ` ${tags.join(' ')}` : '';

      let requirementText = '';
      if (slot.multiParagraph && slot.deep) {
        requirementText = `\n- Requirement: [MULTI-PARAGRAPH] [DEEP] This question MUST require the reader to combine, compare or trace an idea across at least two different paragraphs. In the question JSON, return 'paragraphsNeeded' as an array of the first six words of each paragraph required. This question MUST ALSO test a subtle implication, unstated assumption, author position or tone, or the logical relationship between parts of the argument. It must not be answerable by locating a single fact.`;
      } else if (slot.multiParagraph) {
        requirementText = `\n- Requirement: [MULTI-PARAGRAPH] This question MUST require the reader to combine, compare or trace an idea across at least two different paragraphs. In the question JSON, return 'paragraphsNeeded' as an array of the first six words of each paragraph required.`;
      } else if (slot.deep) {
        requirementText = `\n- Requirement: [DEEP] This question MUST test a subtle implication, unstated assumption, author position or tone, or the logical relationship between parts of the argument. It must not be answerable by locating a single fact.`;
      }

      return `Slot ${idx + 1}${tagHeader}:
- Primary: "${slot.primary.id}" (${slot.primary.label}) — Hint: ${slot.primary.stemHint}
- Backup 1: "${slot.backups[0].id}" (${slot.backups[0].label}) — Hint: ${slot.backups[0].stemHint}
- Backup 2: "${slot.backups[1].id}" (${slot.backups[1].label}) — Hint: ${slot.backups[1].stemHint}${requirementText}`;
    })
    .join('\n\n');
}

export function buildUserPrompt({ examType, difficulty, passage, plan }: BuildPromptParams): string {
  const isGmat = examType === 'GMAT';
  const numQuestions = isGmat ? '5 for GMAT' : '4 for CAT';
  const optionsPerQ = isGmat ? '5 for GMAT, lettered from A to E' : '4 for CAT, lettered from A to D';
  const supportedDistractors = isGmat
    ? 'four options that the passage supports and one that it does not'
    : 'three options that the passage supports and one that it does not';

  const effectivePlan = plan || planQuestions(examType, difficulty);
  const slotsFormatted = formatSlotsForPrompt(effectivePlan.slots);

  return `EXAM: ${examType}
DIFFICULTY: ${difficulty}
QUESTIONS: ${numQuestions}
OPTIONS PER QUESTION: ${optionsPerQ}

PASSAGE:
${passage}

STEP 1: ANALYSE THE PASSAGE (fill the 'analysis' field first, briefly)
- genre: argumentative, expository, narrative or descriptive
- thesis: one sentence
- paragraphs: for each paragraph, its first six words and its role in at most 12 words
- stance: the author's attitude in one phrase
- keyClaims: up to 4 claims
- contextWords: up to 3 words or phrases whose meaning in this passage differs from their everyday meaning (empty if none)
- implicitClaims: up to 3 claims the author relies on or implies without stating directly, each with the first six words of the paragraph or paragraphs it draws on
- relationships: up to 3 logical relationships between paragraphs or claims (e.g. "claim A in [first six words] is qualified by example B in [first six words]", "paragraph [first six words] gives a counter-argument to [first six words]")
- deepSupported: boolean, true if the passage has enough depth to support at least one subtle-implication, assumption, tone or logical-relationship question

QUESTION SET THEME
Every question set should contain questions that require different cognitive operations. Avoid generating four questions that can be answered through direct paraphrasing. At least one question should require combining ideas from multiple paragraphs, and at least one should test a subtle implication, assumption, author position, or logical relationship when supported by the passage. Distractors must be plausible interpretations, not merely obviously incorrect statements.

Where an earlier rule and the theme section could conflict (such as distractor flaws), the theme section overrides: every wrong option must be a plausible interpretation, even if a flaw tag was chosen. A wrong option is NOT acceptable if it is absurd, off-topic, a plain negation of the correct option, a statement the passage contradicts in plain words, or wrong without needing the passage to see it.

STEP 2: WRITE THE ASSIGNED QUESTIONS
Write exactly one question per slot, in slot order. Each slot gives a subtype and two backups with a short stem hint. Use the subtype if the passage supports a good question of that kind. If it cannot (for example no word whose contextual meaning differs from its everyday meaning), use the first backup that works and set 'substituted' to true. Return 'subtypeId' for every question.

ASSIGNED SLOTS:
${slotsFormatted}

Rules for questions:
- Negative stems (EXCEPT, NOT, cannot be inferred, least likely) must have exactly ${supportedDistractors}.
- Vocabulary questions must name a word or phrase that appears in the passage and offer options that are plausible meanings, with the passage's meaning as the only correct one.
- When a paragraph is referred to, quote its first six words. Never use paragraph numbers or the symbol ¶.

STEP 3: WRITE THE OPTIONS
- Exactly one option is correct and a careful reader can defend it from the text. Each of the other options is clearly wrong for a reason you can name.
- Plausible distractors: Every wrong option must look attractive to someone who read quickly. It must use ideas and vocabulary from the passage. Do not use generic filler, nonsense, or obvious falsehoods. For each wrong option, fill 'tempting' (at most 15 words explaining why a careless reader might pick this option).
- Direct-paraphrase limit: No more than 1 question (CAT) or 2 questions (GMAT) may be answered by matching a single sentence in the passage to a direct paraphrase in the option. The other questions must require synthesis, inference, or structural understanding.
- Options are complete, parallel clauses of 12 to 30 words, paraphrased (never copied sentences from the passage) and of similar length. The correct answer must not be the longest option in more than one question.
- Each wrong option has one flaw from this list: extreme (absolutes such as always, never, only, entirely), opposite (reverses the author's view), scope (a different topic or level than the passage or the question), distortion (a real detail twisted or half true), comparison (compares things the author never compares), causal (confuses cause and effect), irrelevant (true in the passage but does not answer this question). Each question uses at least two different flaws, and at most one 'irrelevant' option. Remember: the theme overrides flaws — every wrong option must remain a plausible interpretation.
- Spread the correct letters across all positions. No letter is correct in more than two questions.
- Never mention option letters, other options, 'all of the above', 'none of the above', 'both A and B', or any reference between options in an option text or an explanation.
- Paraphrase and synonyms are allowed in options. Answering must never require outside knowledge.

DIFFICULTY
- Standard: the questions are direct and the wrong options are clearly off.
- Challenging: in at least half the questions two options look plausible and the right one needs careful reading of qualifiers and scope.
- Brutal: most questions have competing options that are each partly true. The key needs information from different parts of the passage, or a subtle shift of scope, degree or cause. Do not make the language harder, make the thinking harder. A negative stem alone does not make a question hard.

EXPLANATIONS AND EVIDENCE
- 'evidence': OPTIONAL. If one phrase copied exactly from the passage decides the answer, copy it (at most 25 words). For questions about the whole passage, tone, structure or inference, where no single phrase decides it, return an empty string. Never paraphrase inside the evidence field.
- For every option write one or two sentences. Correct option: where and how the passage supports it. Wrong options: set 'flawTag' and explain precisely why it fails, using the passage's wording.

Return JSON only.`;
}

export const GENERATION_JSON_SCHEMA = {
  type: 'OBJECT',
  properties: {
    analysis: {
      type: 'OBJECT',
      properties: {
        genre: { type: 'STRING', description: 'argumentative, expository, narrative or descriptive' },
        thesis: { type: 'STRING', description: 'One sentence thesis' },
        paragraphs: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              firstSixWords: { type: 'STRING' },
              role: { type: 'STRING', description: 'At most 12 words' }
            },
            required: ['firstSixWords', 'role']
          }
        },
        stance: { type: 'STRING', description: "Author's attitude in one phrase" },
        keyClaims: { type: 'ARRAY', items: { type: 'STRING' } },
        contextWords: { type: 'ARRAY', items: { type: 'STRING' } },
        implicitClaims: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              claim: { type: 'STRING' },
              paragraphs: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['claim', 'paragraphs']
          }
        },
        relationships: { type: 'ARRAY', items: { type: 'STRING' } },
        deepSupported: { type: 'BOOLEAN' }
      },
      required: ['genre', 'thesis', 'paragraphs', 'stance', 'keyClaims', 'contextWords']
    },
    questions: {
      type: 'ARRAY',
      description: 'Exam questions list',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'STRING' },
          type: {
            type: 'STRING',
            enum: [
              'Main Idea',
              'Inference',
              'Paragraph Function',
              'Tone & Attitude',
              'Strengthen / Weaken',
              'Detail & Logic',
              'Vocabulary in Context'
            ]
          },
          subtype: { type: 'STRING' },
          subtypeId: { type: 'STRING', description: 'Catalog subtype id (primary or backup)' },
          substituted: { type: 'BOOLEAN', description: 'true if a backup was used instead of primary' },
          stem: { type: 'STRING' },
          correctLetter: { type: 'STRING', enum: ['A', 'B', 'C', 'D', 'E'] },
          evidence: { type: 'STRING', description: 'Optional verbatim phrase from passage, or empty string' },
          paragraphsNeeded: {
            type: 'ARRAY',
            items: { type: 'STRING' },
            description: 'First six words of paragraphs required. Non-empty for [MULTI-PARAGRAPH] questions.'
          },
          options: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                letter: { type: 'STRING', enum: ['A', 'B', 'C', 'D', 'E'] },
                text: { type: 'STRING' },
                explanation: { type: 'STRING' },
                flawTag: { type: 'STRING', description: 'extreme, opposite, scope, distortion, comparison, causal, irrelevant' },
                tempting: { type: 'STRING', description: 'At most 15 words explaining why a careless reader might pick this option' }
              },
              required: ['letter', 'text', 'explanation']
            }
          }
        },
        required: ['id', 'subtypeId', 'stem', 'correctLetter', 'options']
      }
    }
  },
  required: ['analysis', 'questions']
};
