/**
 * src/lib/groqModels.ts
 * Shared utilities for Groq model validation, auto-preference ordering,
 * session memory, and error formatting. Usable from browser and Node.js.
 */

export const EXCLUDED_MODEL_PATTERNS = [
  /whisper/i,
  /tts/i,
  /orpheus/i,
  /guard/i,
  /safeguard/i,
  /embed/i,
  /moderation/i
];

/**
 * Validates whether a Groq model id is a usable general chat/instruction model.
 * Excludes whisper, tts, orpheus, guard, safeguard, embed, moderation.
 */
export function isUsableGroqChatModel(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') return false;
  const trimmed = id.trim();
  if (!trimmed) return false;
  if (trimmed.toLowerCase() === 'auto') return true;
  return !EXCLUDED_MODEL_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Preferred candidate models for "Auto", in strict priority order.
 */
export const GROQ_AUTO_PREFERENCE_ORDER = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'llama-3.1-8b-instant'
];

/**
 * Starting models shown in Profile modal before user runs "Test my Groq key".
 */
export const GROQ_STARTING_MODELS = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant'
];

export const GROQ_MODEL_DEFAULT = 'Auto';

// Module-level in-memory state (session only)
let rememberedPassingModel: string | null = null;
let sessionLiveModels: string[] | null = null;
const unsupportedJsonModeModels = new Set<string>();
const unsupportedReasoningModels = new Set<string>();
const rateLimitedModels = new Map<string, number>();

export function getRememberedPassingModel(): string | null {
  return rememberedPassingModel;
}

export function setRememberedPassingModel(model: string | null): void {
  rememberedPassingModel = model;
}

export function getSessionLiveModels(): string[] | null {
  return sessionLiveModels;
}

export function setSessionLiveModels(models: string[] | null): void {
  if (models) {
    sessionLiveModels = models.filter(isUsableGroqChatModel);
  } else {
    sessionLiveModels = null;
  }
}

export function isJsonModeSupported(model: string): boolean {
  return !unsupportedJsonModeModels.has(model);
}

export function setJsonModeUnsupported(model: string): void {
  unsupportedJsonModeModels.add(model);
}

export function isReasoningSupported(model: string): boolean {
  return !unsupportedReasoningModels.has(model);
}

export function setReasoningUnsupported(model: string): void {
  unsupportedReasoningModels.add(model);
}

export function markModelRateLimited(model: string, durationMs: number = 60_000): void {
  rateLimitedModels.set(model, Date.now() + durationMs);
}

export function isModelRateLimited(model: string): boolean {
  const expires = rateLimitedModels.get(model);
  if (!expires) return false;
  if (Date.now() >= expires) {
    rateLimitedModels.delete(model);
    return false;
  }
  return true;
}

export function clearRateLimitedModels(): void {
  rateLimitedModels.clear();
}

export function resetGroqModelSession(): void {
  rememberedPassingModel = null;
  sessionLiveModels = null;
  unsupportedJsonModeModels.clear();
  unsupportedReasoningModels.clear();
  rateLimitedModels.clear();
}

/**
 * Resolves "Auto" to a concrete model ID:
 * 1. Remembered passing model from "Test my Groq key" in this session (unless rate-limited or excluded).
 * 2. Best candidate from preference order available in liveModels (skipping rate-limited/excluded models).
 * 3. Default top candidate ('openai/gpt-oss-120b') or next available candidate.
 */
export function resolveAutoGroqModel(
  liveModels?: string[] | null,
  excludeModels?: string[]
): string {
  if (
    rememberedPassingModel &&
    isUsableGroqChatModel(rememberedPassingModel) &&
    !isModelRateLimited(rememberedPassingModel) &&
    (!excludeModels || !excludeModels.includes(rememberedPassingModel))
  ) {
    if (!liveModels || liveModels.length === 0 || liveModels.includes(rememberedPassingModel)) {
      return rememberedPassingModel;
    }
  }

  const pool = liveModels && liveModels.length > 0 ? liveModels : sessionLiveModels;
  if (pool && pool.length > 0) {
    for (const pref of GROQ_AUTO_PREFERENCE_ORDER) {
      if (
        pool.includes(pref) &&
        isUsableGroqChatModel(pref) &&
        !isModelRateLimited(pref) &&
        (!excludeModels || !excludeModels.includes(pref))
      ) {
        return pref;
      }
    }
    const firstUsable = pool.find(
      (m) =>
        isUsableGroqChatModel(m) &&
        !isModelRateLimited(m) &&
        (!excludeModels || !excludeModels.includes(m))
    );
    if (firstUsable) return firstUsable;
  }

  for (const pref of GROQ_AUTO_PREFERENCE_ORDER) {
    if (!isModelRateLimited(pref) && (!excludeModels || !excludeModels.includes(pref))) {
      return pref;
    }
  }

  return GROQ_AUTO_PREFERENCE_ORDER[0];
}

/**
 * Resolves the effective Groq model to send in a request.
 */
export function resolveEffectiveGroqModel(
  requestedModel?: string | null,
  liveModels?: string[] | null,
  excludeModels?: string[]
): string {
  if (!requestedModel || requestedModel.trim().toLowerCase() === 'auto') {
    return resolveAutoGroqModel(liveModels, excludeModels);
  }
  const clean = requestedModel.trim();
  if (!isUsableGroqChatModel(clean)) {
    return resolveAutoGroqModel(liveModels, excludeModels);
  }
  return clean;
}

/**
 * Robust JSON extractor that strips markdown fences (```json ... ```)
 * or extracts outermost JSON object/array from noisy text.
 */
export function extractJsonFromText(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty response');
  }

  const trimmed = rawText.trim();

  // 1. Direct parse attempt
  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue
  }

  // 2. Strip code fences (```json ... ``` or ``` ... ```)
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch {
      // Continue
    }
  }

  // 3. Extract outermost { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    } catch {
      // Continue
    }
  }

  // 4. Extract outermost [ ... ]
  const firstBracket = trimmed.indexOf('[');
  const lastBracket = trimmed.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket > firstBracket) {
    try {
      return JSON.parse(trimmed.slice(firstBracket, lastBracket + 1));
    } catch {
      // Continue
    }
  }

  throw new Error('Could not parse valid JSON from text');
}

/**
 * Classifies and formats Groq error messages by HTTP status class.
 * Never reports "Your browser could not reach Groq" when an HTTP status was returned.
 */
export function formatGroqErrorMessage(
  err: any,
  sanitizedMessage?: string
): { message: string; failureClass: string; httpStatus?: number } {
  const status = err?.httpStatus || err?.status;
  const rawMsg = sanitizedMessage || err?.message || '';

  if (!status) {
    return {
      message: 'Your browser could not reach Groq.',
      failureClass: 'network_or_blocked'
    };
  }

  if (status === 400) {
    return {
      message: `Groq rejected the request (HTTP 400): ${rawMsg}. Pick another model in the Profile.`,
      failureClass: 'rejected_400',
      httpStatus: 400
    };
  }

  if (status === 401 || status === 403) {
    return {
      message: 'Groq did not accept your key.',
      failureClass: 'auth_failed',
      httpStatus: status
    };
  }

  if (status === 404) {
    return {
      message: 'Groq does not have that model.',
      failureClass: 'model_not_found',
      httpStatus: 404
    };
  }

  if (status === 429) {
    return {
      message: "Groq's free limit is used up for now.",
      failureClass: 'rate_limited',
      httpStatus: 429
    };
  }

  return {
    message: `Groq error (HTTP ${status}): ${rawMsg}`,
    failureClass: `http_${status}`,
    httpStatus: status
  };
}
