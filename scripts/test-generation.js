import assert from 'assert';
import { normalizeParagraphs, detectTopic, buildExamQuestions } from '../src/lib/ruleGenerator.ts';

console.log('🧪 Testing rule-based generation and normalization...');

// 1. Test normalization
const testText = `   discussions of modern digital technology routinely begin from a linear premise.
Here is the second sentence of the first paragraph to test paragraph length.

This is the second paragraph. It discusses complex feedback loops and empirical measurement across multiple domains.`;

const { paragraphs, startsMidWord } = normalizeParagraphs(testText);
assert.strictEqual(startsMidWord, true, 'Should detect lowercase start as mid-word');
assert.strictEqual(paragraphs[0].startsWith('Discussions'), true, 'Should capitalize first letter');
assert.strictEqual(paragraphs.length, 2, 'Should have 2 paragraphs');

// 2. Test topic detection
const topic = detectTopic('epistemological questions concerning ethics and moral truth');
assert.strictEqual(topic, 'Philosophy', 'Should detect Philosophy');

// 3. Test question generation
const catQuestions = buildExamQuestions({
  paragraphs: [
    'Discussions of modern digital technology routinely begin from a linear premise that expanding access democratizes knowledge.',
    'This divergence is not an accidental byproduct of user indiscipline; it follows from the commercial architecture of attention extraction itself.',
    'Historical parallels illuminate the underlying dynamic. Earlier transformations in communication were accompanied by utopian assurances.'
  ],
  title: 'Attention Economy',
  topic: 'Technology & AI',
  examType: 'CAT',
  difficulty: 'Challenging'
});

assert.strictEqual(catQuestions.length, 4, 'CAT should have 4 questions');
for (const q of catQuestions) {
  assert.strictEqual(q.options.length, 4, 'CAT question should have 4 options');
  assert.ok(!/¶|Paragraph\s+\d+/i.test(q.stem), `Stem must not contain paragraph number: ${q.stem}`);
  for (const opt of q.options) {
    assert.ok(opt.text.length > 0, 'Option text must not be empty');
    assert.ok(opt.explanation.length > 0, 'Option explanation must not be empty');
  }
}

// 4. Test GMAT question generation
const gmatQuestions = buildExamQuestions({
  paragraphs: [
    'Discussions of modern digital technology routinely begin from a linear premise that expanding access democratizes knowledge.',
    'This divergence is not an accidental byproduct of user indiscipline; it follows from the commercial architecture of attention extraction itself.',
    'Historical parallels illuminate the underlying dynamic. Earlier transformations in communication were accompanied by utopian assurances.'
  ],
  title: 'Attention Economy',
  topic: 'Technology & AI',
  examType: 'GMAT',
  difficulty: 'Challenging'
});

assert.strictEqual(gmatQuestions.length, 5, 'GMAT should have 5 questions');
for (const q of gmatQuestions) {
  assert.strictEqual(q.options.length, 5, 'GMAT question should have 5 options');
  assert.strictEqual(q.options[4].letter, 'E', '5th option letter must be E');
}

console.log('✅ All generation unit tests passed successfully!\n');
