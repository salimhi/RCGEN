import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'src', 'data');

const FILES = {
  library: path.join(DATA_DIR, 'library.json'),
  pyq: path.join(DATA_DIR, 'pyq.json'),
  guides: path.join(DATA_DIR, 'guides.json'),
  speed: path.join(DATA_DIR, 'speed-passages.json')
};

function fail(file, id, message) {
  console.error(`\n❌ [check:data] VALIDATION FAILED:`);
  console.error(`   File: ${path.basename(file)}`);
  if (id) console.error(`   Entry ID: "${id}"`);
  console.error(`   Error: ${message}\n`);
  process.exit(1);
}

function loadJson(file) {
  if (!fs.existsSync(file)) {
    fail(file, null, `File does not exist.`);
  }
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    fail(file, null, `Invalid JSON syntax: ${err.message}`);
  }
}

console.log('🔍 Running check:data validation on src/data/*.json...');

const seenIds = new Set();

const VALID_TYPES = new Set([
  'Main Idea',
  'Inference',
  'Paragraph Function',
  'Tone & Attitude',
  'Strengthen / Weaken',
  'Detail & Logic',
  'Vocabulary in Context'
]);

const VALID_FLAWS = new Set([
  'extreme',
  'opposite',
  'scope',
  'distortion',
  'causal',
  'comparison',
  'irrelevant'
]);

// 1. Validate Library tests
const library = loadJson(FILES.library);
if (!Array.isArray(library)) fail(FILES.library, null, `Root must be an array of test objects.`);

for (const test of library) {
  validateTestEntry(test, FILES.library, true);
}

// 2. Validate PYQ catalog
const pyq = loadJson(FILES.pyq);
if (!Array.isArray(pyq)) fail(FILES.pyq, null, `Root must be an array of catalog items.`);

for (const test of pyq) {
  // PYQ catalog items may have empty passage_paragraphs & questions before being authored
  const isAuthored = Array.isArray(test.questions) && test.questions.length > 0;
  validateTestEntry(test, FILES.pyq, isAuthored);
  if (test.year === undefined || test.slot === undefined || test.passage_num === undefined) {
    fail(FILES.pyq, test.id, `PYQ entries must have "year", "slot", and "passage_num".`);
  }
}

// 3. Validate Guides
const guides = loadJson(FILES.guides);
if (!Array.isArray(guides)) fail(FILES.guides, null, `Root must be an array of guides.`);
for (const guide of guides) {
  if (!guide.id || !guide.title || !guide.summary) {
    fail(FILES.guides, guide.id, `Guides must have "id", "title", and "summary".`);
  }
}

// 4. Validate Speed Passages
const speedPassages = loadJson(FILES.speed);
if (!Array.isArray(speedPassages)) fail(FILES.speed, null, `Root must be an array of speed passages.`);
for (const sp of speedPassages) {
  if (!sp.id || !sp.title || !sp.content_blocks) {
    fail(FILES.speed, sp.id, `Speed passages must have "id", "title", and "content_blocks".`);
  }
}

function validateTestEntry(test, file, requireFullContent) {
  if (!test.id || typeof test.id !== 'string') {
    fail(file, test?.id, `Missing or non-string "id".`);
  }

  if (test.id.startsWith('u-')) {
    fail(file, test.id, `Static test IDs must never start with "u-" (reserved for user-generated tests).`);
  }

  if (seenIds.has(test.id)) {
    fail(file, test.id, `Duplicate ID found: "${test.id}". Every test must have a unique ID.`);
  }
  seenIds.add(test.id);

  if (!test.title || typeof test.title !== 'string') {
    fail(file, test.id, `Missing or non-string "title".`);
  }

  if (!requireFullContent) {
    return; // Catalog placeholder entry without authored questions is valid
  }

  // Full authored test validation
  if (!Array.isArray(test.passage_paragraphs) || test.passage_paragraphs.length === 0) {
    fail(file, test.id, `Authored test must have at least one paragraph in "passage_paragraphs".`);
  }

  if (!Array.isArray(test.questions) || test.questions.length < 3 || test.questions.length > 6) {
    fail(file, test.id, `Authored test must have between 3 and 6 questions (found ${test.questions?.length}).`);
  }

  const isGmat = test.exam_type === 'GMAT';
  const expectedLetters = isGmat ? ['A', 'B', 'C', 'D', 'E'] : ['A', 'B', 'C', 'D'];

  const questionIds = new Set();

  test.questions.forEach((q, qIdx) => {
    const qNum = qIdx + 1;
    if (!q.id) fail(file, test.id, `Question ${qNum} is missing "id".`);
    if (questionIds.has(q.id)) fail(file, test.id, `Duplicate question id "${q.id}".`);
    questionIds.add(q.id);

    if (q.type && !VALID_TYPES.has(q.type)) {
      fail(file, test.id, `Question ${qNum} has unknown type "${q.type}". Must be one of: ${Array.from(VALID_TYPES).join(', ')}.`);
    }

    if (!q.stem || typeof q.stem !== 'string' || !q.stem.trim()) {
      fail(file, test.id, `Question ${qNum} has an empty "stem".`);
    }

    if (/¶|Paragraph\s+\d+/i.test(q.stem)) {
      fail(file, test.id, `Question ${qNum} stem contains forbidden paragraph number/symbol ("¶" or "Paragraph <n>"): "${q.stem}".`);
    }

    if (!Array.isArray(q.options) || q.options.length !== expectedLetters.length) {
      fail(
        file,
        test.id,
        `Question ${qNum} has ${q.options?.length} options. Expected ${expectedLetters.length} for ${test.exam_type || 'CAT'}.`
      );
    }

    q.options.forEach((opt, optIdx) => {
      const expectedLetter = expectedLetters[optIdx];
      if (opt.letter !== expectedLetter) {
        fail(file, test.id, `Question ${qNum} option ${optIdx + 1} has letter "${opt.letter}", expected "${expectedLetter}".`);
      }
      if (!opt.text || typeof opt.text !== 'string' || !opt.text.trim()) {
        fail(file, test.id, `Question ${qNum} Option ${expectedLetter} has empty text.`);
      }
      if (!opt.explanation || typeof opt.explanation !== 'string' || !opt.explanation.trim()) {
        fail(file, test.id, `Question ${qNum} Option ${expectedLetter} has empty explanation.`);
      }
      if (opt.flawTag && !VALID_FLAWS.has(opt.flawTag)) {
        fail(file, test.id, `Question ${qNum} Option ${expectedLetter} has invalid flawTag "${opt.flawTag}". Must be one of: ${Array.from(VALID_FLAWS).join(', ')}.`);
      }
      if (/¶|Paragraph\s+\d+/i.test(opt.text)) {
        fail(file, test.id, `Question ${qNum} Option ${expectedLetter} contains forbidden paragraph marker: "${opt.text}".`);
      }
    });

    if (!expectedLetters.includes(q.correctLetter)) {
      fail(
        file,
        test.id,
        `Question ${qNum} has invalid correctLetter "${q.correctLetter}". Expected one of: ${expectedLetters.join(', ')}.`
      );
    }
  });
}

