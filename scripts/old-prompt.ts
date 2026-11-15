export const SYSTEM_INSTRUCTION = `You are an expert CAT VARC and GMAT Focus reading comprehension question writer. You write questions that test understanding of the passage, in the style of real exam questions. Use only information in the passage. Never use outside knowledge. Return only JSON that matches the schema.`;

export interface BuildPromptParams {
  examType: 'CAT' | 'GMAT';
  difficulty: 'Standard' | 'Challenging' | 'Brutal';
  passage: string;
}

export function buildUserPrompt({ examType, difficulty, passage }: BuildPromptParams): string {
  const isGmat = examType === 'GMAT';
  const numQuestions = isGmat ? '5 for GMAT' : '4 for CAT';
  const optionsPerQ = isGmat ? '5 for GMAT (A, B, C, D, E)' : '4 for CAT (A, B, C, D)';

  return `EXAM: ${examType}
DIFFICULTY: ${difficulty}
NUMBER OF QUESTIONS: ${numQuestions}
OPTIONS PER QUESTION: ${optionsPerQ}, lettered A onward

PASSAGE (paragraphs separated by blank lines):
${passage}

QUESTION TYPES TO COVER, one question each:
1. Main idea or primary purpose
2. Inference (what the passage supports or implies)
3. Function of a specific paragraph. Refer to it by quoting its first six words, for example: the paragraph that begins "Resilience is often considered...". Never refer to paragraph numbers or symbols like ¶.
4. Author's tone or attitude
${isGmat ? '5. (GMAT only) Strengthen or weaken an argument made in the passage\n' : ''}
RULES FOR OPTIONS:
- Exactly one option is correct and clearly supported by the passage. Include in "evidence" a short phrase copied word for word from the passage that proves it.
- Every wrong option must be plausible but wrong for one specific reason: too extreme, reversal of the author's view, out of scope, true but does not answer the question, distorts a detail, or unsupported comparison.
- All options in a question have similar length and grammar. Do not make the correct answer the longest.
- Do not write 'all of the above', 'none of the above' or joke options.
- Spread the correct letters across A to D (or A to E). Do not repeat the same correct letter in more than two questions.
- Standard: wrong options are clearly off. Challenging: wrong options are partly true. Brutal: wrong options are tempting half-truths and at least one question uses an EXCEPT or NOT stem.

EXPLANATIONS:
For every option, write one or two sentences. For the correct option, say what in the passage supports it. For each wrong option, name the flaw (for example 'Too extreme') and explain why it fails, referring to the passage's wording.

QUESTIONS MUST NOT repeat the passage's sentences as options, and must not depend on any word that is not in the passage.`;
}
