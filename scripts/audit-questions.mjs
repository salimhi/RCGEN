#!/usr/bin/env node

/**
 * scripts/audit-questions.mjs
 * Second-opinion blind review audit for questions in data files using Groq (and optionally Gemini).
 * Reads GROQ_API_KEY and GEMINI_API_KEY from environment only. Never logs or prints any key.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

// Pure logic imports
import {
  buildReviewerInput,
  buildReviewerPrompt,
  parseReviewerOutput,
  judgeQuestion,
  REVIEWER_SYSTEM_INSTRUCTION
} from '../src/lib/verifier.ts';
import { GROQ_BASE_URL, GROQ_MODEL_DEFAULT, VERIFIER_MODEL } from '../src/config.ts';
import { isUsableGroqChatModel, resolveEffectiveGroqModel } from '../src/lib/groqModels.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const AUDIT_OUT_DIR = path.join(__dirname, 'audit-out');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function estimateTokens(text) {
  return Math.ceil((text || '').length / 4);
}

export function scrubSecret(text, key) {
  if (!text) return '';
  let out = String(text);
  if (key && key.length >= 8) {
    const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'g'), '[REDACTED]');
  }
  return out.replace(/gsk_[0-9A-Za-z]{20,}/g, '[REDACTED]').replace(/AIza[0-9A-Za-z-_]{20,}/g, '[REDACTED]');
}

export async function fetchGroqChat(apiKey, model, userPrompt) {
  const est = estimateTokens(userPrompt) + 200;
  if (est > 6000) {
    throw new Error(`Estimated token size (${est}) exceeds the 6,000 token limit per call. Passage is too long for a single audit call.`);
  }

  let attempt = 0;
  while (attempt < 3) {
    attempt++;
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

    // Check rate limit remaining headers
    const remainingReq = res.headers.get('x-ratelimit-remaining-requests');
    if (remainingReq) {
      process.stdout.write(` [RateLimit: ${remainingReq} reqs left] `);
    }

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('retry-after') || '2', 10);
      console.warn(`\n[Groq 429 Rate Limited] Backing off for ${retryAfter}s (attempt ${attempt}/3)...`);
      await sleep(retryAfter * 1000);
      continue;
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`Groq HTTP ${res.status}: ${scrubSecret(txt.slice(0, 200), apiKey)}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || '';
  }
  throw new Error('Groq request failed after 3 rate-limit retries.');
}

export async function fetchGeminiChat(apiKey, model, userPrompt) {
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
    throw new Error(`Gemini HTTP ${res.status}: ${scrubSecret(txt.slice(0, 200), apiKey)}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

export async function auditSingleTest({
  test,
  groqKey,
  groqModel = GROQ_MODEL_DEFAULT,
  geminiKey,
  alsoGemini = false
}) {
  const passageText = Array.isArray(test.passage_paragraphs)
    ? test.passage_paragraphs.join('\n\n')
    : String(test.passage || '');

  const inputs = buildReviewerInput(test.questions);
  const userPrompt = buildReviewerPrompt(passageText, inputs);

  let groqReviews = [];
  let rawOutput = await fetchGroqChat(groqKey, groqModel, userPrompt);
  try {
    groqReviews = parseReviewerOutput(rawOutput);
  } catch {
    console.warn(`[Groq JSON Parse Warning] Malformed response, retrying once with explicit schema reminder...`);
    rawOutput = await fetchGroqChat(
      groqKey,
      groqModel,
      userPrompt + '\n\nIMPORTANT: Return valid JSON matching the schema.'
    );
    groqReviews = parseReviewerOutput(rawOutput);
  }

  let geminiReviews = [];
  if (alsoGemini && geminiKey) {
    try {
      const rawGemini = await fetchGeminiChat(geminiKey, VERIFIER_MODEL, userPrompt);
      geminiReviews = parseReviewerOutput(rawGemini);
    } catch (err) {
      console.warn(`⚠️ Gemini audit failed for "${test.id}": ${err.message}`);
    }
  }

  const results = [];
  for (let qIdx = 0; qIdx < test.questions.length; qIdx++) {
    const q = test.questions[qIdx];
    const gRev = groqReviews.find((r) => r.id === q.id) || groqReviews[qIdx];
    const mRev = alsoGemini ? (geminiReviews.find((r) => r.id === q.id) || geminiReviews[qIdx]) : null;

    let status = 'OK';
    let failureReason = '';

    if (!gRev) {
      status = 'PROBLEM';
      failureReason = 'Reviewer did not return a response for this question';
    } else {
      const judge = judgeQuestion(q, gRev);
      if (!judge.passed) {
        if (judge.chosenLetter !== judge.expectedLetter) {
          status = 'MISMATCH';
        } else if (judge.defensibleLetters && judge.defensibleLetters.length > 1) {
          status = 'MULTIPLE';
        } else {
          status = 'PROBLEM';
        }
        failureReason = judge.failureReason || gRev.note;
      }
    }

    results.push({
      id: q.id,
      stem: q.stem,
      storedKey: q.correctLetter,
      groqChoice: gRev?.chosenLetter,
      geminiChoice: mRev?.chosenLetter,
      groqReview: gRev,
      geminiReview: mRev,
      status,
      failureReason
    });
  }

  return {
    testId: test.id,
    title: test.title,
    results
  };
}

async function promptYesNo(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y' || ans.trim().toLowerCase() === 'yes');
    });
  });
}

export async function main() {
  const args = process.argv.slice(2);
  const alsoGemini = args.includes('--also-gemini');
  const autoYes = args.includes('--yes');

  let idFilter = null;
  const idIdx = args.indexOf('--id');
  if (idIdx !== -1 && args[idIdx + 1]) idFilter = args[idIdx + 1];

  let fileFilter = null;
  const fileIdx = args.indexOf('--file');
  if (fileIdx !== -1 && args[fileIdx + 1]) fileFilter = args[fileIdx + 1];

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey || !groqKey.trim()) {
    console.error('\n❌ Error: GROQ_API_KEY environment variable is not set.');
    console.error('Please set it in PowerShell without echo or history:');
    console.error('  $s = Read-Host "Groq key" -AsSecureString');
    console.error('  $env:GROQ_API_KEY = [System.Net.NetworkCredential]::new("", $s).Password');
    console.error('To clear when done:');
    console.error('  Remove-Item Env:GROQ_API_KEY\n');
    process.exit(1);
  }

  const geminiKey = process.env.GEMINI_API_KEY;
  if (alsoGemini && (!geminiKey || !geminiKey.trim())) {
    console.error('\n❌ Error: --also-gemini requested but GEMINI_API_KEY is not set.');
    console.error('Please set it in PowerShell without echo or history:');
    console.error('  $s = Read-Host "Gemini key" -AsSecureString');
    console.error('  $env:GEMINI_API_KEY = [System.Net.NetworkCredential]::new("", $s).Password');
    console.error('To clear when done:');
    console.error('  Remove-Item Env:GEMINI_API_KEY\n');
    process.exit(1);
  }

  // Privacy notice
  console.log('\n🔒 PRIVACY NOTICE:');
  console.log('   This sends the passage and questions to Groq. Only run it on text you have the right to share.');
  if (!autoYes && process.stdin.isTTY) {
    const ok = await promptYesNo('Proceed with audit?');
    if (!ok) {
      console.log('Aborted by user.');
      process.exit(0);
    }
  }

  const rawEnvModel = process.env.GROQ_MODEL;
  let groqModel;
  if (rawEnvModel && isUsableGroqChatModel(rawEnvModel)) {
    groqModel = resolveEffectiveGroqModel(rawEnvModel);
  } else {
    if (rawEnvModel) {
      console.warn(`[Warning] GROQ_MODEL="${rawEnvModel}" is not a usable chat model. Falling back to Auto.`);
    }
    groqModel = resolveEffectiveGroqModel(GROQ_MODEL_DEFAULT);
  }
  console.log(`\nInitializing Audit Run:`);
  console.log(`- Reviewer Model:  Groq (${groqModel})`);
  if (alsoGemini) {
    console.log(`- Reviewer Model:  Gemini (${VERIFIER_MODEL}) [Triple Consensus Mode]`);
  }
  console.log(`- Source Data:     library.json / pyq.json`);

  let targets = [];
  if (fileFilter) {
    const filePath = path.resolve(process.cwd(), fileFilter);
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    targets = Array.isArray(content) ? content : [content];
  } else {
    const libPath = path.join(ROOT_DIR, 'src', 'data', 'library.json');
    const pyqPath = path.join(ROOT_DIR, 'src', 'data', 'pyq.json');

    const lib = fs.existsSync(libPath) ? JSON.parse(fs.readFileSync(libPath, 'utf8')) : [];
    const pyq = fs.existsSync(pyqPath) ? JSON.parse(fs.readFileSync(pyqPath, 'utf8')) : [];

    const combined = [...lib, ...pyq];
    if (idFilter) {
      targets = combined.filter((t) => t.id === idFilter);
      if (targets.length === 0) {
        console.error(`Test ID "${idFilter}" not found in library.json or pyq.json.`);
        process.exit(1);
      }
    } else {
      targets = combined.filter((t) => Array.isArray(t.questions) && t.questions.length > 0);
    }
  }

  // Filter only those with questions
  targets = targets.filter((t) => Array.isArray(t.questions) && t.questions.length > 0);
  console.log(`Loaded ${targets.length} test set(s) for audit.\n`);

  let totalQuestionsAudited = 0;
  let flaggedCount = 0;
  const flaggedQuestions = [];
  const auditReport = [];

  for (let tIdx = 0; tIdx < targets.length; tIdx++) {
    const test = targets[tIdx];
    console.log(`\n======================================================`);
    console.log(`[${tIdx + 1}/${targets.length}] Auditing: "${test.title}" (ID: ${test.id})`);
    console.log(`Passage length: ${test.word_count || test.passage_paragraphs?.join(' ').split(/\s+/).length} words`);
    console.log(`Questions: ${test.questions.length}`);
    console.log(`------------------------------------------------------`);

    let singleReport;
    try {
      singleReport = await auditSingleTest({
        test,
        groqKey,
        groqModel,
        geminiKey,
        alsoGemini
      });
    } catch (err) {
      console.error(`❌ Groq audit failed for "${test.id}": ${err.message}`);
      flaggedCount += test.questions.length;
      flaggedQuestions.push({ testId: test.id, reason: `Groq error: ${err.message}` });
      continue;
    }

    if (alsoGemini) {
      console.log('Q#  | Stored Key | Groq Choice | Gemini Choice | Status   | Reviewer Note');
      console.log('----+------------+-------------+---------------+----------+-------------------------');
    } else {
      console.log('Q#  | Stored Key | Groq Choice | Status   | Reviewer Note');
      console.log('----+------------+-------------+----------+-------------------------');
    }

    for (let qIdx = 0; qIdx < singleReport.results.length; qIdx++) {
      totalQuestionsAudited++;
      const res = singleReport.results[qIdx];
      const q = test.questions[qIdx];

      if (res.status !== 'OK') {
        flaggedCount++;
        flaggedQuestions.push({
          testId: test.id,
          questionId: q.id,
          stem: q.stem,
          storedKey: q.correctLetter,
          groqChoice: res.groqChoice,
          geminiChoice: res.geminiChoice,
          status: res.status,
          note: res.groqReview?.note || res.failureReason
        });
      }

      const qLabel = `Q${qIdx + 1}`.padEnd(3);
      const sKey = String(q.correctLetter).padEnd(10);
      const gChoice = String(res.groqChoice || '?').padEnd(11);
      const notePreview = (res.groqReview?.note || res.failureReason || '').slice(0, 35);

      if (alsoGemini) {
        const mChoice = String(res.geminiChoice || '?').padEnd(13);
        const st = res.status.padEnd(8);
        console.log(`${qLabel} | ${sKey} | ${gChoice} | ${mChoice} | ${st} | ${notePreview}`);
      } else {
        const st = res.status.padEnd(8);
        console.log(`${qLabel} | ${sKey} | ${gChoice} | ${st} | ${notePreview}`);
      }
    }

    auditReport.push(singleReport);
    // Short polite pause between tests
    await sleep(600);
  }

  // Save audit report to audit-out
  if (!fs.existsSync(AUDIT_OUT_DIR)) {
    fs.mkdirSync(AUDIT_OUT_DIR, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(AUDIT_OUT_DIR, `audit-${timestamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(auditReport, null, 2), 'utf8');

  console.log(`\n======================================================`);
  console.log(`AUDIT SUMMARY:`);
  console.log(`Total questions audited: ${totalQuestionsAudited}`);
  console.log(`Clean questions:        ${totalQuestionsAudited - flaggedCount}`);
  console.log(`Flagged questions:      ${flaggedCount}`);
  console.log(`Full report saved to:   ${path.relative(ROOT_DIR, outFile)}`);

  if (flaggedQuestions.length > 0) {
    console.log(`\n⚠️ QUESTIONS FLAGGED FOR MANUAL REVIEW:`);
    flaggedQuestions.forEach((f, i) => {
      console.log(` ${i + 1}. [${f.testId}] ${f.questionId || ''}: ${f.status} — ${f.note || f.reason}`);
    });
    process.exit(1);
  } else {
    console.log(`\n✅ ALL QUESTIONS PASSED BLIND AUDIT REVIEW CLEANLY!`);
    process.exit(0);
  }
}

const isMain = Boolean(
  process.argv[1] && (
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1]) ||
    process.argv[1].endsWith('audit-questions.mjs')
  )
);

if (isMain) {
  main().catch((err) => {
    console.error('\nFatal audit error:', err.message);
    process.exit(1);
  });
}
