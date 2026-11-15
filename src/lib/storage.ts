import type { RCTest, RCAttempt } from '../types.ts';
import { GEMINI_MODEL, GROQ_MODEL_DEFAULT } from '../config.ts';

export const STORAGE_KEYS = {
  PROFILE: 'practicerc.v1.profile',
  GEMINI_KEY: 'practicerc.v1.geminiKey',
  GEMINI_MODEL: 'practicerc.v1.geminiModel',
  GROQ_KEY: 'practicerc.v1.groqKey',
  GROQ_MODEL: 'practicerc.v1.groqModel',
  USE_GROQ: 'practicerc.v1.useGroq',
  DOUBLE_CHECK: 'practicerc.v1.doubleCheck',
  CUSTOM_TESTS: 'practicerc.v1.customTests',
  ATTEMPTS: 'practicerc.v1.attempts',
  LAST_PLANS: 'practicerc.v1.lastPlans',
} as const;

export interface UserProfile {
  displayName: string;
}

// In-memory fallback for environments where localStorage is blocked
const memoryStore: Record<string, string> = {};
let isStorageAvailable: boolean | null = null;

export function checkStorageAvailable(): boolean {
  if (isStorageAvailable !== null) return isStorageAvailable;
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    isStorageAvailable = true;
  } catch {
    console.warn('[Storage] localStorage is not available. Using in-memory fallback.');
    isStorageAvailable = false;
  }
  return isStorageAvailable;
}

function getItem(key: string): string | null {
  if (checkStorageAvailable()) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return memoryStore[key] || null;
    }
  }
  return memoryStore[key] || null;
}

function setItem(key: string, value: string): void {
  if (checkStorageAvailable()) {
    try {
      window.localStorage.setItem(key, value);
      return;
    } catch (e) {
      if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22)) {
        console.warn('[Storage] QuotaExceededError encountered. Pruning older custom tests and attempts.');
        pruneStorage();
        try {
          window.localStorage.setItem(key, value);
          return;
        } catch {
          memoryStore[key] = value;
          return;
        }
      }
    }
  }
  memoryStore[key] = value;
}

function removeItem(key: string): void {
  if (checkStorageAvailable()) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      delete memoryStore[key];
    }
  }
  delete memoryStore[key];
}

function pruneStorage(): void {
  try {
    const tests = getCustomTests();
    if (tests.length > 50) {
      const pruned = tests.slice(0, 50);
      window.localStorage.setItem(STORAGE_KEYS.CUSTOM_TESTS, JSON.stringify(pruned));
    }
    const attempts = getAttempts();
    if (attempts.length > 100) {
      const prunedAttempts = attempts.slice(0, 100);
      window.localStorage.setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(prunedAttempts));
    }
  } catch {
    // ignore
  }
}

// Profile
export function getProfile(): UserProfile {
  try {
    const raw = getItem(STORAGE_KEYS.PROFILE);
    if (!raw) return { displayName: 'Aspirant' };
    const parsed = JSON.parse(raw);
    return { displayName: parsed.displayName || 'Aspirant' };
  } catch {
    return { displayName: 'Aspirant' };
  }
}

export function saveProfile(profile: UserProfile): void {
  setItem(STORAGE_KEYS.PROFILE, JSON.stringify(profile));
}

// Gemini API Key & Model
export function getGeminiKey(): string {
  try {
    return getItem(STORAGE_KEYS.GEMINI_KEY) || '';
  } catch {
    return '';
  }
}

export function saveGeminiKey(key: string): void {
  setItem(STORAGE_KEYS.GEMINI_KEY, key.trim());
}

export function clearGeminiKey(): void {
  removeItem(STORAGE_KEYS.GEMINI_KEY);
}

export function getGeminiModel(): string {
  return getItem(STORAGE_KEYS.GEMINI_MODEL) || GEMINI_MODEL;
}

export function saveGeminiModel(model: string): void {
  setItem(STORAGE_KEYS.GEMINI_MODEL, model.trim());
}

// Groq API Key & Model
export function getGroqKey(): string {
  try {
    return getItem(STORAGE_KEYS.GROQ_KEY) || '';
  } catch {
    return '';
  }
}

export function saveGroqKey(key: string): void {
  setItem(STORAGE_KEYS.GROQ_KEY, key.trim());
}

export function clearGroqKey(): void {
  removeItem(STORAGE_KEYS.GROQ_KEY);
}

export function getGroqModel(): string {
  return getItem(STORAGE_KEYS.GROQ_MODEL) || GROQ_MODEL_DEFAULT;
}

export function saveGroqModel(model: string): void {
  setItem(STORAGE_KEYS.GROQ_MODEL, model.trim());
}

export function getUseGroq(): boolean {
  const val = getItem(STORAGE_KEYS.USE_GROQ);
  return val === null ? true : val === 'true';
}

export function saveUseGroq(enabled: boolean): void {
  setItem(STORAGE_KEYS.USE_GROQ, String(enabled));
}

export function getDoubleCheck(): boolean {
  const val = getItem(STORAGE_KEYS.DOUBLE_CHECK);
  return val === null ? true : val === 'true';
}

export function saveDoubleCheck(enabled: boolean): void {
  setItem(STORAGE_KEYS.DOUBLE_CHECK, String(enabled));
}

// Custom Tests
export function getCustomTests(): RCTest[] {
  try {
    const raw = getItem(STORAGE_KEYS.CUSTOM_TESTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveCustomTest(test: RCTest): void {
  const tests = getCustomTests();
  const updated = [test, ...tests.filter((t) => String(t.id) !== String(test.id))];
  setItem(STORAGE_KEYS.CUSTOM_TESTS, JSON.stringify(updated));
}

export function deleteCustomTest(id: string | number): void {
  const tests = getCustomTests();
  const filtered = tests.filter((t) => String(t.id) !== String(id));
  setItem(STORAGE_KEYS.CUSTOM_TESTS, JSON.stringify(filtered));
}

// Attempts
export function getAttempts(): RCAttempt[] {
  try {
    const raw = getItem(STORAGE_KEYS.ATTEMPTS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAttempt(attempt: RCAttempt): void {
  const attempts = getAttempts();
  const updated = [attempt, ...attempts.filter((a) => String(a.id) !== String(attempt.id))];
  setItem(STORAGE_KEYS.ATTEMPTS, JSON.stringify(updated));
}

// Erase all user data (including Groq and model settings)
export function eraseAllData(): void {
  removeItem(STORAGE_KEYS.PROFILE);
  removeItem(STORAGE_KEYS.GEMINI_KEY);
  removeItem(STORAGE_KEYS.GEMINI_MODEL);
  removeItem(STORAGE_KEYS.GROQ_KEY);
  removeItem(STORAGE_KEYS.GROQ_MODEL);
  removeItem(STORAGE_KEYS.USE_GROQ);
  removeItem(STORAGE_KEYS.DOUBLE_CHECK);
  removeItem(STORAGE_KEYS.CUSTOM_TESTS);
  removeItem(STORAGE_KEYS.ATTEMPTS);
  removeItem(STORAGE_KEYS.LAST_PLANS);
  for (const k of Object.keys(memoryStore)) {
    delete memoryStore[k];
  }
}

export function generateCustomTestId(): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).substring(2, 8);
  return `u-${ts}-${rand}`;
}
