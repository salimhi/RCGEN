/**
 * Loose Unicode text normalization and matching utilities for CAT RC question checks.
 */

export function normalizeLoose(text: string): string {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[“”"']/g, ' ')
    .replace(/[‘’`]/g, ' ')
    .replace(/[—–-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether needle is contained in haystack using loose Unicode normalization.
 * If needle contains "..." or "…", verifies that all fragments with >= 3 words appear in order.
 */
export function isSubstringLoose(needle: string, haystack: string): boolean {
  if (!needle || typeof needle !== 'string') return true;
  if (!haystack || typeof haystack !== 'string') return false;

  const normHaystack = normalizeLoose(haystack);
  if (!normHaystack) return false;

  // Handle ellipses
  if (needle.includes('...') || needle.includes('…')) {
    const rawParts = needle.split(/\.{3,}|…/);
    const validParts = rawParts
      .map((p) => normalizeLoose(p))
      .filter((p) => p.split(/\s+/).filter(Boolean).length >= 3);

    if (validParts.length === 0) {
      // Fall back to checking any non-empty parts
      const smallParts = rawParts.map((p) => normalizeLoose(p)).filter(Boolean);
      if (smallParts.length === 0) return true;
      return smallParts.every((p) => normHaystack.includes(p));
    }

    let lastIdx = 0;
    for (const part of validParts) {
      const idx = normHaystack.indexOf(part, lastIdx);
      if (idx === -1) return false;
      lastIdx = idx + part.length;
    }
    return true;
  }

  const normNeedle = normalizeLoose(needle);
  if (!normNeedle) return true;

  return normHaystack.includes(normNeedle);
}

/**
 * Checks if optional evidence is present in the passage text.
 * Returns true if found, false if not found, or null/empty if no evidence was provided.
 * Never throws and never gates question generation.
 */
export function checkEvidenceFound(
  evidence: string | undefined | null,
  passage: string
): boolean | null {
  if (!evidence || typeof evidence !== 'string') return null;
  const trimmed = evidence.trim();
  if (!trimmed) return null;
  return isSubstringLoose(trimmed, passage);
}

/**
 * Extracts all quoted phrases (3+ chars) from a stem.
 */
export function extractQuotedPhrases(text: string): string[] {
  if (!text) return [];
  const matches: string[] = [];
  const regex = /["“]([^"”]{3,})["”]|'([^']{3,})'/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const val = (m[1] || m[2] || '').trim();
    if (val.length >= 3) {
      matches.push(val);
    }
  }
  return matches;
}

/**
 * Checks if a stem refers to a paragraph by quoting its first words, and verifies
 * whether that quoted phrase matches the beginning of any paragraph in the passage.
 */
export const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'all', 'almost', 'alone', 'along', 'already', 'also',
  'although', 'always', 'among', 'an', 'and', 'another', 'any', 'anyone', 'anything', 'are', 'around',
  'as', 'at', 'back', 'be', 'became', 'because', 'become', 'becomes', 'been', 'before', 'began', 'being',
  'below', 'between', 'beyond', 'both', 'but', 'by', 'can', 'cannot', 'could', 'did', 'do', 'does',
  'doing', 'done', 'down', 'during', 'each', 'either', 'else', 'enough', 'even', 'ever', 'every',
  'everyone', 'everything', 'few', 'first', 'for', 'four', 'from', 'further', 'get', 'give', 'given',
  'go', 'goes', 'going', 'gone', 'got', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'however', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'keep', 'kept', 'know', 'known', 'large', 'last', 'later', 'least', 'less', 'let', 'like',
  'likely', 'long', 'made', 'make', 'makes', 'making', 'many', 'may', 'me', 'merely', 'might', 'more',
  'most', 'mostly', 'much', 'must', 'my', 'myself', 'near', 'nearly', 'need', 'neither', 'never', 'new',
  'next', 'no', 'nobody', 'none', 'nor', 'not', 'nothing', 'now', 'of', 'off', 'often', 'on', 'once',
  'one', 'ones', 'only', 'onto', 'or', 'other', 'others', 'otherwise', 'ought', 'our', 'ours', 'out',
  'over', 'own', 'part', 'particular', 'perhaps', 'place', 'point', 'put', 'quite', 'rather', 'really',
  'right', 'said', 'same', 'saw', 'say', 'saying', 'says', 'second', 'see', 'seem', 'seemed', 'seems',
  'seen', 'several', 'shall', 'she', 'should', 'show', 'shown', 'side', 'since', 'small', 'so', 'some',
  'someone', 'something', 'sometimes', 'still', 'such', 'take', 'taken', 'taking', 'than', 'that', 'the',
  'their', 'theirs', 'them', 'themselves', 'then', 'there', 'therefore', 'these', 'they', 'thing',
  'things', 'think', 'third', 'this', 'those', 'though', 'three', 'through', 'thus', 'to', 'together',
  'too', 'toward', 'towards', 'turn', 'turned', 'two', 'under', 'until', 'up', 'upon', 'us', 'use',
  'used', 'using', 'very', 'was', 'way', 'ways', 'we', 'well', 'were', 'what', 'whatever', 'when',
  'where', 'whereas', 'whether', 'which', 'while', 'who', 'whole', 'whom', 'whose', 'why', 'will',
  'with', 'within', 'without', 'would', 'yet', 'you', 'your', 'yours'
]);

export function extractContentWords(text: string, minLength: number = 5): string[] {
  if (!text || typeof text !== 'string') return [];
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= minLength && !STOP_WORDS.has(w));
}

export function splitPassageIntoSentences(passage: string): string[] {
  return passage
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

export function getQuestionBestSentenceOverlap(optionText: string, passageSentences: string[]): number {
  const optWords = extractContentWords(optionText, 5);
  if (optWords.length === 0) return 0;

  let bestRatio = 0;
  for (const sentence of passageSentences) {
    const sentenceWords = new Set(extractContentWords(sentence, 5));
    if (sentenceWords.size === 0) continue;
    let matchCount = 0;
    for (const w of optWords) {
      if (sentenceWords.has(w)) {
        matchCount++;
      }
    }
    const ratio = matchCount / optWords.length;
    if (ratio > bestRatio) {
      bestRatio = ratio;
    }
  }

  return bestRatio;
}

export function findMatchingParagraphIndex(phrase: string, paragraphs: string[]): number {
  const normQ = normalizeLoose(phrase);
  if (!normQ) return -1;
  const qWords = normQ.split(/\s+/);
  if (qWords.length === 0) return -1;
  const qPrefix = qWords.slice(0, 6).join(' ');

  for (let i = 0; i < paragraphs.length; i++) {
    const normPara = normalizeLoose(paragraphs[i]);
    const paraWords = normPara.split(/\s+/);
    const paraPrefix = paraWords.slice(0, 6).join(' ');
    if (
      paraPrefix.startsWith(qPrefix) ||
      qPrefix.startsWith(paraPrefix) ||
      normPara.startsWith(qPrefix) ||
      normQ.startsWith(paraPrefix)
    ) {
      return i;
    }
  }
  return -1;
}

export function matchesParagraphBeginning(
  stem: string,
  paragraphs: string[]
): { isParagraphRef: boolean; matched: boolean; phrase?: string } {
  const normStem = stem.toLowerCase();
  const isParaRef = /paragraph\s+that\s+(?:begins|starts)|the\s+paragraph\s+beginning|first\s+(?:six\s+)?words/i.test(
    normStem
  );
  if (!isParaRef) {
    return { isParagraphRef: false, matched: true };
  }

  const quotes = extractQuotedPhrases(stem);
  if (quotes.length === 0) {
    return { isParagraphRef: true, matched: false };
  }

  const paraNormStarts = paragraphs.map((p) => {
    const norm = normalizeLoose(p);
    const words = norm.split(/\s+/).slice(0, 10).join(' ');
    return words;
  });

  for (const q of quotes) {
    const normQ = normalizeLoose(q);
    if (!normQ) continue;
    const matchesAny = paraNormStarts.some((pStart) => pStart.startsWith(normQ) || normQ.startsWith(pStart));
    if (matchesAny) {
      return { isParagraphRef: true, matched: true, phrase: q };
    }
  }

  return { isParagraphRef: true, matched: false, phrase: quotes[0] };
}
