const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'src', 'lib', 'geminiClient.ts');
let code = fs.readFileSync(filePath, 'utf8');

// 1. Replace Phase3CheckResult and performPhase3Checks
const startStr = 'export interface Phase3CheckResult {';
const endStr = '/**\n       * Fixes letter spread';
const startIndex = code.indexOf(startStr);
const endIndex = code.indexOf(endStr);

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find slice markers!', { startIndex, endIndex });
  process.exit(1);
}

const newPhase3Block = `export interface QuestionRepairItem {
  question: RCQuestion;
  reason: string;
  category?: 'constraint' | 'crossOption' | 'lengthBias' | 'exactText' | 'reviewer';
}

export interface Phase3CheckResult {
  validQuestions: RCQuestion[];
  needsRepair: QuestionRepairItem[];
  perQuestionEvidence: { id: string; evidenceFound: boolean | null }[];
  diagnostics: string[];
}

export function performPhase3Checks(
  rawQuestions: any[],
  analysis: any,
  paragraphs: string[],
  examType: ExamType,
  plan?: QuestionPlan,
  isNewAiGeneration: boolean = false
): Phase3CheckResult {
  const isGmat = examType === 'GMAT';
  const expectedLetters = isGmat ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  const fullPassageText = paragraphs.join('\\n\\n');

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

  const validQuestions: RCQuestion[] = [];
  const needsRepair: QuestionRepairItem[] = [];
  const perQuestionEvidence: { id: string; evidenceFound: boolean | null }[] = [];
  const diagnostics: string[] = [];

  const contextWords = Array.isArray(analysis?.contextWords)
    ? analysis.contextWords.map((w: any) => String(w).trim()).filter(Boolean)
    : [];

  const list = Array.isArray(rawQuestions) ? rawQuestions : [];

  for (let idx = 0; idx < list.length; idx++) {
    const q = list[idx];
    const qId = q?.id ? String(q.id) : \`q\${idx + 1}\`;
    const label = \`Q\${idx + 1} (\${qId})\`;

    if (!q || typeof q !== 'object') {
      diagnostics.push(\`\${label}: Malformed object\`);
      continue;
    }

    // 1. Evidence Check (SOFT ONLY)
    // Never gates, never rejects. Recorded strictly for diagnostics & eval.
    const evidenceFound = checkEvidenceFound(q.evidence, fullPassageText);
    perQuestionEvidence.push({ id: qId, evidenceFound });

    // 2. Structural checks
    let stem = String(q.stem || '').trim();
    if (!stem) {
      diagnostics.push(\`\${label}: Empty stem\`);
      continue;
    }

    // Stem must not refer to paragraph numbers or ¶
    if (/¶|Paragraph\\s+\\d+|para\\s+\\d+/i.test(stem)) {
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
      diagnostics.push(\`\${label}: Prohibited paragraph number/symbol in stem\`);
      continue;
    }

    // Validate options count and structure
    const rawOpts = Array.isArray(q.options) ? q.options : [];
    if (rawOpts.length < expectedLetters.length) {
      diagnostics.push(\`\${label}: Only \${rawOpts.length} options provided (expected \${expectedLetters.length})\`);
      continue;
    }

    const options: RCOption[] = [];
    const seenOptTexts = new Set<string>();
    let optionFailed = false;

    // Forbidden cross-option reference regex
    const CROSS_OPTION_REGEX = /\\b(?:option|choice)\\s+[A-E]\\b|\\([A-E]\\)|\\b[A-E]\\s+and\\s+[A-E]\\b|\\bboth\\b|\\ball\\s+of\\s+the\\s+above\\b|\\bnone\\s+of\\s+the\\s+above\\b/i;

    for (let optIdx = 0; optIdx < expectedLetters.length; optIdx++) {
      const opt = rawOpts[optIdx];
      const letter = expectedLetters[optIdx] as 'A' | 'B' | 'C' | 'D' | 'E';
      const text = String(opt?.text || '').trim();
      const explanation = String(opt?.explanation || '').trim();
      const flawTag = opt?.flawTag ? String(opt.flawTag).toLowerCase().trim() : undefined;

      if (!text || !explanation) {
        diagnostics.push(\`\${label}: Option \${letter} has missing text or explanation\`);
        optionFailed = true;
        break;
      }

      // Check cross-option references in text or explanation
      if (CROSS_OPTION_REGEX.test(text) || CROSS_OPTION_REGEX.test(explanation)) {
        diagnostics.push(\`\${label}: Option \${letter} text or explanation contains forbidden cross-option reference\`);
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
        diagnostics.push(\`\${label}: Duplicate identical options found\`);
        optionFailed = true;
        break;
      }
      seenOptTexts.add(normOpt);

      options.push({ letter, text, explanation, flawTag });
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

    if (isNewAiGeneration) {
      if (!rawSubtypeId) {
        diagnostics.push(\`\${label}: Missing subtypeId for newly generated AI question\`);
        const slot = plan?.slots[idx];
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
            ? \`Question is missing subtypeId. Must be assigned subtype "\${slot.primary.id}" or one of backups "\${slot.backups[0].id}", "\${slot.backups[1].id}".\`
            : 'Question is missing subtypeId. Choose a valid subtype from catalog.',
          category: 'constraint'
        });
        continue;
      }

      if (!catalogItem) {
        diagnostics.push(\`\${label}: Unknown subtypeId "\${rawSubtypeId}"\`);
        const slot = plan?.slots[idx];
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
            ? \`Question has unknown subtypeId "\${rawSubtypeId}". Must be assigned subtype "\${slot.primary.id}" or one of backups "\${slot.backups[0].id}", "\${slot.backups[1].id}".\`
            : \`Question has unknown subtypeId "\${rawSubtypeId}". Choose a valid subtype from catalog.\`,
          category: 'constraint'
        });
        continue;
      }

      if (plan && plan.slots[idx]) {
        const slot = plan.slots[idx];
        const validSubtypeIds = [slot.primary.id, slot.backups[0].id, slot.backups[1].id];
        if (!validSubtypeIds.includes(rawSubtypeId)) {
          diagnostics.push(\`\${label}: Subtype "\${rawSubtypeId}" is neither assigned nor a backup\`);
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
            reason: \`Question must use assigned subtype "\${slot.primary.id}" or one of backups "\${slot.backups[0].id}", "\${slot.backups[1].id}".\`,
            category: 'constraint'
          });
          continue;
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
        diagnostics.push(\`\${label}: Duplicate subtype "\${subtype}"\`);
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
          reason: \`Duplicate subtype "\${subtype}". Choose a different archetype/subtype.\`,
          category: 'constraint'
        });
        continue;
      }
      seenSubtypes.add(normSub);
    }

    // Negative stem check (at most 1 for CAT, 2 for GMAT)
    const isNegativeStem = /\\b(?:except|cannot\\s+be\\s+inferred|least\\s+likely|not\\s+true|not\\s+supported|incorrect)\\b/i.test(
      stem
    );
    const maxNegAllowed = isGmat ? 2 : 1;
    if (isNegativeStem) {
      negativeStemCount++;
      if (negativeStemCount > maxNegAllowed) {
        diagnostics.push(\`\${label}: More than \${maxNegAllowed} negative stem question(s)\`);
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
          reason: \`At most \${maxNegAllowed} question(s) may use a negative stem (EXCEPT/cannot be inferred).\`,
          category: 'constraint'
        });
        continue;
      }
    }

    // Vocabulary question only if contextWords non-empty
    if (questionType === 'Vocabulary in Context' && contextWords.length === 0) {
      diagnostics.push(\`\${label}: Vocabulary in Context question generated with empty contextWords\`);
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
          textFailureReason = \`Target vocabulary phrase "\${quoted[0]}" does not appear in passage text.\`;
        }
      }
    }

    // B. Quoted text in stem (>= 4 chars) in passage
    if (!textCheckFailed) {
      const quotes = extractQuotedPhrases(stem);
      for (const quote of quotes) {
        if (quote.length >= 4 && !isSubstringLoose(quote, fullPassageText)) {
          textCheckFailed = true;
          textFailureReason = \`Quoted text in stem "\${quote}" does not appear in the passage.\`;
          break;
        }
      }
    }

    // C. Paragraph beginning quote matches actual start
    if (!textCheckFailed) {
      const paraRef = matchesParagraphBeginning(stem, paragraphs);
      if (paraRef.isParagraphRef && !paraRef.matched) {
        textCheckFailed = true;
        textFailureReason = \`Quoted paragraph beginning ("\${paraRef.phrase || 'phrase'}") does not match the start of any paragraph.\`;
      }
    }

    const candidateQuestion: RCQuestion = {
      id: qId,
      type: questionType,
      subtype,
      subtypeId: rawSubtypeId,
      stem,
      correctLetter,
      options
    };

    if (textCheckFailed) {
      diagnostics.push(\`\${label}: Exact-text check failed: \${textFailureReason}\`);
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
        diagnostics.push(\`\${label}: Correct option is longest in more than one question\`);
        needsRepair.push({
          question: candidateQuestion,
          reason: 'make the wrong options as long and as detailed as the correct one',
          category: 'lengthBias'
        });
        continue;
      }
    }

    validQuestions.push(candidateQuestion);
  }

  // Re-check constraints after substitutions
  if (plan && validQuestions.length >= (isGmat ? 4 : 3)) {
    const chosenCatalogItems: SubtypeCatalogItem[] = [];
    for (const vq of validQuestions) {
      const subId = vq.subtypeId || (vq.subtype ? QUESTION_CATALOG.find((c) => c.label.toLowerCase() === vq.subtype?.toLowerCase())?.id : undefined);
      const cat = subId ? SUBTYPE_BY_ID.get(subId) : undefined;
      if (cat) {
        chosenCatalogItems.push(cat);
      }
    }

    if (chosenCatalogItems.length === validQuestions.length) {
      const val = validateSubtypeList(chosenCatalogItems, examType, true);
      if (!val.valid) {
        const violatingQ = validQuestions.pop()!;
        diagnostics.push(\`Substitutions violated constraints: \${val.reason}\`);
        needsRepair.push({
          question: violatingQ,
          reason: \`Substitutions violated constraints: \${val.reason}. Please rewrite with an allowed backup.\`,
          category: 'constraint'
        });
      }
    }
  }

  // Fix letter spread (no letter correct in > 2 questions) using option shuffling
  fixLetterSpreadAndLongestOption(validQuestions, isGmat);

  return {
    validQuestions,
    needsRepair,
    perQuestionEvidence,
    diagnostics
  };
}

`;