// 5. Predictability and variety advisory checks for authored tests (non-failing warnings)
const authoredTests = [
  ...library.filter((t) => Array.isArray(t.questions) && t.questions.length > 0),
  ...pyq.filter((t) => Array.isArray(t.questions) && t.questions.length > 0)
];

const warnings = [];

// A. Check for identical key sequences across tests
for (let i = 0; i < authoredTests.length; i++) {
  const t1 = authoredTests[i];
  const keys1 = t1.questions.map((q) => q.correctLetter).join(', ');
  for (let j = i + 1; j < authoredTests.length; j++) {
    const t2 = authoredTests[j];
    const keys2 = t2.questions.map((q) => q.correctLetter).join(', ');
    if (keys1 === keys2) {
      warnings.push(`Two tests have the identical sequence of correct letters [${keys1}]: "${t1.title}" and "${t2.title}".`);
    }
  }
}

// B. Check for same letter as key for more than half of questions
for (const t of authoredTests) {
  const counts = {};
  for (const q of t.questions) {
    counts[q.correctLetter] = (counts[q.correctLetter] || 0) + 1;
  }
  const threshold = t.questions.length / 2;
  for (const [letter, count] of Object.entries(counts)) {
    if (count > threshold) {
      warnings.push(`Test "${t.title}" has key "${letter}" in ${count} of ${t.questions.length} questions (> 50%).`);
    }
  }
}

// C. Check for identical type sequences across tests
for (let i = 0; i < authoredTests.length; i++) {
  const t1 = authoredTests[i];
  const types1 = t1.questions.map((q) => q.type).join(', ');
  for (let j = i + 1; j < authoredTests.length; j++) {
    const t2 = authoredTests[j];
    const types2 = t2.questions.map((q) => q.type).join(', ');
    if (types1 === types2) {
      warnings.push(`Two tests have the identical sequence of question types [${types1}]: "${t1.title}" and "${t2.title}".`);
    }
  }
}

// D. Check for every question having the exact same type
for (const t of authoredTests) {
  const distinctTypes = new Set(t.questions.map((q) => q.type));
  if (distinctTypes.size === 1) {
    warnings.push(`Every question of test "${t.title}" has the same type: "${t.questions[0].type}".`);
  }
}

// E. Check for legacy rule-based default key sequence [B, C, A, D]
for (const t of authoredTests) {
  const keys = t.questions.map((q) => q.correctLetter).join(', ');
  if (keys === 'B, C, A, D') {
    warnings.push(`Test "${t.title}" uses the legacy fixed key sequence [B, C, A, D].`);
  }
}

// F. Check for tests having only locate questions (Detail & Logic, Vocabulary in Context)
for (const t of authoredTests) {
  const allLocate = t.questions.every((q) => {
    const tLower = (q.type || '').toLowerCase();
    const sLower = (q.subtype || '').toLowerCase();
    return (
      q.type === 'Detail & Logic' ||
      q.type === 'Vocabulary in Context' ||
      tLower.includes('detail') ||
      tLower.includes('vocabulary') ||
      sLower.includes('according to') ||
      sLower.includes('meaning')
    );
  });
  if (allLocate) {
    warnings.push(`Test "${t.title}" contains only locate/retrieval questions. Consider including interpret, infer, synthesize, or evaluate questions for balanced cognitive demand.`);
  }
}

if (warnings.length > 0) {
  console.warn(`\n⚠️  [check:data] Authored Tests Predictability Warnings (${warnings.length}):`);
  for (const w of warnings) {
    console.warn(`   - ${w}`);
  }
  console.warn(`   (Note: These are non-failing advisory warnings encouraging authors to balance keys and vary types.)\n`);
}

console.log(`✅ [check:data] All static data files verified successfully:`);
console.log(`   - library.json: ${library.length} tests`);
console.log(`   - pyq.json: ${pyq.length} catalog slots`);
console.log(`   - guides.json: ${guides.length} guides`);
console.log(`   - speed-passages.json: ${speedPassages.length} speed passages\n`);

