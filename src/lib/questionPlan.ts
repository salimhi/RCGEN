import type { ExamType, RCQuestion, RCOption } from '../types.ts';

export type Archetype =
  | 'Main Idea'
  | 'Inference'
  | 'Detail & Logic'
  | 'Tone & Attitude'
  | 'Paragraph Function'
  | 'Vocabulary in Context'
  | 'Strengthen / Weaken';

/**
 * Cognitive Operations:
 * Every catalog subtype is categorized into one of five cognitive operations.
 */
export type CognitiveOperation =
  | 'locate'
  | 'interpret'
  | 'infer'
  | 'synthesize'
  | 'evaluate';

export const SUBTYPE_OPERATIONS: Record<string, CognitiveOperation> = {
  // locate: direct retrieval / matching of facts from specific text points
  according_to: 'locate',
  not_according_to: 'locate',

  // interpret: analyzing tone, rhetorical role, or contextual word/phrase nuance
  attitude: 'interpret',
  para_function: 'interpret',
  example_role: 'interpret',
  word_meaning: 'interpret',
  phrase_meaning: 'interpret',

  // infer: reasoning toward unstated conclusions, viewpoints, or novel applications
  can_be_inferred: 'infer',
  cannot_be_inferred: 'infer',
  author_agrees: 'infer',
  author_least_agrees: 'infer',
  application: 'infer',

  // synthesize: combining ideas across paragraphs, overarching purpose, structure
  central_idea: 'synthesize',
  title: 'synthesize',
  primary_purpose: 'synthesize',
  structure: 'synthesize',

  // evaluate: critically testing assumptions, support, or vulnerability of arguments
  assumption: 'evaluate',
  strengthen: 'evaluate',
  weaken: 'evaluate'
};

/**
 * Deep Subtypes:
 * Subtypes that test subtle implications, assumptions, unstated author positions, or logical relations.
 */
export const DEEP_SUBTYPES: ReadonlySet<string> = new Set([
  'can_be_inferred',
  'cannot_be_inferred',
  'author_agrees',
  'author_least_agrees',
  'application',
  'assumption',
  'strengthen',
  'weaken'
]);

/**
 * Multi-Paragraph Eligible Subtypes:
 * Subtypes whose scope naturally spans or combines ideas from multiple paragraphs.
 */
export const MULTI_PARAGRAPH_ELIGIBLE_SUBTYPES: ReadonlySet<string> = new Set([
  'central_idea',
  'title',
  'primary_purpose',
  'can_be_inferred',
  'author_agrees',
  'author_least_agrees',
  'application',
  'structure',
  'assumption',
  'strengthen',
  'weaken'
]);

/**
 * Question Set Theme Caps and Constraints:
 * - Locate slots cap: at most 1 for CAT, 2 for GMAT
 * - Minimum distinct operations: at least 3
 * - Minimum deep slots: at least 1
 * - Required multi-paragraph slots: exactly 1
 */
export const MAX_LOCATE_SLOTS: Record<ExamType, number> = {
  CAT: 1,
  GMAT: 2
};

export const MIN_DISTINCT_OPERATIONS = 3;
export const MIN_DEEP_SLOTS = 1;
export const REQUIRED_MULTI_PARAGRAPH_SLOTS = 1;

export interface SubtypeFlags {
  global?: boolean;
  negative?: boolean;
  vocab?: boolean;
  needs_paragraph?: boolean;
  needs_example?: boolean;
  needs_context_word?: boolean;
}

export interface SubtypeCatalogItem {
  id: string;
  label: string;
  archetype: Archetype;
  operation?: CognitiveOperation;
  weight?: number;
  flags: SubtypeFlags;
  stemHint: string;
}

export interface QuestionSlot {
  slotIndex: number;
  primary: SubtypeCatalogItem;
  backups: [SubtypeCatalogItem, SubtypeCatalogItem];
  multiParagraph?: boolean;
  deep?: boolean;
  operation: CognitiveOperation;
}

export interface QuestionPlan {
  exam: ExamType;
  difficulty: string;
  slots: QuestionSlot[];
  signature: string;
  forced?: boolean;
}

