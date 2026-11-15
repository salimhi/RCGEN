import { GROQ_BASE_URL, GROQ_CALL_TIMEOUT_MS } from '../config.ts';
import {
  REVIEWER_SYSTEM_INSTRUCTION,
  buildReviewerPrompt,
  parseReviewerOutput,
  type ReviewerQuestionInput,
  type ReviewerQuestionResult
} from './verifier.ts';
import {
  isUsableGroqChatModel,
  resolveEffectiveGroqModel,
  resolveAutoGroqModel,
  isJsonModeSupported,
  setJsonModeUnsupported,
  isReasoningSupported,
  setReasoningUnsupported,
  markModelRateLimited,
  isModelRateLimited,
  setSessionLiveModels,
  getSessionLiveModels,
  setRememberedPassingModel,
  getRememberedPassingModel,
  extractJsonFromText,
  formatGroqErrorMessage,
  GROQ_AUTO_PREFERENCE_ORDER,
  GROQ_MODEL_DEFAULT
} from './groqModels.ts';

export function scrubSecret(text: string, apiKey?: string): string {
  let out = text || '';
  if (apiKey && apiKey.length >= 8) {
    const esc = apiKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(esc, 'g'), '[REDACTED]');
  }
  return out.replace(/gsk_[0-9A-Za-z]{20,}/g, '[REDACTED]').replace(/AIza[0-9A-Za-z-_]{20,}/g, '[REDACTED]');
}

// Module-level in-memory state: remembers if Groq failed during this browser session
let groqSessionFailed = false;

export function isGroqSessionFailed(): boolean {
  return groqSessionFailed;
}

export function setGroqSessionFailed(failed: boolean = true): void {
  groqSessionFailed = failed;
}

export function resetGroqSessionFailed(): void {
  groqSessionFailed = false;
}

export interface GroqReviewOptions {
  apiKey: string;
  passage: string;
  inputs: ReviewerQuestionInput[];
  model?: string;
  signal?: AbortSignal;
  examType?: 'CAT' | 'GMAT';
  isAutoMode?: boolean;
}

export interface GroqTestResult {
  ok: boolean;
  message: string;
  models?: string[];
  testedModel?: string;
  checks?: {
    keyAccepted: boolean;
    modelAvailable: boolean;
    chatCompletionPassed: boolean;
  };
  httpStatus?: number;
}

/**
 * Runs a small test completion against Groq using JSON mode.
 * Uses a token budget of at least 300 tokens and checks that {"ok": true} is returned.
 */
async function testModelCompletion(
  apiKey: string,
  model: string,
  signal?: AbortSignal
): Promise<{ ok: boolean; message: string; httpStatus?: number; formatFallback?: boolean }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Groq test request timed out after ${GROQ_CALL_TIMEOUT_MS / 1000}s`));
  }, GROQ_CALL_TIMEOUT_MS);

  const abortHandler = () => {
    clearTimeout(timeoutId);
    controller.abort(new Error('User aborted'));
  };
  if (signal) signal.addEventListener('abort', abortHandler, { once: true });

  const useJsonMode = isJsonModeSupported(model);
  const payload: any = {
    model,
    messages: [
      {
        role: 'system',
        content: 'You are a test assistant. You must return valid JSON only.'
      },
      {
        role: 'user',
        content: 'Return a JSON object with {"ok": true}.'
      }
    ],
    max_tokens: 300,
    temperature: 0
  };

  const useReasoning = model.includes('gpt-oss') && isReasoningSupported(model);

  if (useJsonMode) {
    payload.response_format = { type: 'json_object' };
  }
  if (useReasoning) {
    payload.reasoning_format = 'parsed';
    payload.reasoning_effort = 'low';
  }

  try {
    let res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    // Check if 400 is due to reasoning parameters or response_format
    let formatFallback = false;
    if (!res.ok && res.status === 400) {
      const errText = await res.text().catch(() => '');
      let modified = false;

      if (/reasoning_format|reasoning_effort|include_reasoning/i.test(errText)) {
        setReasoningUnsupported(model);
        delete payload.reasoning_format;
        delete payload.reasoning_effort;
        modified = true;
      }

      if (/response_format|json/i.test(errText) && useJsonMode) {
        setJsonModeUnsupported(model);
        delete payload.response_format;
        formatFallback = true;
        modified = true;
      }

      if (modified) {
        res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey.trim()}`
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
      } else {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', abortHandler);
        const scrubbed = scrubSecret(errText.slice(0, 200), apiKey);
        return {
          ok: false,
          message: `Model ${model} rejected request (HTTP 400): ${scrubbed}`,
          httpStatus: 400
        };
      }
    }

    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', abortHandler);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const scrubbed = scrubSecret(errText.slice(0, 200), apiKey);
      return {
        ok: false,
        message: `Model ${model} error (HTTP ${res.status}): ${scrubbed || res.statusText}`,
        httpStatus: res.status
      };
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return {
        ok: false,
        message: `Model ${model} returned an empty response.`,
        httpStatus: 200
      };
    }

    let parsed: any;
    try {
      parsed = extractJsonFromText(content);
    } catch {
      return {
        ok: false,
        message: `Model ${model} did not return valid JSON.`,
        httpStatus: 200
      };
    }

    if (parsed && (parsed.ok === true || parsed.ok === 'true')) {
      return {
        ok: true,
        message: formatFallback
          ? `Test completion passed (JSON parsed without response_format).`
          : `Test completion passed in JSON mode.`,
        httpStatus: 200,
        formatFallback
      };
    }

    return {
      ok: false,
      message: `Model ${model} returned JSON without expected ok: true.`,
      httpStatus: 200
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (signal) signal.removeEventListener('abort', abortHandler);
    if (signal?.aborted || err.name === 'AbortError') {
      return { ok: false, message: 'Test cancelled.' };
    }
    return {
      ok: false,
      message: `Test completion failed: ${scrubSecret(err.message, apiKey)}`
    };
  }
}

