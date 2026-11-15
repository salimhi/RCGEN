import type { RCTest } from '../types';
import libraryRaw from '../data/library.json';
import pyqRaw from '../data/pyq.json';
import { getCustomTests } from './storage';

export function computeWordCount(paragraphs: string[]): number {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) return 0;
  const fullText = paragraphs.join(' ').trim();
  if (!fullText) return 0;
  return fullText.split(/\s+/).filter(Boolean).length;
}

function normalizeTest(test: any): RCTest {
  const paragraphs = Array.isArray(test.passage_paragraphs) ? test.passage_paragraphs : [];
  const wordCount = test.word_count && test.word_count > 0 ? test.word_count : computeWordCount(paragraphs);
  return {
    ...test,
    passage_paragraphs: paragraphs,
    questions: Array.isArray(test.questions) ? test.questions : [],
    word_count: wordCount,
  };
}

export function getAllLibraryTests(): RCTest[] {
  return (libraryRaw as any[]).map(normalizeTest);
}

export function getAllPyqEntries(): any[] {
  return (pyqRaw as any[]).map(normalizeTest);
}

export function getAuthoredPyqCount(): number {
  return (pyqRaw as any[]).filter(
    (item) => Array.isArray(item.questions) && item.questions.length > 0 && Array.isArray(item.passage_paragraphs) && item.passage_paragraphs.length > 0
  ).length;
}

export function getTotalPyqCount(): number {
  return (pyqRaw as any[]).length;
}

export function getTest(id: string | number): RCTest | null {
  const targetId = String(id).trim();
  if (!targetId) return null;

  // 1. Check static library tests
  const inLibrary = (libraryRaw as any[]).find(
    (t) => String(t.id) === targetId || (t.slug && String(t.slug) === targetId)
  );
  if (inLibrary) return normalizeTest(inLibrary);

  // 2. Check static PYQ tests
  const inPyq = (pyqRaw as any[]).find(
    (t) => String(t.id) === targetId || (t.slug && String(t.slug) === targetId)
  );
  if (inPyq) return normalizeTest(inPyq);

  // 3. Check user custom tests in localStorage
  const customTests = getCustomTests();
  const inCustom = customTests.find(
    (t) => String(t.id) === targetId || (t.slug && String(t.slug) === targetId)
  );
  if (inCustom) return normalizeTest(inCustom);

  return null;
}