/**
 * Question Catalog Weights:
 * Configured separately for CAT and GMAT exam formats.
 * Higher weight = higher likelihood of being selected into a slot during question planning.
 *
 * Calibration targets:
 * - Vocabulary in Context (CAT): word_meaning: 0.7, phrase_meaning: 0.7 (targets ~20% to 25% of CAT plans)
 * - Strengthen / Weaken (CAT): assumption: 0.4, strengthen: 0.4, weaken: 0.4 (targets ~10% to 15% of CAT plans)
 * - Strengthen / Weaken (GMAT): exactly 1 slot required by GMAT rules (weight: 1 each; backup: according_to)
 * - GMAT weights for other archetypes remain unchanged.
 *
 * To adjust archetype or subtype probabilities, update the numeric values in this table.
 */
export const SUBTYPE_WEIGHTS: Record<string, { CAT: number; GMAT: number }> = {
  // Main Idea
  central_idea: { CAT: 3, GMAT: 3 },
  title: { CAT: 1, GMAT: 1 },
  primary_purpose: { CAT: 2, GMAT: 2 },

  // Inference
  can_be_inferred: { CAT: 3, GMAT: 3 },
  cannot_be_inferred: { CAT: 2, GMAT: 2 },
  author_agrees: { CAT: 2, GMAT: 2 },
  author_least_agrees: { CAT: 2, GMAT: 2 },
  application: { CAT: 1, GMAT: 1 },

  // Detail & Logic
  according_to: { CAT: 3, GMAT: 3 },
  not_according_to: { CAT: 1, GMAT: 1 },

  // Tone & Attitude
  attitude: { CAT: 2, GMAT: 2 },

  // Paragraph Function
  para_function: { CAT: 2, GMAT: 2 },
  example_role: { CAT: 2, GMAT: 2 },
  structure: { CAT: 1, GMAT: 1 },

  // Vocabulary in Context (CAT tuned to 0.7 each -> ~20-25% plan appearance)
  word_meaning: { CAT: 0.7, GMAT: 2 },
  phrase_meaning: { CAT: 0.7, GMAT: 2 },

  // Strengthen / Weaken (CAT tuned to 0.4 each -> ~10-15% plan appearance)
  assumption: { CAT: 0.4, GMAT: 1 },
  strengthen: { CAT: 0.4, GMAT: 1 },
  weaken: { CAT: 0.4, GMAT: 1 }
};

export function getSubtypeWeight(id: string, exam: ExamType): number {
  return SUBTYPE_WEIGHTS[id]?.[exam] ?? 1;
}