/**
 * Tests Groq API key validity and model readiness:
 * (a) Key accepted (GET /models)
 * (b) Model is in the list and usable
 * (c) Small chat completion with JSON-mode response_format and at least 300 tokens budget.
 *
 * For "Auto", tests candidates in preference order, stopping at first that passes (max 3 tries).
 */
export async function testGroqKey(
  apiKey: string,
  selectedModel: string = 'Auto',
  signal?: AbortSignal
): Promise<GroqTestResult> {
  const cleanKey = apiKey.trim();
  if (!cleanKey) {
    return { ok: false, message: 'Please enter a Groq API key.' };
  }

  // Check (a): Key accepted
  let usableModels: string[] = [];
  try {
    const res = await fetch(`${GROQ_BASE_URL}/models`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanKey}`
      },
      signal
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const formatted = formatGroqErrorMessage({ httpStatus: res.status, message: errText }, cleanKey);
      return {
        ok: false,
        message: formatted.message,
        httpStatus: res.status,
        checks: {
          keyAccepted: false,
          modelAvailable: false,
          chatCompletionPassed: false
        }
      };
    }

    const data = await res.json();
    const rawList = Array.isArray(data?.data)
      ? data.data.map((m: any) => String(m.id || '')).filter(Boolean)
      : [];

    usableModels = rawList.filter(isUsableGroqChatModel);
    setSessionLiveModels(usableModels);
  } catch (err: any) {
    if (signal?.aborted || err.name === 'AbortError') {
      return { ok: false, message: 'Test cancelled.' };
    }
    const formatted = formatGroqErrorMessage(err, scrubSecret(err.message, cleanKey));
    return {
      ok: false,
      message: formatted.message,
      checks: {
        keyAccepted: false,
        modelAvailable: false,
        chatCompletionPassed: false
      }
    };
  }

  // Determine which model(s) to test
  const isAuto = !selectedModel || selectedModel.trim().toLowerCase() === 'auto';
  let candidatesToTry: string[] = [];

  if (isAuto) {
    // Candidates in preference order that exist in usableModels, up to 3 tries
    for (const pref of GROQ_AUTO_PREFERENCE_ORDER) {
      if (usableModels.includes(pref)) {
        candidatesToTry.push(pref);
      }
    }
    // If none of the top 4 are in usableModels, append first usable models
    if (candidatesToTry.length === 0) {
      candidatesToTry = usableModels.slice(0, 3);
    } else {
      candidatesToTry = candidatesToTry.slice(0, 3);
    }
  } else {
    candidatesToTry = [selectedModel.trim()];
  }

  if (candidatesToTry.length === 0) {
    return {
      ok: false,
      message: 'Key accepted, but no usable chat models were found in your Groq account.',
      models: usableModels,
      checks: {
        keyAccepted: true,
        modelAvailable: false,
        chatCompletionPassed: false
      }
    };
  }

  // Test candidates
  let lastFailureMsg = '';
  let lastHttpStatus: number | undefined;

  for (const modelToTest of candidatesToTry) {
    // Check (b): Model in list and usable
    const inList = usableModels.includes(modelToTest);
    const usable = isUsableGroqChatModel(modelToTest);

    if (!usable) {
      return {
        ok: false,
        message: `Model "${modelToTest}" is a non-chat or safety classifier model and cannot be used for review.`,
        models: usableModels,
        testedModel: modelToTest,
        checks: {
          keyAccepted: true,
          modelAvailable: false,
          chatCompletionPassed: false
        }
      };
    }

    if (!inList && !isAuto) {
      return {
        ok: false,
        message: `Model "${modelToTest}" is not in the list of accessible models for your Groq key.`,
        models: usableModels,
        testedModel: modelToTest,
        checks: {
          keyAccepted: true,
          modelAvailable: false,
          chatCompletionPassed: false
        }
      };
    }

    // Check (c): Real chat completion
    const compResult = await testModelCompletion(cleanKey, modelToTest, signal);
    if (compResult.ok) {
      setRememberedPassingModel(modelToTest);
      return {
        ok: true,
        message: isAuto
          ? `Key verified and Auto resolved to ${modelToTest} (Key accepted; Model available; ${compResult.message}).`
          : `Groq key and model ${modelToTest} verified successfully (Key accepted; Model available; ${compResult.message}).`,
        models: usableModels,
        testedModel: modelToTest,
        checks: {
          keyAccepted: true,
          modelAvailable: true,
          chatCompletionPassed: true
        },
        httpStatus: 200
      };
    } else {
      lastFailureMsg = compResult.message;
      lastHttpStatus = compResult.httpStatus;
    }
  }

  return {
    ok: false,
    message: isAuto
      ? `Key accepted and models listed, but chat completion check failed on candidates: ${lastFailureMsg}`
      : `Key accepted, but chat completion failed for ${selectedModel}: ${lastFailureMsg}`,
    models: usableModels,
    testedModel: candidatesToTry[0],
    checks: {
      keyAccepted: true,
      modelAvailable: true,
      chatCompletionPassed: false
    },
    httpStatus: lastHttpStatus
  };
}

/**
 * Executes a single Groq chat completion request.
 * Never sends a review request to a safety/non-chat model.
 * Uses only response_format {"type": "json_object"} and retries once without response_format
 * if Groq answers HTTP 400 mentioning response_format or JSON.
 * Retries without reasoning parameters if Groq answers HTTP 400 mentioning reasoning.
 * Handles finish_reason "length" with a retry at higher token limit.
 */
async function callGroqChat(
  apiKey: string,
  model: string,
  userPrompt: string,
  userSignal?: AbortSignal,
  maxTokens: number = 3072
): Promise<string> {
  if (!isUsableGroqChatModel(model)) {
    const error: any = new Error(`Model "${model}" is not a usable chat model on Groq.`);
    error.httpStatus = 400;
    error.isSafetyModel = true;
    throw error;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Groq API request timed out after ${GROQ_CALL_TIMEOUT_MS / 1000}s`));
  }, GROQ_CALL_TIMEOUT_MS);

  const abortHandler = () => {
    clearTimeout(timeoutId);
    controller.abort(new Error('User aborted'));
  };

  if (userSignal) userSignal.addEventListener('abort', abortHandler, { once: true });

  const useJsonMode = isJsonModeSupported(model);
  const useReasoning = model.includes('gpt-oss') && isReasoningSupported(model);

  const requestBody: any = {
    model,
    messages: [
      { role: 'system', content: REVIEWER_SYSTEM_INSTRUCTION },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0,
    max_tokens: maxTokens
  };

  if (useJsonMode) {
    requestBody.response_format = { type: 'json_object' };
  }
  if (useReasoning) {
    requestBody.reasoning_format = 'parsed';
    requestBody.reasoning_effort = 'low';
  }

  try {
    let res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    // Check if 400 error is due to reasoning parameters or response_format
    if (!res.ok && res.status === 400) {
      const errText = await res.text().catch(() => '');
      let modified = false;

      if (/reasoning_format|reasoning_effort|include_reasoning/i.test(errText)) {
        setReasoningUnsupported(model);
        delete requestBody.reasoning_format;
        delete requestBody.reasoning_effort;
        modified = true;
      }

      if (/response_format|json/i.test(errText) && useJsonMode) {
        setJsonModeUnsupported(model);
        delete requestBody.response_format;
        modified = true;
      }

      if (modified) {
        res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey.trim()}`
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });
      } else {
        clearTimeout(timeoutId);
        if (userSignal) userSignal.removeEventListener('abort', abortHandler);
        const scrubbed = scrubSecret(errText.slice(0, 200), apiKey);
        const error: any = new Error(scrubbed || 'Groq API error (HTTP 400)');
        error.httpStatus = 400;
        throw error;
      }
    }

    clearTimeout(timeoutId);
    if (userSignal) userSignal.removeEventListener('abort', abortHandler);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      const scrubbed = scrubSecret(errText.slice(0, 200), apiKey);
      const error: any = new Error(scrubbed || `Groq API error (HTTP ${res.status})`);
      error.httpStatus = res.status;
      throw error;
    }

    const data = await res.json();
    const choice = data?.choices?.[0];
    const finishReason = choice?.finish_reason;
    const content = choice?.message?.content;

    // Check for token limit exhaustion (finish_reason: length)
    if (finishReason === 'length' || (!content && finishReason === 'length')) {
      if (maxTokens < 6144) {
        // Retry once with a higher token limit
        return await callGroqChat(apiKey, model, userPrompt, userSignal, 6144);
      }
      const tokenError: any = new Error('Groq response reached maximum completion token limit before completing.');
      tokenError.finishReason = 'MAX_TOKENS';
      tokenError.isTokenLimit = true;
      tokenError.httpStatus = 200;
      throw tokenError;
    }

    if (!content) {
      throw new Error('Groq returned an empty response');
    }
    return content;
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (userSignal) userSignal.removeEventListener('abort', abortHandler);
    throw err;
  }
}

/**
 * Runs the blind review pass via Groq.
 * In Auto mode only, if the first model returns 429, tries the next usable model in Auto order once.
 * An explicitly chosen model never moves to another model.
 * Retries once ONLY on malformed JSON or token limit.
 */
export async function reviewQuestionsWithGroq(
  options: GroqReviewOptions
): Promise<ReviewerQuestionResult[]> {
  const { apiKey, passage, inputs, model = GROQ_MODEL_DEFAULT, signal, examType, isAutoMode } = options;
  const isAuto = !model || model.trim().toLowerCase() === 'auto' || Boolean(isAutoMode);
  const modelsTried: string[] = [];

  let currentModel = resolveEffectiveGroqModel(model, getSessionLiveModels());
  modelsTried.push(currentModel);

  if (!isUsableGroqChatModel(currentModel)) {
    const error: any = new Error(`Model "${currentModel}" is not a usable chat model on Groq.`);
    error.httpStatus = 400;
    error.isSafetyModel = true;
    error.modelsTried = modelsTried;
    error.groqModel = currentModel;
    throw error;
  }

  const userPrompt = buildReviewerPrompt(passage, inputs, examType);

  let rawJson: string;
  try {
    rawJson = await callGroqChat(apiKey, currentModel, userPrompt, signal);
  } catch (err: any) {
    if (err.httpStatus === 429 && isAuto) {
      markModelRateLimited(currentModel, 60_000);
      const nextCandidate = resolveAutoGroqModel(getSessionLiveModels(), [currentModel]);
      if (nextCandidate && nextCandidate !== currentModel && isUsableGroqChatModel(nextCandidate)) {
        currentModel = nextCandidate;
        modelsTried.push(currentModel);
        try {
          rawJson = await callGroqChat(apiKey, currentModel, userPrompt, signal);
        } catch (retryErr: any) {
          if (retryErr.httpStatus === 429) {
            markModelRateLimited(currentModel, 60_000);
          }
          retryErr.modelsTried = modelsTried;
          retryErr.groqModel = currentModel;
          throw retryErr;
        }
      } else {
        err.modelsTried = modelsTried;
        err.groqModel = currentModel;
        throw err;
      }
    } else {
      if (err.httpStatus === 429) {
        markModelRateLimited(currentModel, 60_000);
      }
      err.modelsTried = modelsTried;
      err.groqModel = currentModel;
      throw err;
    }
  }

  let results: ReviewerQuestionResult[];
  try {
    results = parseReviewerOutput(rawJson);
  } catch {
    // Retry once on malformed JSON
    const retryJson = await callGroqChat(
      apiKey,
      currentModel,
      userPrompt + '\n\nIMPORTANT: Return valid JSON matching the schema.',
      signal
    );
    results = parseReviewerOutput(retryJson);
  }

  const returnList: any = results;
  returnList.modelsTried = modelsTried;
  returnList.modelUsed = currentModel;

  return returnList;
}
