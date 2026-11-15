# Admin Guide: Adding Reading Comprehension Passages & Questions

This directory contains all the static content for PracticeRC. You can add new RC passages, past CAT papers, guides, and speed tests by editing plain JSON files.

No coding is required. Follow the steps and copy-paste templates below.

---

## Files Overview

| File | What It Holds |
| :--- | :--- |
| **`library.json`** | Curated practice passages that appear on the **Library** page. |
| **`pyq.json`** | The past-year CAT paper catalog (organized by Year and Slot). |
| **`guides.json`** | Strategy and theory articles on the **Guides** page. |
| **`speed-passages.json`** | Timed reading passages for the **Tools (Speed Test)** page. |

---

## 1. How to Add a Curated Test to `library.json`

Open `src/data/library.json`. Add a new block inside the array `[...]` separated by a comma.

### Copy-Paste Template for `library.json`

```json
{
  "id": "unique-kebab-case-title",
  "title": "Passage Title Here",
  "topic": "Philosophy",
  "category": "library",
  "source_label": "Aeon Magazine",
  "exam_type": "CAT",
  "difficulty": "Challenging",
  "target_seconds": 480,
  "passage_paragraphs": [
    "First paragraph text goes here. Keep it wrapped in double quotes.",
    "Second paragraph text goes here.",
    "Third paragraph text goes here."
  ],
  "questions": [
    {
      "id": "q1",
      "type": "Main Idea",
      "stem": "Which of the following best expresses the primary purpose of the passage?",
      "correctLetter": "B",
      "options": [
        {
          "letter": "A",
          "text": "First option text.",
          "explanation": "Why option A is incorrect."
        },
        {
          "letter": "B",
          "text": "Second option text (the correct answer).",
          "explanation": "Why option B is correct according to the passage."
        },
        {
          "letter": "C",
          "text": "Third option text.",
          "explanation": "Why option C is incorrect."
        },
        {
          "letter": "D",
          "text": "Fourth option text.",
          "explanation": "Why option D is incorrect."
        }
      ]
    }
  ]
}
```

---

## 2. How to Add Real Content to a Past Paper in `pyq.json`

Open `src/data/pyq.json`. Find the slot you want to add (e.g. `cat-2024-slot-1-p1`).

Replace the empty `passage_paragraphs: []` and `questions: []` with the actual passage paragraphs and question items:

```json
{
  "id": "cat-2024-slot-1-p1",
  "year": 2024,
  "slot": 1,
  "passage_num": 1,
  "title": "CAT 2024 Slot 1 Passage 1: Indian Classical Aesthetic Theory",
  "topic": "Literature & Aesthetics",
  "category": "pyq",
  "source_label": "CAT 2024 Slot 1",
  "exam_type": "CAT",
  "difficulty": "Challenging",
  "target_seconds": 480,
  "passage_paragraphs": [
    "Paste paragraph 1 here...",
    "Paste paragraph 2 here..."
  ],
  "questions": [
    {
      "id": "q1",
      "type": "Main Idea",
      "stem": "The author's primary objective in the passage is to:",
      "correctLetter": "A",
      "options": [
        {
          "letter": "A",
          "text": "Correct answer description.",
          "explanation": "Why A is supported by paragraph 1."
        },
        {
          "letter": "B",
          "text": "Wrong answer description.",
          "explanation": "Why B is a distortion."
        },
        {
          "letter": "C",
          "text": "Wrong answer description.",
          "explanation": "Why C is too extreme."
        },
        {
          "letter": "D",
          "text": "Wrong answer description.",
          "explanation": "Why D is out of scope."
        }
      ]
    }
  ]
}
```

> **Note on Live Behavior**: As soon as `passage_paragraphs` and `questions` are non-empty, the passage instantly becomes clickable on the PYQ page and opens straight in the exam player without any AI or algorithmic generation.

---

## Rules Checked by `npm run check:data`

Before building, the project automatically runs validation on all 4 files. Ensure:

1. **Unique IDs**: Every passage must have a unique `id`. Do not start custom IDs with `u-` (reserved for user-generated tests).
2. **Questions per Passage**: Between 3 and 6 questions per test.
3. **Question Archetypes**:
   `type` must be one of the seven supported archetypes:
   - `Main Idea`
   - `Inference`
   - `Paragraph Function`
   - `Tone & Attitude`
   - `Strengthen / Weaken`
   - `Detail & Logic`
   - `Vocabulary in Context`