export const QUESTION_CATALOG: SubtypeCatalogItem[] = [
  // Main Idea
  {
    id: 'central_idea',
    label: 'Central idea',
    archetype: 'Main Idea',
    weight: 3,
    flags: { global: true },
    stemHint: 'What is the central idea / overarching argument of the passage?'
  },
  {
    id: 'title',
    label: 'Suitable title',
    archetype: 'Main Idea',
    weight: 1,
    flags: { global: true },
    stemHint: 'Which title best captures the theme and scope of the passage?'
  },
  {
    id: 'primary_purpose',
    label: 'Primary purpose',
    archetype: 'Main Idea',
    weight: 2,
    flags: { global: true },
    stemHint: "What is the author's primary purpose in writing this passage?"
  },

  // Inference
  {
    id: 'can_be_inferred',
    label: 'Can be inferred',
    archetype: 'Inference',
    weight: 3,
    flags: {},
    stemHint: 'Which of the following can most reasonably be inferred from the passage?'
  },
  {
    id: 'cannot_be_inferred',
    label: 'Cannot be reasonably inferred (EXCEPT)',
    archetype: 'Inference',
    weight: 2,
    flags: { negative: true },
    stemHint: 'Which of the following CANNOT be reasonably inferred from the passage?'
  },
  {
    id: 'author_agrees',
    label: 'Author would most likely agree with',
    archetype: 'Inference',
    weight: 2,
    flags: {},
    stemHint: 'With which of the following statements would the author most likely agree?'
  },
  {
    id: 'author_least_agrees',
    label: 'Author would least likely agree with',
    archetype: 'Inference',
    weight: 2,
    flags: { negative: true },
    stemHint: 'With which of the following statements would the author LEAST likely agree?'
  },
  {
    id: 'application',
    label: 'Application to a new situation',
    archetype: 'Inference',
    weight: 1,
    flags: {},
    stemHint: 'Which situation is most similar to the one described in the passage?'
  },

  // Detail & Logic
  {
    id: 'according_to',
    label: 'According to the passage',
    archetype: 'Detail & Logic',
    weight: 3,
    flags: {},
    stemHint: 'According to the passage, which of the following is true regarding X?'
  },
  {
    id: 'not_according_to',
    label: 'Not true according to the passage',
    archetype: 'Detail & Logic',
    weight: 1,
    flags: { negative: true },
    stemHint: 'According to the passage, which of the following is NOT true regarding X?'
  },

  // Tone & Attitude
  {
    id: 'attitude',
    label: "Author's attitude or tone",
    archetype: 'Tone & Attitude',
    weight: 2,
    flags: {},
    stemHint: "The author's attitude or tone toward X is best described as:"
  },

  // Paragraph Function
  {
    id: 'para_function',
    label: 'Role of a paragraph',
    archetype: 'Paragraph Function',
    weight: 2,
    flags: { needs_paragraph: true },
    stemHint: "The paragraph that begins '...' primarily serves to:"
  },
  {
    id: 'example_role',
    label: 'Role of an example or quoted view',
    archetype: 'Paragraph Function',
    weight: 2,
    flags: { needs_example: true },
    stemHint: "The author mentions '...' primarily in order to:"
  },
  {
    id: 'structure',
    label: 'Organisation of the passage',
    archetype: 'Paragraph Function',
    weight: 1,
    flags: {},
    stemHint: 'Which of the following best describes the organisation of the passage?'
  },

  // Vocabulary in Context
  {
    id: 'word_meaning',
    label: 'Contextual meaning of a word',
    archetype: 'Vocabulary in Context',
    weight: 2,
    flags: { vocab: true, needs_context_word: true },
    stemHint: "In the passage, the word '...' most nearly means:"
  },
  {
    id: 'phrase_meaning',
    label: 'Meaning or use of a phrase in context',
    archetype: 'Vocabulary in Context',
    weight: 2,
    flags: { vocab: true },
    stemHint: "In the passage, the phrase '...' is used to suggest:"
  },

  // Strengthen / Weaken
  {
    id: 'assumption',
    label: 'Assumption of the argument',
    archetype: 'Strengthen / Weaken',
    weight: 1,
    flags: {},
    stemHint: 'Which of the following is an underlying assumption of the argument?'
  },
  {
    id: 'strengthen',
    label: 'Strengthen the argument',
    archetype: 'Strengthen / Weaken',
    weight: 1,
    flags: {},
    stemHint: 'Which of the following, if true, would most strongly support or strengthen the argument?'
  },
  {
    id: 'weaken',
    label: 'Weaken the argument',
    archetype: 'Strengthen / Weaken',
    weight: 1,
    flags: {},
    stemHint: 'Which of the following, if true, would most seriously weaken the argument?'
  }
];

// Initialize operation on every catalog item
QUESTION_CATALOG.forEach((item) => {
  item.operation = SUBTYPE_OPERATIONS[item.id] || 'infer';
});

export const SUBTYPE_BY_ID = new Map<string, SubtypeCatalogItem>(
  QUESTION_CATALOG.map((c) => [c.id, c])
);

export const STORAGE_KEY_LAST_PLANS = 'practicerc.v1.lastPlans';

export function cryptoRng(): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / (0xffffffff + 1);
  }
  return Math.random();
}

