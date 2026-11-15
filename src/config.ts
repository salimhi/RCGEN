import {
  GROQ_MODEL_DEFAULT as GROQ_MODEL_DEFAULT_VAL,
  GROQ_STARTING_MODELS
} from './lib/groqModels.ts';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';
export const VERIFIER_MODEL = 'gemini-3.5-flash-lite';
export const GEMINI_API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const TESTED_GROQ_MODELS = GROQ_STARTING_MODELS;
export const GROQ_MODEL_DEFAULT = GROQ_MODEL_DEFAULT_VAL; // 'Auto'

export const TOTAL_PIPELINE_TIMEOUT_MS = 60000;
export const GEMINI_CALL_TIMEOUT_MS = 30000;
export const GROQ_CALL_TIMEOUT_MS = 20000;
export const GEMINI_REQUEST_TIMEOUT_MS = 30000;

/**
 * Question Set Theme & Distractor Quality Thresholds:
 * All numeric thresholds used in quality checks are centralized here for easy tuning.
 */

// Direct paraphrase: maximum share of correct option's content words in a single passage sentence
export const COPY_LIKE_OVERLAP = 0.7;

// Maximum allowed copy-like questions per test set before surplus questions are repaired
export const MAX_COPY_LIKE_CAT = 1;
export const MAX_COPY_LIKE_GMAT = 2;

// Plausibility: reviewer obviouslyWrongLetters threshold. Questions with more than this number go to repair.
export const MAX_OBVIOUS_WRONG = 1;

// Content word definition: minimum character length for lexical plausibility and overlap checks
export const MIN_CONTENT_WORD_LEN = 5;

// Maximum words permitted in a distractor's 'tempting' rationale
export const MAX_TEMPTING_WORDS = 15;
