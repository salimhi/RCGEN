import {
  planQuestions,
  shuffleQuestionsAndOptions,
  QUESTION_CATALOG,
  SUBTYPE_BY_ID,
  DEEP_SUBTYPES,
  MAX_LOCATE_SLOTS,
  MIN_DISTINCT_OPERATIONS,
  cryptoRng
} from '../src/lib/questionPlan.ts';

function runPlanSimulation(examType, totalRuns = 10000) {
  const isGmat = examType === 'GMAT';
  const numQuestions = isGmat ? 5 : 4;
  const letters = isGmat ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];
  const maxLocateAllowed = isGmat ? MAX_LOCATE_SLOTS.GMAT : MAX_LOCATE_SLOTS.CAT;

  const subtypeCounts = {};
  const archetypeCounts = {};
  const archetypePlanCounts = {};
  for (const c of QUESTION_CATALOG) {
    subtypeCounts[c.id] = 0;
    archetypeCounts[c.archetype] = 0;
    archetypePlanCounts[c.archetype] = 0;
  }

  const operations = ['locate', 'interpret', 'infer', 'synthesize', 'evaluate'];
  const operationTotalSlots = {};
  const operationPlanCounts = {};
  for (const op of operations) {
    operationTotalSlots[op] = 0;
    operationPlanCounts[op] = 0;
  }

  const distinctOpsDistribution = {};
  const multiParagraphSlotDistribution = Array(numQuestions).fill(0);

  let locateCapPassCount = 0;
  let minDistinctOpsPassCount = 0;
  let deepSlotPassCount = 0;
  let exactlyOneMultiParaPassCount = 0;
  let forcedPlanCount = 0;

  let globalQuestionRuns = 0;
  const globalPositionCounts = Array(numQuestions).fill(0);
  const correctLetterByPosition = Array.from({ length: numQuestions }, () => {
    const obj = {};
    for (const l of letters) obj[l] = 0;
    return obj;
  });

  let consecutiveRepeatCount = 0;
  let previousSignature = null;

  for (let run = 0; run < totalRuns; run++) {
    const plan = planQuestions(examType, 'Challenging', cryptoRng);

    if (plan.forced) {
      forcedPlanCount++;
    }

    // Consecutive repetition check
    if (previousSignature !== null && plan.signature === previousSignature) {
      consecutiveRepeatCount++;
    }
    previousSignature = plan.signature;

    // Track operations and constraints
    let locateCount = 0;
    let deepCount = 0;
    let multiParaCount = 0;
    const opsInThisPlan = new Set();
    const archetypesInThisPlan = new Set();
    let hasGlobal = false;

    plan.slots.forEach((slot, sIdx) => {
      subtypeCounts[slot.primary.id] = (subtypeCounts[slot.primary.id] || 0) + 1;
      archetypeCounts[slot.primary.archetype] = (archetypeCounts[slot.primary.archetype] || 0) + 1;
      archetypesInThisPlan.add(slot.primary.archetype);

      const op = slot.operation;
      operationTotalSlots[op] = (operationTotalSlots[op] || 0) + 1;
      opsInThisPlan.add(op);
      if (op === 'locate') locateCount++;

      if (slot.deep || DEEP_SUBTYPES.has(slot.primary.id)) deepCount++;
      if (slot.multiParagraph) {
        multiParaCount++;
        multiParagraphSlotDistribution[sIdx]++;
      }

      if (slot.primary.flags.global) {
        hasGlobal = true;
      }
    });

    if (hasGlobal) globalQuestionRuns++;
    for (const arch of archetypesInThisPlan) {
      archetypePlanCounts[arch] = (archetypePlanCounts[arch] || 0) + 1;
    }
    for (const op of opsInThisPlan) {
      operationPlanCounts[op] = (operationPlanCounts[op] || 0) + 1;
    }

    const distinctCount = opsInThisPlan.size;
    distinctOpsDistribution[distinctCount] = (distinctOpsDistribution[distinctCount] || 0) + 1;

    if (locateCount <= maxLocateAllowed) locateCapPassCount++;
    if (distinctCount >= MIN_DISTINCT_OPERATIONS) minDistinctOpsPassCount++;
    if (deepCount >= 1) deepSlotPassCount++;
    if (multiParaCount === 1) exactlyOneMultiParaPassCount++;

    // Create mock questions to test shuffling
    const mockQuestions = plan.slots.map((slot, idx) => {
      const isCorrectKey = letters[idx % letters.length];
      const opts = letters.map((l) => ({
        letter: l,
        text: `Option ${l} for ${slot.primary.label}`,
        explanation: `Explanation for ${l}`
      }));
      return {
        id: `q${idx + 1}`,
        type: slot.primary.archetype,
        subtype: slot.primary.label,
        stem: slot.primary.stemHint,
        correctLetter: isCorrectKey,
        options: opts,
        isGlobal: !!slot.primary.flags.global
      };
    });

    const shuffled = shuffleQuestionsAndOptions(mockQuestions, isGmat, cryptoRng);

    for (let pos = 0; pos < shuffled.length; pos++) {
      const q = shuffled[pos];
      correctLetterByPosition[pos][q.correctLetter]++;
      if (q.isGlobal) {
        globalPositionCounts[pos]++;
      }
    }
  }

  return {
    examType,
    totalRuns,
    subtypeCounts,
    archetypeCounts,
    archetypePlanCounts,
    operationTotalSlots,
    operationPlanCounts,
    distinctOpsDistribution,
    multiParagraphSlotDistribution,
    locateCapPassCount,
    minDistinctOpsPassCount,
    deepSlotPassCount,
    exactlyOneMultiParaPassCount,
    forcedPlanCount,
    globalQuestionRuns,
    globalPositionCounts,
    correctLetterByPosition,
    consecutiveRepeatCount
  };
}