/**
 * Checks whether a list of subtypes conforms to all exam constraints:
 * - CAT: exactly 4, GMAT: exactly 5
 * - at most 1 global
 * - at most 1 negative stem for CAT, 2 for GMAT
 * - at most 1 vocabulary subtype
 * - at most 2 per archetype
 * - no duplicate subtype
 * - at least 3 distinct archetypes
 * - for GMAT: exactly one slot from Strengthen / Weaken
 * - for CAT: Strengthen / Weaken allowed at most once
 * - at most 1 locate slot for CAT, 2 for GMAT
 * - at least 3 distinct cognitive operations
 * - at least 1 deep question slot (unless deep is waived)
 */
export function validateSubtypeList(
  subtypes: SubtypeCatalogItem[],
  exam: ExamType,
  allowSubstitutedStrengthenWeakenForGmat = false,
  allowDeepWaived = false
): { valid: boolean; reason?: string } {
  const expectedCount = exam === 'GMAT' ? 5 : 4;
  if (subtypes.length !== expectedCount) {
    return { valid: false, reason: `Expected ${expectedCount} questions, got ${subtypes.length}` };
  }

  const ids = new Set<string>();
  const archetypeCounts = new Map<Archetype, number>();
  let globalCount = 0;
  let negativeCount = 0;
  let vocabCount = 0;
  let strengthenWeakenCount = 0;

  for (const s of subtypes) {
    if (ids.has(s.id)) {
      return { valid: false, reason: `Duplicate subtype: ${s.id}` };
    }
    ids.add(s.id);

    const count = (archetypeCounts.get(s.archetype) || 0) + 1;
    if (count > 2) {
      return { valid: false, reason: `More than 2 questions from archetype: ${s.archetype}` };
    }
    archetypeCounts.set(s.archetype, count);

    if (s.flags.global) globalCount++;
    if (s.flags.negative) negativeCount++;
    if (s.flags.vocab) vocabCount++;
    if (s.archetype === 'Strengthen / Weaken') strengthenWeakenCount++;
  }

  if (globalCount > 1) {
    return { valid: false, reason: `More than 1 global question (${globalCount})` };
  }

  const maxNeg = exam === 'GMAT' ? 2 : 1;
  if (negativeCount > maxNeg) {
    return { valid: false, reason: `More than ${maxNeg} negative stem question(s) (${negativeCount})` };
  }

  if (vocabCount > 1) {
    return { valid: false, reason: `More than 1 vocabulary question (${vocabCount})` };
  }

  if (archetypeCounts.size < 3) {
    return { valid: false, reason: `Fewer than 3 distinct archetypes (${archetypeCounts.size})` };
  }

  if (exam === 'GMAT') {
    if (!allowSubstitutedStrengthenWeakenForGmat && strengthenWeakenCount !== 1) {
      return { valid: false, reason: `GMAT must have exactly 1 Strengthen / Weaken question, got ${strengthenWeakenCount}` };
    }
    if (allowSubstitutedStrengthenWeakenForGmat && strengthenWeakenCount > 1) {
      return { valid: false, reason: `GMAT cannot have more than 1 Strengthen / Weaken question, got ${strengthenWeakenCount}` };
    }
  } else {
    if (strengthenWeakenCount > 1) {
      return { valid: false, reason: `CAT allows at most 1 Strengthen / Weaken question, got ${strengthenWeakenCount}` };
    }
  }

  // Cognitive Operations Constraints
  const maxLocate = MAX_LOCATE_SLOTS[exam];
  const locateCount = subtypes.filter(
    (s) => (s.operation || SUBTYPE_OPERATIONS[s.id]) === 'locate'
  ).length;
  if (locateCount > maxLocate) {
    return { valid: false, reason: `More than ${maxLocate} locate question(s) (${locateCount})` };
  }

  const distinctOps = new Set(
    subtypes.map((s) => s.operation || SUBTYPE_OPERATIONS[s.id] || 'infer')
  );
  if (distinctOps.size < MIN_DISTINCT_OPERATIONS) {
    return { valid: false, reason: `Fewer than ${MIN_DISTINCT_OPERATIONS} distinct operations (${distinctOps.size})` };
  }

  if (!allowDeepWaived) {
    const deepCount = subtypes.filter((s) => DEEP_SUBTYPES.has(s.id)).length;
    if (deepCount < MIN_DEEP_SLOTS) {
      return { valid: false, reason: `Plan requires at least ${MIN_DEEP_SLOTS} deep question slot` };
    }
  }

  return { valid: true };
}

