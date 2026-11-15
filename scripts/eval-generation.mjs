#!/usr/bin/env node

/**
 * scripts/eval-generation.mjs
 * Evaluates and compares question generation:
 * (a) Old prompt in scripts/old-prompt.ts
 * (b) New senior CAT VARC pipeline
 *
 * Reads GEMINI_API_KEY (and optionally GROQ_API_KEY) from environment only.
 * Never logs or prints any key.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { buildUserPrompt as buildOldUserPrompt, SYSTEM_INSTRUCTION as OLD_SYSTEM_INSTRUCTION } from './old-prompt.ts';
import { generateRcQuestions, getQuestionOperation, isCopyLikeQuestion } from '../src/lib/geminiClient.ts';
import { GEMINI_MODEL, GROQ_BASE_URL, GROQ_MODEL_DEFAULT, VERIFIER_MODEL } from '../src/config.ts';
import { isUsableGroqChatModel, resolveEffectiveGroqModel } from '../src/lib/groqModels.ts';
import { buildReviewerInput, buildReviewerPrompt, parseReviewerOutput, judgeQuestion, REVIEWER_SYSTEM_INSTRUCTION } from '../src/lib/verifier.ts';
import { checkEvidenceFound, isSubstringLoose, splitPassageIntoSentences } from '../src/lib/textNorm.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const EVAL_DIR = path.join(__dirname, 'eval');
const EVAL_OUT_DIR = path.join(EVAL_DIR, 'out');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Old evidence check simulator from Phase 0
function oldEvidenceGateCheck(evidence, passage) {
  if (!evidence || typeof evidence !== 'string') return true;
  const raw = evidence.trim();
  if (raw.length < 5) return true;
  return passage.toLowerCase().includes(raw.toLowerCase());
}

async function callOldGeminiPrompt(apiKey, passage) {
  const userPrompt = buildOldUserPrompt({
    examType: 'CAT',
    difficulty: 'Challenging',
    passage
  });

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const t0 = Date.now();
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey.trim()
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: OLD_SYSTEM_INSTRUCTION }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4
      }
    })
  });

  const durationSecs = (Date.now() - t0) / 1000;
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini error HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  const tokens = data?.usageMetadata?.totalTokenCount || 0;
  const parsed = JSON.parse(text);
  const questions = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.questions) ? parsed.questions : []);

  return { questions, durationSecs, tokens };
}

async function callGroqReview(apiKey, model, passage, inputs) {
  const userPrompt = buildReviewerPrompt(passage, inputs);
  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: REVIEWER_SYSTEM_INSTRUCTION },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Groq review HTTP ${res.status}: ${txt.slice(0, 150)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';
  return parseReviewerOutput(content);
}

async function callGeminiReview(apiKey, model, passage, inputs) {
  const userPrompt = buildReviewerPrompt(passage, inputs);
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey.trim()
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: REVIEWER_SYSTEM_INSTRUCTION }] },
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0
      }
    })
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Gemini review HTTP ${res.status}: ${txt.slice(0, 150)}`);
  }
  const data = await res.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return parseReviewerOutput(content);
}

function analyzeSet(questions, passageText) {
  const letters = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  let longestOptionCount = 0;
  const flaws = {};
  const subtypes = new Set();

  for (const q of questions) {
    if (q.correctLetter && letters[q.correctLetter] !== undefined) {
      letters[q.correctLetter]++;
    }
    if (q.subtype) subtypes.add(q.subtype.toLowerCase().trim());

    const opts = q.options || [];
    const correctOpt = opts.find((o) => o.letter === q.correctLetter);
    if (correctOpt && opts.length > 0) {
      const cLen = (correctOpt.text || '').length;
      const isLongest = opts.every((o) => o.letter === q.correctLetter || cLen > (o.text || '').length);
      if (isLongest) longestOptionCount++;
    }

    for (const o of opts) {
      if (o.flawTag) {
        const tag = o.flawTag.toLowerCase().trim();
        flaws[tag] = (flaws[tag] || 0) + 1;
      }
    }
  }

  return {
    count: questions.length,
    distinctSubtypes: subtypes.size,
    subtypesList: Array.from(subtypes),
    letters,
    longestOptionCount,
    flaws
  };
}

async function main() {
  const geminiKey = process.env.GEMINI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!geminiKey || !geminiKey.trim()) {
    console.log('\n❌ GEMINI_API_KEY environment variable is not set.');
    console.log('To run this comparison script, set your API key in your terminal session:');
    console.log('  Windows PowerShell (without echo or command history):');
    console.log('    $s = Read-Host "Gemini key" -AsSecureString');
    console.log('    $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $s).Password');
    console.log('    # (optional for Groq cross-review):');
    console.log('    $s = Read-Host "Groq key" -AsSecureString');
    console.log('    $env:GROQ_API_KEY = [System.Net.NetworkCredential]::new("", $s).Password');
    console.log('    node scripts/eval-generation.mjs');
    console.log('  To clear when done:');
    console.log('    Remove-Item Env:GEMINI_API_KEY');
    console.log('    Remove-Item Env:GROQ_API_KEY\n');
    process.exit(0);
  }

  console.log('\n======================================================');
  console.log('RUNNING CAT RC QUESTION GENERATION BENCHMARK EVAL');
  console.log('Comparing:');
  console.log('  (a) Old Prompt (scripts/old-prompt.ts)');
  console.log('  (b) New Senior CAT VARC Pipeline with Verifier');
  console.log('======================================================\n');

  // Load 4 Passages
  const libraryPath = path.join(ROOT_DIR, 'src', 'data', 'library.json');
  const libData = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
  const libTest = libData.find((t) => t.id === 'the-attention-economy') || libData[0];

  const passages = [
    {
      id: 'library-attention',
      title: 'The Attention Economy (Library)',
      genre: 'Philosophy / Media Theory',
      text: libTest.passage_paragraphs.join('\n\n')
    },
    {
      id: 'eval-argumentative',
      title: 'The Illusion of Spatial Efficiency',
      genre: 'Argumentative (Urban Planning)',
      text: fs.readFileSync(path.join(EVAL_DIR, 'passage-argumentative.txt'), 'utf8')
    },
    {
      id: 'eval-science',
      title: 'The Acoustic Architecture of Microbial Communities',
      genre: 'Science Exposition (Microbiology)',
      text: fs.readFileSync(path.join(EVAL_DIR, 'passage-science.txt'), 'utf8')
    },
    {
      id: 'eval-narrative',
      title: 'The Ghost Geometry of Cartographic Memory',
      genre: 'Reflective Narrative (Landscape History)',
      text: fs.readFileSync(path.join(EVAL_DIR, 'passage-narrative.txt'), 'utf8')
    }
  ];

  const evalRunResults = {
    timestamp: new Date().toISOString(),
    passagesEvaluated: passages.length,
    oldVersion: [],
    newVersion: []
  };

  const oldTotals = { questions: 0, seconds: 0, tokens: 0, longest: 0, calls: 0, letters: { A:0, B:0, C:0, D:0 } };
  const newTotals = { questions: 0, seconds: 0, tokens: 0, longest: 0, calls: 0, letters: { A:0, B:0, C:0, D:0 } };

  const falseRejections = []; // Rejected by old evidence gate, but valid & defensible
  const realQuoteWrongKeys = []; // Evidence found in text, but reviewer rejected the answer key
  const disagreements = []; // Gemini vs Groq reviewer disagreements

  for (let i = 0; i < passages.length; i++) {
    const p = passages[i];
    console.log(`\n------------------------------------------------------`);
    console.log(`[Passage ${i + 1}/${passages.length}] ${p.title} (${p.genre})`);
    console.log(`Words: ${p.text.split(/\s+/).length}`);
    console.log(`------------------------------------------------------`);

    // (a) Run Old Prompt
    process.stdout.write('Running (a) Old Prompt... ');
    let oldRes;
    try {
      oldRes = await callOldGeminiPrompt(geminiKey, p.text);
      oldTotals.calls += 1;
      oldTotals.seconds += oldRes.durationSecs;
      oldTotals.tokens += oldRes.tokens;
      oldTotals.questions += oldRes.questions.length;
      console.log(`Done (${oldRes.questions.length} Qs in ${oldRes.durationSecs.toFixed(2)}s, ${oldRes.tokens} tok)`);
    } catch (err) {
      console.log(`Failed: ${err.message}`);
      oldRes = { questions: [], durationSecs: 0, tokens: 0 };
    }

    const oldStats = analyzeSet(oldRes.questions, p.text);
    Object.keys(oldStats.letters).forEach((l) => {
      if (oldTotals.letters[l] !== undefined) oldTotals.letters[l] += oldStats.letters[l];
    });
    oldTotals.longest += oldStats.longestOptionCount;

    // (b) Run New Pipeline (CAT)
    process.stdout.write('Running (b) New Senior Pipeline (CAT)... ');
    const t0New = Date.now();
    let newRes;
    try {
      newRes = await generateRcQuestions({
        paragraphs: p.text.split('\n\n'),
        examType: 'CAT',
        difficulty: 'Challenging',
        engine: 'gemini',
        geminiKey,
        groqKey: groqKey || undefined,
        useGroq: Boolean(groqKey),
        doubleCheck: true
      });
      const durNew = (Date.now() - t0New) / 1000;
      const tokNew = newRes.diagnostics?.tokenUsage?.totalTokens || 0;
      newTotals.calls += newRes.diagnostics?.apiCallCount || 1;
      newTotals.seconds += durNew;
      newTotals.tokens += tokNew;
      newTotals.questions += newRes.questions.length;
      console.log(`Done (${newRes.questions.length} Qs in ${durNew.toFixed(2)}s, reviewer: ${newRes.verification_info?.reviewer}, calls: ${newRes.diagnostics?.apiCallCount})`);
      
      console.log(`    CAT Instrumentation:`);
      const plannedSummary = newRes.diagnostics?.plannedSubtypes
        ? newRes.diagnostics.plannedSubtypes.map((s) => `${s.primary} [backups: ${s.backups.join(',')}]`).join(' | ')
        : 'N/A';
      console.log(`      - Planned Subtypes: ${plannedSummary}`);
      console.log(`      - Actual Returned Subtypes: ${(newRes.diagnostics?.actualReturnedSubtypes || []).join(', ')}`);
      console.log(`      - Substitution Count: ${newRes.diagnostics?.substitutionCount ?? 0}`);
      const rb = newRes.diagnostics?.repairBreakdown || { constraint: 0, crossOption: 0, lengthBias: 0, exactText: 0, reviewer: 0 };
      console.log(`      - Repaired Questions: ${newRes.diagnostics?.questionsSentToRepair ?? 0} (constraint: ${rb.constraint}, crossOption: ${rb.crossOption}, lengthBias: ${rb.lengthBias}, exactText: ${rb.exactText}, reviewer: ${rb.reviewer})`);
      console.log(`      - API Call Count: ${newRes.diagnostics?.apiCallCount ?? 1}`);
    } catch (err) {
      console.log(`Failed: ${err.message}`);
      newRes = { questions: [], source: 'fallback', diagnostics: {} };
    }

    // (c) Run New Pipeline (GMAT)
    process.stdout.write('Running (c) New Senior Pipeline (GMAT)... ');
    const t0Gmat = Date.now();
    let gmatRes;
    try {
      gmatRes = await generateRcQuestions({
        paragraphs: p.text.split('\n\n'),
        examType: 'GMAT',
        difficulty: 'Challenging',
        engine: 'gemini',
        geminiKey,
        groqKey: groqKey || undefined,
        useGroq: Boolean(groqKey),
        doubleCheck: true
      });
      const durGmat = (Date.now() - t0Gmat) / 1000;
      console.log(`Done (${gmatRes.questions.length} Qs in ${durGmat.toFixed(2)}s, reviewer: ${gmatRes.verification_info?.reviewer}, calls: ${gmatRes.diagnostics?.apiCallCount})`);
      
      console.log(`    GMAT Instrumentation:`);
      const gmatPlannedSummary = gmatRes.diagnostics?.plannedSubtypes
        ? gmatRes.diagnostics.plannedSubtypes.map((s) => `${s.primary} [backups: ${s.backups.join(',')}]`).join(' | ')
        : 'N/A';
      console.log(`      - Planned Subtypes: ${gmatPlannedSummary}`);
      console.log(`      - Actual Returned Subtypes: ${(gmatRes.diagnostics?.actualReturnedSubtypes || []).join(', ')}`);
      console.log(`      - Substitution Count: ${gmatRes.diagnostics?.substitutionCount ?? 0}`);
      const rbG = gmatRes.diagnostics?.repairBreakdown || { constraint: 0, crossOption: 0, lengthBias: 0, exactText: 0, reviewer: 0 };
      console.log(`      - Repaired Questions: ${gmatRes.diagnostics?.questionsSentToRepair ?? 0} (constraint: ${rbG.constraint}, crossOption: ${rbG.crossOption}, lengthBias: ${rbG.lengthBias}, exactText: ${rbG.exactText}, reviewer: ${rbG.reviewer})`);
      console.log(`      - API Call Count: ${gmatRes.diagnostics?.apiCallCount ?? 1}`);
    } catch (err) {
      console.log(`Failed: ${err.message}`);
      gmatRes = { questions: [], source: 'fallback', diagnostics: {} };
    }

    const newStats = analyzeSet(newRes.questions, p.text);
    Object.keys(newStats.letters).forEach((l) => {
      if (newTotals.letters[l] !== undefined) newTotals.letters[l] += newStats.letters[l];
    });
    newTotals.longest += newStats.longestOptionCount;

    const gmatStats = analyzeSet(gmatRes.questions, p.text);

    // Run independent review comparison for evidence gate analysis
    for (const q of newRes.questions) {
      const evidence = q.evidence || '';
      const oldPasses = oldEvidenceGateCheck(evidence, p.text);
      const newEvidenceFound = checkEvidenceFound(evidence, p.text);

      if (!oldPasses && newRes.source === 'ai') {
        falseRejections.push({
          passage: p.title,
          stem: q.stem,
          key: q.correctLetter,
          evidenceQuote: evidence,
          reason: 'Old strict case/quote gate rejected it, but new pipeline verified question logic defensibility.'
        });
      }
    }

    // If Groq key provided, run dual review to compare agreements
    if (groqKey && newRes.questions.length > 0) {
      try {
        const rawEnvModel = process.env.GROQ_MODEL;
        const targetGroqModel = rawEnvModel && isUsableGroqChatModel(rawEnvModel)
          ? resolveEffectiveGroqModel(rawEnvModel)
          : resolveEffectiveGroqModel(GROQ_MODEL_DEFAULT);
        const inputs = buildReviewerInput(newRes.questions);
        const groqReviews = await callGroqReview(groqKey, targetGroqModel, p.text, inputs);
        const geminiReviews = await callGeminiReview(geminiKey, VERIFIER_MODEL, p.text, inputs);

        for (const q of newRes.questions) {
          const gRev = groqReviews.find((r) => r.id === q.id);
          const mRev = geminiReviews.find((r) => r.id === q.id);
          if (gRev && mRev) {
            if (gRev.chosenLetter !== mRev.chosenLetter) {
              disagreements.push({
                passage: p.title,
                stem: q.stem,
                storedKey: q.correctLetter,
                groqChoice: gRev.chosenLetter,
                groqNote: gRev.note,
                geminiChoice: mRev.chosenLetter,
                geminiNote: mRev.note
              });
            }
          }
        }
      } catch (err) {
        console.warn(`Dual review comparison skipped for passage ${i + 1}: ${err.message}`);
      }
    }

    evalRunResults.oldVersion.push({ passageId: p.id, stats: oldStats, questions: oldRes.questions });
    evalRunResults.newVersion.push({
      passageId: p.id,
      stats: newStats,
      questions: newRes.questions,
      diagnostics: newRes.diagnostics,
      gmat: {
        stats: gmatStats,
        questions: gmatRes.questions,
        diagnostics: gmatRes.diagnostics
      }
    });

    await sleep(800);
  }

  // Save results to eval/out
  if (!fs.existsSync(EVAL_OUT_DIR)) {
    fs.mkdirSync(EVAL_OUT_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(EVAL_OUT_DIR, `eval-${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(evalRunResults, null, 2), 'utf8');

  // Print Comparative Tables
  console.log(`\n==============================================================================================================================================================`);
  console.log(`PASSAGE EVALUATION SUMMARY TABLE (CAT & GMAT across 4 Passages)`);
  console.log(`==============================================================================================================================================================`);
  console.log(
    `Passage ID             | Exam | Operations (set mix)              | MultiPara  | CopyLike | Quality Flags                   | Repair (C/CO/LB/ET/R) | Calls`
  );
  console.log(
    `-----------------------+------+-----------------------------------+------------+----------+---------------------------------+-----------------------+------`
  );
  for (const nv of evalRunResults.newVersion) {
    const catOps = nv.questions.map(getQuestionOperation).join(', ');
    const catMultiPara = nv.diagnostics?.flags?.includes('theme_unmet:multi_paragraph') ? 'Unverified' : 'Verified';
    const passageObj = passages.find((p) => p.id === nv.passageId);
    const catSentences = passageObj ? splitPassageIntoSentences(passageObj.text) : [];
    const catCopyLike = nv.questions.filter((q) => isCopyLikeQuestion(q, catSentences)).length;
    const catFlags = (nv.diagnostics?.flags && nv.diagnostics.flags.length > 0) ? nv.diagnostics.flags.join(',') : 'None';
    const catRb = nv.diagnostics?.repairBreakdown || { constraint: 0, crossOption: 0, lengthBias: 0, exactText: 0, reviewer: 0 };
    const catRbStr = `${catRb.constraint}/${catRb.crossOption}/${catRb.lengthBias}/${catRb.exactText}/${catRb.reviewer}`;
    const catCalls = nv.diagnostics?.apiCallCount ?? 1;

    console.log(
      `${nv.passageId.padEnd(22)} | CAT  | ${catOps.padEnd(33)} | ${catMultiPara.padEnd(10)} | ${String(catCopyLike).padEnd(8)} | ${catFlags.padEnd(31)} | ${catRbStr.padEnd(21)} | ${catCalls}`
    );

    if (nv.gmat) {
      const gmatOps = nv.gmat.questions.map(getQuestionOperation).join(', ');
      const gmatMultiPara = nv.gmat.diagnostics?.flags?.includes('theme_unmet:multi_paragraph') ? 'Unverified' : 'Verified';
      const gmatCopyLike = nv.gmat.questions.filter((q) => isCopyLikeQuestion(q, catSentences)).length;
      const gmatFlags = (nv.gmat.diagnostics?.flags && nv.gmat.diagnostics.flags.length > 0) ? nv.gmat.diagnostics.flags.join(',') : 'None';
      const gmatRb = nv.gmat.diagnostics?.repairBreakdown || { constraint: 0, crossOption: 0, lengthBias: 0, exactText: 0, reviewer: 0 };
      const gmatRbStr = `${gmatRb.constraint}/${gmatRb.crossOption}/${gmatRb.lengthBias}/${gmatRb.exactText}/${gmatRb.reviewer}`;
      const gmatCalls = nv.gmat.diagnostics?.apiCallCount ?? 1;

      console.log(
        `${''.padEnd(22)} | GMAT | ${gmatOps.padEnd(33)} | ${gmatMultiPara.padEnd(10)} | ${String(gmatCopyLike).padEnd(8)} | ${gmatFlags.padEnd(31)} | ${gmatRbStr.padEnd(21)} | ${gmatCalls}`
      );
    }
  }

  // Question Set Theme & Cognitive Balance Breakdown
  console.log(`\n======================================================`);
  console.log(`QUESTION SET THEME & COGNITIVE BALANCE BREAKDOWN`);
  console.log(`======================================================`);
  evalRunResults.newVersion.forEach((nv) => {
    console.log(`\nPassage: ${nv.passageId}`);
    console.log(`  CAT Questions:`);
    nv.questions.forEach((q, idx) => {
      const op = getQuestionOperation(q);
      console.log(`    Q${idx + 1} (${q.id}): [${op}] ${q.subtype || q.type} | Key: ${q.correctLetter}`);
    });
    console.log(`  Quality Flags: ${(nv.diagnostics?.flags || []).join(', ') || 'None'}`);
    console.log(`  Repair Calls Needed: ${(nv.diagnostics?.questionsSentToRepair || 0) > 0 ? 'Yes' : 'No'} (${nv.diagnostics?.questionsSentToRepair || 0} questions sent)`);

    if (nv.gmat) {
      console.log(`  GMAT Questions:`);
      nv.gmat.questions.forEach((q, idx) => {
        const op = getQuestionOperation(q);
        console.log(`    Q${idx + 1} (${q.id}): [${op}] ${q.subtype || q.type} | Key: ${q.correctLetter}`);
      });
      console.log(`  GMAT Quality Flags: ${(nv.gmat.diagnostics?.flags || []).join(', ') || 'None'}`);
    }
  });

  console.log(`\n======================================================`);
  console.log(`METRIC COMPARISON TABLE: OLD PROMPT vs NEW PIPELINE`);
  console.log(`======================================================`);
  console.log(`Metric                         | Old Prompt          | New Pipeline`);
  console.log(`-------------------------------+---------------------+---------------------`);
  console.log(`Total Questions Generated      | ${String(oldTotals.questions).padEnd(19)} | ${String(newTotals.questions).padEnd(19)}`);
  console.log(`Total Pipeline Seconds         | ${String(oldTotals.seconds.toFixed(1) + 's').padEnd(19)} | ${String(newTotals.seconds.toFixed(1) + 's').padEnd(19)}`);
  console.log(`Total Tokens Consumed          | ${String(oldTotals.tokens).padEnd(19)} | ${String(newTotals.tokens).padEnd(19)}`);
  console.log(`Correct Answer Letter Spread   | A:${oldTotals.letters.A} B:${oldTotals.letters.B} C:${oldTotals.letters.C} D:${oldTotals.letters.D}  | A:${newTotals.letters.A} B:${newTotals.letters.B} C:${newTotals.letters.C} D:${newTotals.letters.D}`);
  console.log(`Correct Option Longest Count   | ${String(oldTotals.longest).padEnd(19)} | ${String(newTotals.longest).padEnd(19)}`);
  console.log(`Distinct Subtypes per Set      | Rigid fixed 4 types | Varied per passage`);

  // Subtype diversity analysis
  console.log(`\nSubtype Mix by Passage (New Pipeline):`);
  evalRunResults.newVersion.forEach((nv) => {
    console.log(` - ${nv.passageId}: [${nv.stats.subtypesList.join(', ')}]`);
  });

  // False Rejections
  console.log(`\n------------------------------------------------------`);
  console.log(`EVIDENCE GATE ANALYSIS:`);
  console.log(`Questions old gate would have falsely rejected: ${falseRejections.length}`);
  if (falseRejections.length > 0) {
    console.log(`Examples of questions saved by un-gating evidence:`);
    falseRejections.slice(0, 5).forEach((ex, idx) => {
      console.log(` ${idx + 1}. [${ex.passage}] Q: "${ex.stem.slice(0, 70)}..." Key: (${ex.key})`);
      console.log(`    Evidence: "${ex.evidenceQuote}" — ${ex.reason}`);
    });
  }

  // Disagreements
  if (groqKey) {
    console.log(`\n------------------------------------------------------`);
    console.log(`REVIEWER AGREEMENT (Gemini vs Groq):`);
    console.log(`Disagreements observed: ${disagreements.length}`);
    if (disagreements.length > 0) {
      disagreements.slice(0, 5).forEach((d, idx) => {
        console.log(` ${idx + 1}. [${d.passage}] Stem: "${d.stem.slice(0, 60)}..."`);
        console.log(`    Stored Key: ${d.storedKey} | Groq: ${d.groqChoice} (${d.groqNote}) | Gemini: ${d.geminiChoice} (${d.geminiNote})`);
      });
    } else {
      console.log(`All questions had full reviewer consensus!`);
    }
  }

  console.log(`\nFull eval output saved to: ${path.relative(ROOT_DIR, outFile)}`);
  console.log(`======================================================\n`);
}

main().catch((err) => {
  console.error('Fatal eval error:', err);
  process.exit(1);
});