function printStats(stats) {
  const {
    examType,
    totalRuns,
    subtypeCounts,
    archetypeCounts,
    archetypePlanCounts,
    operationTotalSlots,
    operationPlanCounts,
    distinctOpsDistribution,
    multiParagraphSlotDistribution,
    locateCapPassCount,
    minDistinctOpsPassCount,
    deepSlotPassCount,
    exactlyOneMultiParaPassCount,
    forcedPlanCount,
    globalQuestionRuns,
    globalPositionCounts,
    correctLetterByPosition,
    consecutiveRepeatCount
  } = stats;

  const pct = (val, denom = totalRuns) => ((val / denom) * 100).toFixed(2) + '%';

  console.log(`\n======================================================`);
  console.log(`PLANNER STATS SIMULATION: ${examType} (${totalRuns.toLocaleString()} runs)`);
  console.log(`======================================================`);

  console.log(`\n1. CONSTRAINT VERIFICATION (Target: 100% compliance):`);
  console.log(`   - Distinct operations >= 3:              ${locateCapPassCount} / ${totalRuns} (${pct(minDistinctOpsPassCount)})`);
  console.log(`   - Locate questions <= cap:               ${locateCapPassCount} / ${totalRuns} (${pct(locateCapPassCount)})`);
  console.log(`   - Deep reasoning slots >= 1:             ${deepSlotPassCount} / ${totalRuns} (${pct(deepSlotPassCount)})`);
  console.log(`   - Exactly 1 [MULTI-PARAGRAPH] slot:      ${exactlyOneMultiParaPassCount} / ${totalRuns} (${pct(exactlyOneMultiParaPassCount)})`);
  console.log(`   - Forced fallback plans:                 ${forcedPlanCount} / ${totalRuns} (${pct(forcedPlanCount)})`);

  console.log(`\n2. COGNITIVE OPERATIONS DISTRIBUTION:`);
  for (const [op, count] of Object.entries(operationPlanCounts)) {
    const totalSlots = operationTotalSlots[op] || 0;
    console.log(`   - ${op.padEnd(14)}: ${pct(count).padStart(7)} of plans (${count.toString().padStart(5)} / ${totalRuns}) | Total primary slots: ${totalSlots.toString().padStart(5)}`);
  }

  console.log(`\n3. DISTINCT OPERATIONS PER PLAN DISTRIBUTION:`);
  for (const [distinctCount, count] of Object.entries(distinctOpsDistribution).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`   - ${distinctCount} distinct operations: ${count.toString().padStart(5)} plans (${pct(count)})`);
  }

  console.log(`\n4. MULTI-PARAGRAPH TAG SLOT DISTRIBUTION:`);
  for (let s = 0; s < multiParagraphSlotDistribution.length; s++) {
    const count = multiParagraphSlotDistribution[s];
    console.log(`   - Slot ${s + 1}: ${count.toString().padStart(5)} (${pct(count)})`);
  }

  console.log(`\n5. ARCHETYPE OCCURRENCE ACROSS PLANS:`);
  const sortedArchetypes = Object.entries(archetypePlanCounts).sort((a, b) => b[1] - a[1]);
  for (const [arch, count] of sortedArchetypes) {
    const totalSlots = archetypeCounts[arch] || 0;
    console.log(`   - ${arch.padEnd(25)}: ${pct(count).padStart(7)} of plans (${count.toString().padStart(5)} / ${totalRuns}) | Total primary slots: ${totalSlots.toString().padStart(5)}`);
  }

  console.log(`\n6. SUBTYPE FREQUENCIES (times drawn as primary):`);
  const sortedSubtypes = Object.entries(subtypeCounts).sort((a, b) => b[1] - a[1]);
  for (const [id, count] of sortedSubtypes) {
    const item = SUBTYPE_BY_ID.get(id);
    console.log(`   - ${id.padEnd(22)} [${item?.archetype.padEnd(22)} / ${item?.operation.padEnd(10)}]: ${count.toString().padStart(6)} (${pct(count)})`);
  }

  console.log(`\n7. GLOBAL QUESTION OCCURRENCE & POSITION:`);
  console.log(`   - Plans containing a global question: ${globalQuestionRuns} / ${totalRuns} (${pct(globalQuestionRuns)})`);
  for (let i = 0; i < globalPositionCounts.length; i++) {
    const count = globalPositionCounts[i];
    console.log(`   - Question ${i + 1}: ${count.toString().padStart(6)} (${pct(count, globalQuestionRuns || 1)} of global questions)`);
  }

  console.log(`\n8. CORRECT LETTER DISTRIBUTION BY POSITION (after shuffling):`);
  for (let pos = 0; pos < correctLetterByPosition.length; pos++) {
    const row = correctLetterByPosition[pos];
    const lettersStr = Object.entries(row)
      .map(([l, cnt]) => `${l}: ${pct(cnt)}`)
      .join(' | ');
    console.log(`   - Position ${pos + 1}: [ ${lettersStr} ]`);
  }

  console.log(`\n9. CONSECUTIVE ORDERED ARCHETYPE REPETITIONS:`);
  console.log(`   - Consecutive identical archetype sequence: ${consecutiveRepeatCount} / ${totalRuns} (${pct(consecutiveRepeatCount)})\n`);
}

console.log('Running 10,000 simulations for CAT...');
const catStats = runPlanSimulation('CAT', 10000);
printStats(catStats);

console.log('Running 10,000 simulations for GMAT...');
const gmatStats = runPlanSimulation('GMAT', 10000);
printStats(gmatStats);