export function verifyPlanConstraints(plan: QuestionPlan): { valid: boolean; reason?: string } {
  const isGmat = plan.exam === 'GMAT';
  const expectedCount = isGmat ? 5 : 4;
  if (plan.slots.length !== expectedCount) {
    return { valid: false, reason: `Expected ${expectedCount} slots, got ${plan.slots.length}` };
  }

  const primaries = plan.slots.map((s) => s.primary);
  const baseVal = validateSubtypeList(primaries, plan.exam);
  if (!baseVal.valid) return baseVal;

  const multiSlots = plan.slots.filter((s) => s.multiParagraph);
  if (multiSlots.length !== 1) {
    return { valid: false, reason: `Expected exactly 1 multiParagraph slot, got ${multiSlots.length}` };
  }
  if (!MULTI_PARAGRAPH_ELIGIBLE_SUBTYPES.has(multiSlots[0].primary.id)) {
    return { valid: false, reason: `Slot ${multiSlots[0].primary.id} is not eligible for multiParagraph` };
  }

  const deepSlots = plan.slots.filter((s) => s.deep);
  if (deepSlots.length < 1) {
    return { valid: false, reason: `Expected at least 1 deep slot flagged deep, got ${deepSlots.length}` };
  }
  for (const ds of deepSlots) {
    if (!DEEP_SUBTYPES.has(ds.primary.id)) {
      return { valid: false, reason: `Slot ${ds.primary.id} flagged deep is not in DEEP_SUBTYPES` };
    }
  }

  return { valid: true };
}