4. **Optional Subtype**:
   `subtype` (optional string) specifies the exact question flavor, for example:
   - *Title*, *Central idea*, *Primary purpose* (Main Idea)
   - *Cannot be inferred (EXCEPT)*, *Author would agree*, *Application* (Inference)
   - *According to the passage* (Detail & Logic)
   - *Role of an example*, *Role of a paragraph* (Paragraph Function)
   - *Attitude*, *Tone*, *Stance* (Tone & Attitude)
   - *Assumption*, *Strengthen*, *Weaken* (Strengthen / Weaken)
   - *Meaning of a word or phrase in context* (Vocabulary in Context)
4. **Catalog Subtypes**:
   Set `subtype` (or `subtypeId`) from the standard PracticeRC Question Catalog:
   - **Main Idea**: `central_idea` (*Central idea*), `title` (*Suitable title*), `primary_purpose` (*Primary purpose*)
   - **Inference**: `can_be_inferred` (*Can be inferred*), `cannot_be_inferred` (*Cannot be reasonably inferred (EXCEPT)*), `author_agrees` (*Author would most likely agree with*), `author_least_agrees` (*Author would least likely agree with*), `application` (*Application to a new situation*)
   - **Detail & Logic**: `according_to` (*According to the passage*), `not_according_to` (*Not true according to the passage*)
   - **Tone & Attitude**: `attitude` (*Author's attitude or tone*)
   - **Paragraph Function**: `para_function` (*Role of a paragraph*), `example_role` (*Role of an example or quoted view*), `structure` (*Organisation of the passage*)
   - **Vocabulary in Context**: `word_meaning` (*Contextual meaning of a word*), `phrase_meaning` (*Meaning or use of a phrase in context*)
   - **Strengthen / Weaken**: `assumption` (*Assumption of the argument*), `strengthen` (*Strengthen the argument*), `weaken` (*Weaken the argument*)
5. **Option Letters**:
   - For `CAT`: Exactly 4 options, strictly lettered `A`, `B`, `C`, `D`.
   - For `GMAT`: Exactly 5 options, strictly lettered `A`, `B`, `C`, `D`, `E`.
6. **Valid Key**: `correctLetter` must be one of the option letters (`A`, `B`, `C`, or `D` for CAT; up to `E` for GMAT).
7. **Flaw Tags (`flawTag`)**:
   Options may specify an optional `flawTag` indicating why a distractor is incorrect:
   - `extreme`
   - `opposite`
   - `scope`
   - `distortion`
   - `causal`
   - `comparison`
   - `irrelevant`
8. **No Paragraph Markers in Questions**: Do NOT include `"¶"` or `"Paragraph 2"` in question stems or options. Refer to paragraphs by quotation instead (e.g., *the paragraph that begins "Discussions of..."*).
9. **No Blank Fields**: All stems, option texts, and explanations must contain text.

---

## Authoring Best Practices: Test Unpredictability & Advisory Warnings

To ensure tests cannot be gamed and provide a realistic exam experience:

1. **Vary Question Archetypes**:
   Do not assign the same question types in the same order across tests (e.g. avoid always starting with Main Idea followed by Inference). Use at least 3 distinct archetypes per passage.
2. **Balance Correct Option Keys**:
   Spread the correct answers across `A`, `B`, `C`, `D` (and `E`). Avoid concentrating correct answers on a single letter (no letter should be key for > 50% of questions). Never use the predictable sequence `B, C, A, D`.

### Non-Failing Advisory Warnings in `check:data`
When you run `npm run check:data`, the validator scans all authored tests and flags advisory warnings:
- **Identical Key Sequences**: Warns if two tests share the exact same sequence of correct answer letters.
- **Single-Letter Dominance**: Warns if more than 50% of a test's questions share the same correct key.
- **Identical Type Sequences**: Warns if two tests have the exact same sequence of question archetypes.
- **Monotype Tests**: Warns if all questions in a test share the exact same archetype.
- **Legacy Fixed Sequence**: Warns if a test uses the legacy fixed sequence `B, C, A, D`.

These warnings are advisory and non-failing, but authors should heed them to maintain high editorial standards.

---

## 3. Tuning Question Planner Catalog Weights (`SUBTYPE_WEIGHTS`)

The dynamic question planner generates unpredictable, balanced question plans tailored to each exam. Subtype selection probabilities are governed by the `SUBTYPE_WEIGHTS` configuration located at the top of `src/lib/questionPlan.ts`.

### Changing the Weights
Open `src/lib/questionPlan.ts`. Edit the `SUBTYPE_WEIGHTS` constant:

```typescript
export const SUBTYPE_WEIGHTS: Record<string, { CAT: number; GMAT: number }> = {
  // Main Idea
  central_idea: { CAT: 3, GMAT: 3 },
  title: { CAT: 1, GMAT: 1 },
  primary_purpose: { CAT: 3, GMAT: 3 },

  // Inference
  can_be_inferred: { CAT: 4, GMAT: 4 },
  cannot_be_inferred: { CAT: 2, GMAT: 2 },
  author_agrees: { CAT: 2, GMAT: 2 },
  author_least_agrees: { CAT: 1, GMAT: 1 },
  application: { CAT: 1, GMAT: 1 },

  // Detail & Logic
  according_to: { CAT: 3, GMAT: 2 },
  not_according_to: { CAT: 1, GMAT: 1 },

  // Tone & Attitude
  attitude: { CAT: 2, GMAT: 2 },

  // Paragraph Function
  para_function: { CAT: 2, GMAT: 2 },
  example_role: { CAT: 2, GMAT: 2 },
  structure: { CAT: 1, GMAT: 1 },

  // Vocabulary in Context (calibrated to ~20-25% of CAT plans)
  word_meaning: { CAT: 0.7, GMAT: 1 },
  phrase_meaning: { CAT: 0.7, GMAT: 1 },

  // Strengthen / Weaken (calibrated to ~10-15% of CAT plans; GMAT always has exactly 1 slot)
  assumption: { CAT: 0.4, GMAT: 2 },
  strengthen: { CAT: 0.4, GMAT: 2 },
  weaken: { CAT: 0.4, GMAT: 2 }
};
```

### Verifying Weight Adjustments
After modifying weights, run the statistical simulation:
```bash
npm run plan:stats
```
This tests 10,000 simulated draws for both CAT and GMAT and outputs the percentage of generated sets containing each question archetype.

---

## 4. Rule-Based Fallback Generator: Capabilities & Limitations

The rule-based generator (`src/lib/ruleGenerator.ts`) provides instantaneous test generation when no API keys are available or when the network/AI services are unreachable.

### What It Does
- Produces valid, playable 4-question CAT sets and 5-question GMAT sets with zero API dependencies.
- Employs at least 3 generic stem variants per type without awkward single-word insertions.
- Shuffles questions and options using cryptographic randomness (`cryptoRng`) so correct keys and question positions vary uniformly across runs.

### What It Still CANNOT Do
1. **Cannot write passage-specific deep semantic distractors**: Distractors are assembled using syntactic templates and n-gram lexical terms rather than true semantic understanding of the author's logic.
2. **Cannot dynamically adapt question archetypes**: It always emits the fixed sequence of archetypes (Main Idea, Inference, Paragraph Function, Tone & Attitude, plus Strengthen/Weaken for GMAT), rather than dynamically selecting varied subtypes from the 16-subtype catalog.
3. **Cannot reason about figurative nuance or counterfactuals**: It cannot evaluate metaphors, irony, tone nuances, or intricate causal arguments.
4. **Cannot perform self-review or cross-verification**: It does not execute a blind reviewer pass (Gemini/Groq) to independently solve and verify that distractors are unambiguously flawed and the key is defensible.

---

## 5. Author Guidance: Question-Set Theme & Cognitive Balance

When authoring curated sets in `library.json` or past papers in `pyq.json`, follow these standards to simulate real CAT VARC / GMAT Focus examination sets:

### 1. Different Mental Operations per Set
Avoid writing four questions that test the same mental operation. Balance questions across the 5 cognitive operations:
- **Locate**: retrieving explicit facts (`according_to`, `word_meaning`, `phrase_meaning`). Cap locate questions at $\le 1$ for CAT ($\le 2$ for GMAT).
- **Interpret**: explaining paragraph roles or contextual rhetorical functions (`para_function`, `example_role`, `structure`).
- **Infer**: reading between the lines to deduce unstated implications (`can_be_inferred`, `author_agrees`, `application`).
- **Synthesize**: grasping overarching themes and unifying claims across the passage (`primary_purpose`, `central_idea`).
- **Evaluate**: analyzing logical validity, assumptions, and arguments (`assumption`, `strengthen`, `weaken`).
Ensure every set features at least 3 distinct operations.

### 2. Multi-Paragraph Question Requirement
At least one question in every set must require combining, comparing, or tracing ideas across at least two different paragraphs. Do not allow all questions to be answerable by zooming into isolated single sentences.

### 3. Subtle-Implication Question
When the passage supports deeper depth, at least one question should probe subtle implications, unstated premises, nuanced authorial stance, or the tension between opposing viewpoints.

### 4. Direct-Paraphrase Limit
No more than 1 question (CAT) or 2 questions (GMAT) should be solvable through direct literal paraphrasing of a single sentence. Remaining questions must demand inference, structural analysis, or conceptual synthesis.

### 5. Plausible Distractors
Distractors must represent attractive interpretations that a hasty or careless reader might easily pick:
- Wrong options must reuse authentic ideas, terminology, and phrasing from the text.
- Never write absurd, comical, or obviously off-topic distractors that can be discarded without reading the passage.
- Ensure the correct option is not consistently the longest or most detailed choice in the set.