code = code.slice(0, startIndex) + newPhase3Block + code.slice(endIndex);

// 2. Fix repairQuestionsWithGemini duplicate lines
code = code.replace(
  `          const rawList = res.parsedData?.questions || res.parsedData;\n          const checks = performPhase3Checks(rawList, {}, passage.split('\\n\\n'), examType);\n          const checks = performPhase3Checks(rawList, {}, passage.split('\\n\\n'), examType, plan);\n          return checks.validQuestions;`,
  `          const rawList = res.parsedData?.questions || res.parsedData;\n          const checks = performPhase3Checks(rawList, {}, passage.split('\\n\\n'), examType, plan, true);\n          return checks.validQuestions;`
);

// 3. Fix generateRcQuestions duplicate p3Result lines
code = code.replace(
  `          // Phase 3 Checks (evidence is soft, never rejects)\n          const p3Result = performPhase3Checks(rawQuestions, analysis, paragraphs, examType);\n          const p3Result = performPhase3Checks(rawQuestions, analysis, paragraphs, examType, plan);`,
  `          // Phase 3 Checks (evidence is soft, never rejects)\n          const p3Result = performPhase3Checks(rawQuestions, analysis, paragraphs, examType, plan, true);`
);

// 4. Fix duplicate signal in repair call
code = code.replace(
  `                signal\n          signal,\n                plan`,
  `                signal,\n                plan`
);

// 5. Add category: 'reviewer' to toRepair push in judgeQuestion
code = code.replace(
  `                    toRepair.push({\n                      question: q,\n                      reason: judge.failureReason || \`Reviewer chose \${rev.chosenLetter}: \${rev.note}\`\n                    });`,
  `                    toRepair.push({\n                      question: q,\n                      reason: judge.failureReason || \`Reviewer chose \${rev.chosenLetter}: \${rev.note}\`,\n                      category: 'reviewer'\n                    });`
);

fs.writeFileSync(filePath, code, 'utf8');
console.log('Successfully updated geminiClient.ts');
