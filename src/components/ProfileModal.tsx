import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Eye,
  EyeOff,
  ShieldCheck,
  ExternalLink,
  Trash2,
  User,
  Save,
  Check,
  Sparkles,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { useProfile } from '../contexts/ProfileContext';
import { testGeminiKey } from '../lib/geminiClient';
import { testGroqKey, isGroqSessionFailed, resetGroqSessionFailed } from '../lib/groqClient';
import { GEMINI_MODEL, GROQ_MODEL_DEFAULT } from '../config';
import {
  GROQ_STARTING_MODELS,
  isUsableGroqChatModel,
  getSessionLiveModels
} from '../lib/groqModels';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const {
    displayName,
    geminiKey,
    hasGeminiKey,
    geminiModel,
    groqKey,
    hasGroqKey,
    groqModel,
    useGroq,
    setDisplayName,
    setGeminiKey,
    setGeminiModel,
    clearGeminiKey,
    setGroqKey,
    setGroqModel,
    setUseGroq,
    clearGroqKey,
    eraseAllData
  } = useProfile();

  const [inputName, setInputName] = useState(displayName);
  const [inputGeminiKey, setInputGeminiKey] = useState(geminiKey);
  const [inputGeminiModel, setInputGeminiModel] = useState(geminiModel);
  const [inputGroqKey, setInputGroqKey] = useState(groqKey);
  const [inputGroqModel, setInputGroqModel] = useState(groqModel);
  const [inputUseGroq, setInputUseGroq] = useState(useGroq);

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showAdvancedGemini, setShowAdvancedGemini] = useState(false);
  const [showAdvancedGroq, setShowAdvancedGroq] = useState(false);

  const [savedFeedback, setSavedFeedback] = useState(false);
  const [modelNotice, setModelNotice] = useState<string | null>(null);

  // Key testing state
  const [testingGemini, setTestingGemini] = useState(false);
  const [geminiTestMsg, setGeminiTestMsg] = useState<{ ok: boolean; text: string; models?: string[] } | null>(null);

  const [testingGroq, setTestingGroq] = useState(false);
  const [groqTestMsg, setGroqTestMsg] = useState<{ ok: boolean; text: string; models?: string[] } | null>(null);

  // Confirmations
  const [confirmRemoveGemini, setConfirmRemoveGemini] = useState(false);
  const [confirmRemoveGroq, setConfirmRemoveGroq] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setInputName(displayName);
      setInputGeminiKey(geminiKey);
      setInputGeminiModel(geminiModel || GEMINI_MODEL);
      setInputGroqKey(groqKey);

      const savedModel = groqModel || GROQ_MODEL_DEFAULT;
      const live = getSessionLiveModels();
      let activeModel = savedModel;
      let notice: string | null = null;

      if (!isUsableGroqChatModel(savedModel)) {
        activeModel = GROQ_MODEL_DEFAULT;
        notice = `Your saved model ${savedModel} is not available, so Auto is used.`;
        setGroqModel(GROQ_MODEL_DEFAULT);
      } else if (live && live.length > 0 && savedModel !== GROQ_MODEL_DEFAULT && !live.includes(savedModel)) {
        activeModel = GROQ_MODEL_DEFAULT;
        notice = `Your saved model ${savedModel} is not available, so Auto is used.`;
        setGroqModel(GROQ_MODEL_DEFAULT);
      }

      setInputGroqModel(activeModel);
      setModelNotice(notice);
      setInputUseGroq(useGroq);
      setShowGeminiKey(false);
      setShowGroqKey(false);
      setSavedFeedback(false);
      setGeminiTestMsg(null);
      setGroqTestMsg(null);
      setConfirmRemoveGemini(false);
      setConfirmRemoveGroq(false);
      setConfirmErase(false);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, displayName, geminiKey, geminiModel, groqKey, groqModel, useGroq]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSaveAll = (e: React.FormEvent) => {
    e.preventDefault();
    setDisplayName(inputName);
    setGeminiKey(inputGeminiKey);
    setGeminiModel(inputGeminiModel);
    setGroqKey(inputGroqKey);
    setGroqModel(inputGroqModel);
    setUseGroq(inputUseGroq);
    setSavedFeedback(true);
    setTimeout(() => {
      setSavedFeedback(false);
    }, 2000);
  };

  const handleTestGemini = async () => {
    if (!inputGeminiKey.trim()) {
      setGeminiTestMsg({ ok: false, text: 'Please enter a Gemini API key first.' });
      return;
    }
    setTestingGemini(true);
    setGeminiTestMsg(null);
    try {
      const res = await testGeminiKey(inputGeminiKey);
      if (res.ok) {
        setGeminiTestMsg({
          ok: true,
          text: `Success: Key verified. ${res.models?.length || 0} models available.`,
          models: res.models
        });
      } else {
        setGeminiTestMsg({
          ok: false,
          text: res.httpStatus === 404
            ? 'Endpoint returned 404: The model in use may not be accessible with this key. Please select a supported model.'
            : res.message
        });
      }
    } catch (err: any) {
      setGeminiTestMsg({ ok: false, text: err.message || 'Verification failed.' });
    } finally {
      setTestingGemini(false);
    }
  };

  const handleTestGroq = async () => {
    resetGroqSessionFailed();
    if (!inputGroqKey.trim()) {
      setGroqTestMsg({ ok: false, text: 'Please enter a Groq API key first.' });
      return;
    }
    setTestingGroq(true);
    setGroqTestMsg(null);
    try {
      const res = await testGroqKey(inputGroqKey, inputGroqModel);
      if (res.ok) {
        const available = res.models || [];
        setGroqTestMsg({
          ok: true,
          text: res.message,
          models: available
        });
        if (available.length > 0 && inputGroqModel !== 'Auto' && !available.includes(inputGroqModel)) {
          setModelNotice(`Your saved model ${inputGroqModel} is not available, so Auto is used.`);
          setInputGroqModel('Auto');
          setGroqModel('Auto');
        }
      } else {
        setGroqTestMsg({ ok: false, text: res.message });
      }
    } catch (err: any) {
      setGroqTestMsg({
        ok: false,
        text: err.message || 'Groq verification failed.'
      });
    } finally {
      setTestingGroq(false);
    }
  };

  const handleRemoveGeminiKey = () => {
    if (!confirmRemoveGemini) {
      setConfirmRemoveGemini(true);
      return;
    }
    clearGeminiKey();
    setInputGeminiKey('');
    setConfirmRemoveGemini(false);
  };

  const handleRemoveGroqKey = () => {
    resetGroqSessionFailed();
    if (!confirmRemoveGroq) {
      setConfirmRemoveGroq(true);
      return;
    }
    clearGroqKey();
    setInputGroqKey('');
    setConfirmRemoveGroq(false);
  };

  const handleEraseAll = () => {
    if (!confirmErase) {
      setConfirmErase(true);
      return;
    }
    eraseAllData();
    setInputName('Aspirant');
    setInputGeminiKey('');
    setInputGroqKey('');
    setConfirmErase(false);
    onClose();
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm overflow-y-auto touch-scroll"
      onClick={onClose}
      style={{ minHeight: '100vh', width: '100vw' }}
    >
      <div
        className="w-full max-w-xl rounded-2xl border p-4 sm:p-7 shadow-2xl space-y-5 sm:space-y-6 my-auto max-h-[92vh] overflow-y-auto touch-scroll"
        style={{
          backgroundColor: 'var(--color-surface)',
          borderColor: 'var(--color-border-strong)',
          color: 'var(--color-ink)',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-modal-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--color-primary-soft)',
                color: 'var(--color-primary)',
              }}
            >
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 id="profile-modal-title" className="font-display text-lg font-bold leading-tight">
                Profile &amp; Engine Settings
              </h2>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                100% Local-first: all keys and data stay inside your browser
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:opacity-75 cursor-pointer transition-colors"
            style={{ color: 'var(--color-text-soft)' }}
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSaveAll} className="space-y-6">
          {/* Section 1: Nickname */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider block" style={{ color: 'var(--color-text-muted)' }}>
              1. Nickname / Display Name
            </label>
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              placeholder="e.g. Aspirant"
              maxLength={40}
              className="w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all focus:border-[var(--color-primary)]"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-ink)',
              }}
            />
          </div>

          {/* Section 2: Gemini API Key */}
          <div className="space-y-2.5 p-4 rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-ink)' }}>
                <Sparkles className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
                <span>2. Google Gemini API Key</span>
              </label>
              {hasGeminiKey ? (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--color-correct-soft)',
                    color: 'var(--color-correct)',
                  }}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Saved
                </span>
              ) : (
                <span className="text-[11px]" style={{ color: 'var(--color-text-soft)' }}>
                  Rule algorithm used if blank
                </span>
              )}
            </div>

            <div className="relative flex items-center">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                value={inputGeminiKey}
                onChange={(e) => setInputGeminiKey(e.target.value)}
                placeholder="Paste Gemini API key (starts with AIza...)"
                autoComplete="off"
                spellCheck="false"
                className="w-full pl-3.5 pr-20 py-2.5 rounded-xl border text-sm font-mono outline-none transition-all focus:border-[var(--color-primary)]"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-ink)',
                }}
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowGeminiKey((prev) => !prev)}
                  className="p-1.5 rounded-lg hover:opacity-75 cursor-pointer text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                  title={showGeminiKey ? 'Hide key' : 'Show key'}
                >
                  {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Test Gemini Key Button & Message */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestGemini}
                disabled={testingGemini || !inputGeminiKey.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer hover:opacity-85 disabled:opacity-50 transition-colors"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-primary)'
                }}
              >
                {testingGemini ? 'Testing key...' : 'Test my Gemini key'}
              </button>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs inline-flex items-center gap-1 underline hover:opacity-80"
                style={{ color: 'var(--color-primary)' }}
              >
                Get a free key <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {geminiTestMsg && (
              <div
                className={`p-2.5 rounded-lg text-xs leading-relaxed border ${
                  geminiTestMsg.ok
                    ? 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                }`}
              >
                <p>{geminiTestMsg.text}</p>
                {geminiTestMsg.models && geminiTestMsg.models.length > 0 && (
                  <p className="mt-1 text-[11px] opacity-85">
                    Available: {geminiTestMsg.models.slice(0, 4).join(', ')}
                    {geminiTestMsg.models.length > 4 ? ` (+${geminiTestMsg.models.length - 4} more)` : ''}
                  </p>
                )}
              </div>
            )}

            {/* Advanced Gemini Model */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvancedGemini((prev) => !prev)}
                className="text-xs flex items-center gap-1 font-medium hover:opacity-80 cursor-pointer"
                style={{ color: 'var(--color-text-soft)' }}
              >
                <span>Advanced Gemini Settings</span>
                {showAdvancedGemini ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showAdvancedGemini && (
                <div className="mt-2 space-y-1">
                  <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--color-text-muted)' }}>
                    Gemini Model
                  </label>
                  <input
                    type="text"
                    value={inputGeminiModel}
                    onChange={(e) => setInputGeminiModel(e.target.value)}
                    placeholder="e.g. gemini-3.5-flash-lite"
                    className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none"
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-ink)'
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Groq API Key (Optional) */}
          <div className="space-y-2.5 p-4 rounded-xl border" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-2)' }}>
            <div className="flex items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-ink)' }}>
                <Zap className="w-3.5 h-3.5" style={{ color: 'var(--color-accent)' }} />
                <span>3. Groq API Key (Optional Reviewer)</span>
              </label>
              {hasGroqKey ? (
                <span
                  className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: 'var(--color-correct-soft)',
                    color: 'var(--color-correct)',
                  }}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Saved
                </span>
              ) : (
                <span className="text-[11px]" style={{ color: 'var(--color-text-soft)' }}>
                  Optional
                </span>
              )}
            </div>

            <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-soft)' }}>
              Optional. If you add a Groq key, your passage and the generated questions are sent to Groq for checking.
              The key stays in this browser. Remove it on shared computers.
            </p>

            <div className="relative flex items-center">
              <input
                type={showGroqKey ? 'text' : 'password'}
                value={inputGroqKey}
                onChange={(e) => {
                  setInputGroqKey(e.target.value);
                  resetGroqSessionFailed();
                }}
                placeholder="Paste Groq API key (starts with gsk_...)"
                autoComplete="off"
                spellCheck="false"
                className="w-full pl-3.5 pr-20 py-2.5 rounded-xl border text-sm font-mono outline-none transition-all focus:border-[var(--color-primary)]"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-ink)',
                }}
              />
              <div className="absolute right-2 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowGroqKey((prev) => !prev)}
                  className="p-1.5 rounded-lg hover:opacity-75 cursor-pointer text-xs"
                  style={{ color: 'var(--color-text-muted)' }}
                  title={showGroqKey ? 'Hide key' : 'Show key'}
                >
                  {showGroqKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Test Groq Key & Link */}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestGroq}
                disabled={testingGroq || !inputGroqKey.trim()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer hover:opacity-85 disabled:opacity-50 transition-colors"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-primary)'
                }}
              >
                {testingGroq ? 'Testing key...' : 'Test my Groq key'}
              </button>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs inline-flex items-center gap-1 underline hover:opacity-80"
                style={{ color: 'var(--color-primary)' }}
              >
                Get a free key <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            {/* Session failure notice */}
            {isGroqSessionFailed() && (
              <div
                className="p-3 rounded-xl border text-xs leading-relaxed space-y-1"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-ink)'
                }}
              >
                <div className="font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-accent)' }}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Session Notice</span>
                </div>
                <p>Groq was not reachable from this browser in this session, so Gemini is checking answers.</p>
              </div>
            )}

            {groqTestMsg && (
              <div
                className={`p-2.5 rounded-lg text-xs leading-relaxed border ${
                  groqTestMsg.ok
                    ? 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]'
                }`}
              >
                <p>{groqTestMsg.text}</p>
                {groqTestMsg.models && groqTestMsg.models.length > 0 && (
                  <p className="mt-1 text-[11px] opacity-85">
                    Selected model: <code>{inputGroqModel}</code>
                  </p>
                )}
              </div>
            )}

            {/* Toggle: Use Groq to double-check answers */}
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={inputUseGroq}
                onChange={(e) => setInputUseGroq(e.target.checked)}
                className="rounded accent-[var(--color-accent)] w-4 h-4 cursor-pointer"
              />
              <span className="text-xs font-semibold" style={{ color: 'var(--color-ink)' }}>
                Use Groq to double-check answers
              </span>
            </label>

            {/* Advanced Groq Model */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdvancedGroq((prev) => !prev)}
                className="text-xs flex items-center gap-1 font-medium hover:opacity-80 cursor-pointer"
                style={{ color: 'var(--color-text-soft)' }}
              >
                <span>Advanced Groq Settings</span>
                {showAdvancedGroq ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
              {showAdvancedGroq && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: 'var(--color-text-muted)' }}>
                      Groq Model
                    </label>
                    <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                      Saved: {groqModel || 'Auto'}
                    </span>
                  </div>

                  {modelNotice && (
                    <div className="p-2.5 rounded-lg text-xs border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-ink)]">
                      {modelNotice}
                    </div>
                  )}

                  {(() => {
                    const live = groqTestMsg?.models || getSessionLiveModels();
                    const modelList = live && live.length > 0 ? live : GROQ_STARTING_MODELS;
                    const displayOptions = [...modelList];
                    if (
                      inputGroqModel &&
                      inputGroqModel !== 'Auto' &&
                      !displayOptions.includes(inputGroqModel) &&
                      isUsableGroqChatModel(inputGroqModel)
                    ) {
                      displayOptions.unshift(inputGroqModel);
                    }

                    return (
                      <select
                        value={inputGroqModel || 'Auto'}
                        onChange={(e) => {
                          setInputGroqModel(e.target.value);
                          setModelNotice(null);
                        }}
                        className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono outline-none cursor-pointer"
                        style={{
                          backgroundColor: 'var(--color-surface)',
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-ink)'
                        }}
                      >
                        <option value="Auto">Auto (recommended)</option>
                        {displayOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    );
                  })()}

                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                    Free Groq limits differ by model and reset daily. If they run out, Gemini checks the answers instead.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm rc-btn-primary cursor-pointer shadow-sm transition-transform active:scale-95"
            >
              {savedFeedback ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save All Settings</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border cursor-pointer hover:opacity-80 transition-colors"
              style={{
                backgroundColor: 'transparent',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              Close
            </button>
          </div>
        </form>

        {/* Danger Zone: Remove Keys & Erase All Data */}
        <div className="pt-4 border-t space-y-3" style={{ borderColor: 'var(--color-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-ink)' }}>Manage Stored Data</p>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {inputGeminiKey && (
                <button
                  type="button"
                  onClick={handleRemoveGeminiKey}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                    confirmRemoveGemini ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]' : 'hover:opacity-80'
                  }`}
                  style={!confirmRemoveGemini ? { borderColor: 'var(--color-border)', color: 'var(--color-ink)' } : {}}
                >
                  {confirmRemoveGemini ? 'Confirm: Remove Gemini Key' : 'Remove Gemini Key'}
                </button>
              )}

              {inputGroqKey && (
                <button
                  type="button"
                  onClick={handleRemoveGroqKey}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                    confirmRemoveGroq ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]' : 'hover:opacity-80'
                  }`}
                  style={!confirmRemoveGroq ? { borderColor: 'var(--color-border)', color: 'var(--color-ink)' } : {}}
                >
                  {confirmRemoveGroq ? 'Confirm: Remove Groq Key' : 'Remove Groq Key'}
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={handleEraseAll}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                confirmErase ? 'bg-[var(--color-ink)] text-[var(--color-bg)] border-[var(--color-ink)]' : 'hover:opacity-80'
              }`}
              style={
                !confirmErase
                  ? {
                      backgroundColor: 'transparent',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-ink)',
                    }
                  : {}
              }
            >
              {confirmErase ? 'Click again to confirm erase' : 'Erase All Data'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