function weightedDraw(
  items: SubtypeCatalogItem[],
  exam: ExamType,
  rng: (items?: SubtypeCatalogItem[]) => number
): SubtypeCatalogItem {
  const totalWeight = items.reduce((sum, item) => sum + getSubtypeWeight(item.id, exam), 0);
  let r = (rng as any)(items) * totalWeight;
  for (const item of items) {
    const w = getSubtypeWeight(item.id, exam);
    if (r < w) return item;
    r -= w;
  }
  return items[items.length - 1];
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Creates a guaranteed valid plan by forcing replacement of slots if redraws fail.
 */
export function forceValidPlan(
  exam: ExamType,
  difficulty: string,
  rng: () => number = cryptoRng
): QuestionPlan {
  const isGmat = exam === 'GMAT';
  // Deterministic catalog items meeting 100% of constraints
  const primaries: SubtypeCatalogItem[] = isGmat
    ? [
        SUBTYPE_BY_ID.get('central_idea')!,  // synthesize, global, multi-eligible
        SUBTYPE_BY_ID.get('can_be_inferred')!, // infer, deep, multi-eligible
        SUBTYPE_BY_ID.get('according_to')!,    // locate (count: 1 <= 2)
        SUBTYPE_BY_ID.get('attitude')!,        // interpret
        SUBTYPE_BY_ID.get('strengthen')!       // evaluate, deep, multi-eligible, GMAT SW
      ]
    : [
        SUBTYPE_BY_ID.get('central_idea')!,  // synthesize, global, multi-eligible
        SUBTYPE_BY_ID.get('can_be_inferred')!, // infer, deep, multi-eligible
        SUBTYPE_BY_ID.get('according_to')!,    // locate (count: 1 <= 1)
        SUBTYPE_BY_ID.get('attitude')!         // interpret
      ];

  const shuffledPrimaries = shuffleArray(primaries, rng);
  const slots: QuestionSlot[] = [];

  for (let idx = 0; idx < shuffledPrimaries.length; idx++) {
    const primary = shuffledPrimaries[idx];
    const isSw = primary.archetype === 'Strengthen / Weaken';
    const isDeep = DEEP_SUBTYPES.has(primary.id);

    let b1: SubtypeCatalogItem;
    let b2: SubtypeCatalogItem;

    if (isSw) {
      b1 = SUBTYPE_BY_ID.get('according_to')!;
      b2 = SUBTYPE_BY_ID.get('can_be_inferred')!;
    } else if (isDeep) {
      // Deep slot backups must also be deep
      b1 = primary.id === 'can_be_inferred'
        ? SUBTYPE_BY_ID.get('author_agrees')!
        : SUBTYPE_BY_ID.get('can_be_inferred')!;
      b2 = primary.id === 'cannot_be_inferred'
        ? SUBTYPE_BY_ID.get('author_least_agrees')!
        : SUBTYPE_BY_ID.get('cannot_be_inferred')!;
    } else {
      b1 = primary.archetype === 'Main Idea'
        ? SUBTYPE_BY_ID.get('can_be_inferred')!
        : SUBTYPE_BY_ID.get('primary_purpose')!;
      b2 = primary.archetype === 'Tone & Attitude'
        ? SUBTYPE_BY_ID.get('para_function')!
        : SUBTYPE_BY_ID.get('attitude')!;
    }

    slots.push({
      slotIndex: idx,
      primary,
      backups: [b1, b2],
      operation: primary.operation || SUBTYPE_OPERATIONS[primary.id] || 'infer'
    });
  }

  // Exactly 1 slot flagged multiParagraph (preferring deep)
  const deepEligible = slots.filter((s) => MULTI_PARAGRAPH_ELIGIBLE_SUBTYPES.has(s.primary.id) && DEEP_SUBTYPES.has(s.primary.id));
  const eligible = slots.filter((s) => MULTI_PARAGRAPH_ELIGIBLE_SUBTYPES.has(s.primary.id));
  const chosenMulti = deepEligible.length > 0
    ? deepEligible[Math.floor(rng() * deepEligible.length)]
    : eligible[Math.floor(rng() * eligible.length)] || slots[0];
  chosenMulti.multiParagraph = true;

  // Ensure deep slot is flagged deep
  if (DEEP_SUBTYPES.has(chosenMulti.primary.id)) {
    chosenMulti.deep = true;
  } else {
    const anyDeep = slots.find((s) => DEEP_SUBTYPES.has(s.primary.id));
    if (anyDeep) anyDeep.deep = true;
  }

  return {
    exam,
    difficulty,
    slots,
    signature: slots.map((s) => s.primary.archetype).join(' | '),
    forced: true
  };
}

/**
 * Plans questions for an exam session adhering to all catalog constraints and history avoidance.
 */
export function planQuestions(
  exam: ExamType,
  difficulty: string,
  rng: () => number = cryptoRng
): QuestionPlan {
  const targetCount = exam === 'GMAT' ? 5 : 4;
  let lastPlans: string[] = [];

  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_LAST_PLANS);
      if (stored) {
        lastPlans = JSON.parse(stored);
      }
    } catch {
      lastPlans = [];
    }
  }

  let chosenPlan: QuestionPlan | null = null;

  for (let attempt = 0; attempt < 30; attempt++) {
    // 1. Pick primary subtypes
    let primaries: SubtypeCatalogItem[] = [];

    for (let drawTry = 0; drawTry < 100; drawTry++) {
      primaries = [];
      const isGmat = exam === 'GMAT';

      // For GMAT, exactly one slot must come from Strengthen / Weaken
      if (isGmat) {
        const swGroup = QUESTION_CATALOG.filter((c) => c.archetype === 'Strengthen / Weaken');
        primaries.push(weightedDraw(swGroup, exam, rng));
      }

      // Fill remaining slots
      while (primaries.length < targetCount) {
        const candidateItems = QUESTION_CATALOG.filter((c) => {
          // No duplicate subtype
          if (primaries.some((p) => p.id === c.id)) return false;

          // Archetype count <= 2
          const archCount = primaries.filter((p) => p.archetype === c.archetype).length;
          if (archCount >= 2) return false;

          // Global <= 1
          if (c.flags.global && primaries.some((p) => p.flags.global)) return false;

          // Negative <= maxNeg
          const maxNeg = isGmat ? 2 : 1;
          const currentNeg = primaries.filter((p) => p.flags.negative).length;
          if (c.flags.negative && currentNeg >= maxNeg) return false;

          // Vocab <= 1
          if (c.flags.vocab && primaries.some((p) => p.flags.vocab)) return false;

          // Strengthen / Weaken
          if (c.archetype === 'Strengthen / Weaken') {
            if (isGmat) return false; // already added
            if (primaries.some((p) => p.archetype === 'Strengthen / Weaken')) return false;
          }

          return true;
        });

        if (candidateItems.length === 0) break;
        primaries.push(weightedDraw(candidateItems, exam, rng));
      }

      const val = validateSubtypeList(primaries, exam);
      if (val.valid) break;
    }

    // Shuffle primary slot order
    primaries = shuffleArray(primaries, rng);

    // 2. Select 2 backups per slot
    const slots: QuestionSlot[] = [];
    let backupsValid = true;

    for (let i = 0; i < primaries.length; i++) {
      const primary = primaries[i];
      const otherPrimaries = primaries.filter((_, idx) => idx !== i);
      const isGmatSwSlot = exam === 'GMAT' && primary.archetype === 'Strengthen / Weaken';
      const isPrimaryDeep = DEEP_SUBTYPES.has(primary.id);

      let backupCandidates = QUESTION_CATALOG.filter((cand) => {
        if (cand.archetype === primary.archetype) return false;
        if (otherPrimaries.some((p) => p.id === cand.id)) return false;

        // Check if substituting this candidate preserves validity
        const simulatedList = [...otherPrimaries, cand];
        const res = validateSubtypeList(simulatedList, exam, isGmatSwSlot);
        return res.valid;
      });

      let backup1: SubtypeCatalogItem;
      let backup2: SubtypeCatalogItem;

      if (isGmatSwSlot) {
        // Spec rule: "for GMAT exactly one slot from the Strengthen / Weaken group (backup: according_to)"
        const accTo = SUBTYPE_BY_ID.get('according_to')!;
        backup1 = accTo;
        const remainingCandidates = backupCandidates.filter(
          (c) => c.id !== backup1.id && c.archetype !== primary.archetype
        );
        if (remainingCandidates.length === 0) {
          backupsValid = false;
          break;
        }
        backup2 = weightedDraw(remainingCandidates, exam, rng);
      } else {
        // If primary is deep, prioritize backups that are also deep
        if (isPrimaryDeep) {
          const deepCandidates = backupCandidates.filter((cand) => DEEP_SUBTYPES.has(cand.id));
          if (deepCandidates.length >= 2) {
            backupCandidates = deepCandidates;
          }
        }

        if (backupCandidates.length < 2) {
          backupsValid = false;
          break;
        }
        backup1 = weightedDraw(backupCandidates, exam, rng);
        const remainingCandidates = backupCandidates.filter(
          (c) => c.id !== backup1.id && c.archetype !== primary.archetype
        );
        if (remainingCandidates.length === 0) {
          backupsValid = false;
          break;
        }
        backup2 = weightedDraw(remainingCandidates, exam, rng);
      }

      slots.push({
        slotIndex: i,
        primary,
        backups: [backup1, backup2],
        operation: primary.operation || SUBTYPE_OPERATIONS[primary.id] || 'infer'
      });
    }

    if (!backupsValid || slots.length !== targetCount) continue;

    // 3. Flag exactly 1 slot multiParagraph (preferring deep) and flag deep slot
    const deepEligible = slots.filter(
      (s) => MULTI_PARAGRAPH_ELIGIBLE_SUBTYPES.has(s.primary.id) && DEEP_SUBTYPES.has(s.primary.id)
    );
    const allEligible = slots.filter((s) => MULTI_PARAGRAPH_ELIGIBLE_SUBTYPES.has(s.primary.id));
    const chosenMultiSlot = deepEligible.length > 0
      ? deepEligible[Math.floor(rng() * deepEligible.length)]
      : allEligible[Math.floor(rng() * allEligible.length)] || slots[0];

    chosenMultiSlot.multiParagraph = true;

    // Flag deep slot: if multiParagraph slot is deep, flag it; otherwise flag the deep slot
    if (DEEP_SUBTYPES.has(chosenMultiSlot.primary.id)) {
      chosenMultiSlot.deep = true;
    } else {
      const anyDeepSlot = slots.find((s) => DEEP_SUBTYPES.has(s.primary.id));
      if (anyDeepSlot) anyDeepSlot.deep = true;
    }

    const signature = slots.map((s) => s.primary.archetype).join(' | ');

    chosenPlan = {
      exam,
      difficulty,
      slots,
      signature
    };

    // Verify all new constraints hold on candidate plan
    const check = verifyPlanConstraints(chosenPlan);
    if (!check.valid) {
      chosenPlan = null;
      continue;
    }

    // If signature doesn't match last 3 plans, we can accept it immediately!
    if (!lastPlans.includes(signature)) {
      break;
    }
  }

  // If no valid plan was found after attempts, force a guaranteed valid plan
  if (!chosenPlan) {
    chosenPlan = forceValidPlan(exam, difficulty, rng);
  }

  // Update lastPlans in localStorage (up to 3)
  if (typeof localStorage !== 'undefined') {
    try {
      const updated = [...lastPlans, chosenPlan.signature].slice(-3);
      localStorage.setItem(STORAGE_KEY_LAST_PLANS, JSON.stringify(updated));
    } catch {
      // Ignore localStorage errors
    }
  }

  return chosenPlan;
}

/**
 * Shuffles options for each question with uniform random permutation,
 * updates correctLetter, ensures no letter is the key in > 2 questions (up to 20 tries),
 * shuffles question order with Fisher-Yates, and renumbers ids q1..qN.
 * NEVER applied to authored tests from src/data.
 */
export function shuffleQuestionsAndOptions(
  questions: RCQuestion[],
  isGmat: boolean,
  rng: () => number = cryptoRng
): RCQuestion[] {
  const letters: ('A' | 'B' | 'C' | 'D' | 'E')[] = isGmat
    ? ['A', 'B', 'C', 'D', 'E']
    : ['A', 'B', 'C', 'D'];

  let bestShuffled: RCQuestion[] = [];

  for (let attempt = 0; attempt < 20; attempt++) {
    const candidateQuestions: RCQuestion[] = questions.map((q) => {
      const oldCorrectOpt = q.options.find((o) => o.letter === q.correctLetter);

      // Uniform random permutation of options
      const permuted = [...q.options];
      for (let i = permuted.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [permuted[i], permuted[j]] = [permuted[j], permuted[i]];
      }

      let newCorrectLetter: 'A' | 'B' | 'C' | 'D' | 'E' = 'A';
      const newOptions: RCOption[] = permuted.map((opt, idx) => {
        const newLetter = letters[idx];
        if (oldCorrectOpt && opt === oldCorrectOpt) {
          newCorrectLetter = newLetter;
        }
        return {
          ...opt,
          letter: newLetter
        };
      });

      return {
        ...q,
        correctLetter: newCorrectLetter,
        options: newOptions
      };
    });

    const keyCounts: Record<string, number> = {};
    for (const q of candidateQuestions) {
      keyCounts[q.correctLetter] = (keyCounts[q.correctLetter] || 0) + 1;
    }

    const hasExcessKey = Object.values(keyCounts).some((count) => count > 2);
    bestShuffled = candidateQuestions;
    if (!hasExcessKey) {
      break;
    }
  }

  // Shuffle questions order using Fisher-Yates
  const reorderedQuestions = [...bestShuffled];
  for (let i = reorderedQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [reorderedQuestions[i], reorderedQuestions[j]] = [reorderedQuestions[j], reorderedQuestions[i]];
  }

  // Renumber question ids q1..qN
  return reorderedQuestions.map((q, idx) => ({
    ...q,
    id: `q${idx + 1}`
  }));
}
