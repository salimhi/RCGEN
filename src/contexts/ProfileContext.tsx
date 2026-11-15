import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  getProfile,
  saveProfile,
  getGeminiKey,
  saveGeminiKey,
  clearGeminiKey as clearGeminiKeyStorage,
  getGeminiModel,
  saveGeminiModel,
  getGroqKey,
  saveGroqKey,
  clearGroqKey as clearGroqKeyStorage,
  getGroqModel,
  saveGroqModel,
  getUseGroq,
  saveUseGroq,
  getDoubleCheck,
  saveDoubleCheck,
  eraseAllData as eraseAllDataStorage,
} from '../lib/storage';
import { GEMINI_MODEL, GROQ_MODEL_DEFAULT } from '../config';

interface ProfileContextType {
  displayName: string;
  geminiKey: string;
  hasGeminiKey: boolean;
  geminiModel: string;
  groqKey: string;
  hasGroqKey: boolean;
  groqModel: string;
  useGroq: boolean;
  doubleCheck: boolean;
  setDisplayName: (name: string) => void;
  setGeminiKey: (key: string) => void;
  setGeminiModel: (model: string) => void;
  clearGeminiKey: () => void;
  setGroqKey: (key: string) => void;
  setGroqModel: (model: string) => void;
  setUseGroq: (enabled: boolean) => void;
  setDoubleCheck: (enabled: boolean) => void;
  clearGroqKey: () => void;
  eraseAllData: () => void;
}

const ProfileContext = createContext<ProfileContextType>({
  displayName: 'Aspirant',
  geminiKey: '',
  hasGeminiKey: false,
  geminiModel: GEMINI_MODEL,
  groqKey: '',
  hasGroqKey: false,
  groqModel: GROQ_MODEL_DEFAULT,
  useGroq: true,
  doubleCheck: true,
  setDisplayName: () => {},
  setGeminiKey: () => {},
  setGeminiModel: () => {},
  clearGeminiKey: () => {},
  setGroqKey: () => {},
  setGroqModel: () => {},
  setUseGroq: () => {},
  setDoubleCheck: () => {},
  clearGroqKey: () => {},
  eraseAllData: () => {},
});

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [displayName, setDisplayNameState] = useState<string>('Aspirant');
  const [geminiKey, setGeminiKeyState] = useState<string>('');
  const [geminiModel, setGeminiModelState] = useState<string>(GEMINI_MODEL);
  const [groqKey, setGroqKeyState] = useState<string>('');
  const [groqModel, setGroqModelState] = useState<string>(GROQ_MODEL_DEFAULT);
  const [useGroq, setUseGroqState] = useState<boolean>(true);
  const [doubleCheck, setDoubleCheckState] = useState<boolean>(true);

  useEffect(() => {
    const prof = getProfile();
    setDisplayNameState(prof.displayName || 'Aspirant');
    setGeminiKeyState(getGeminiKey());
    setGeminiModelState(getGeminiModel());
    setGroqKeyState(getGroqKey());
    setGroqModelState(getGroqModel());
    setUseGroqState(getUseGroq());
    setDoubleCheckState(getDoubleCheck());
  }, []);

  const handleSetDisplayName = (name: string) => {
    const trimmed = name.trim() || 'Aspirant';
    setDisplayNameState(trimmed);
    saveProfile({ displayName: trimmed });
  };

  const handleSetGeminiKey = (key: string) => {
    const trimmed = key.trim();
    setGeminiKeyState(trimmed);
    saveGeminiKey(trimmed);
  };

  const handleSetGeminiModel = (model: string) => {
    const trimmed = model.trim() || GEMINI_MODEL;
    setGeminiModelState(trimmed);
    saveGeminiModel(trimmed);
  };

  const handleClearGeminiKey = () => {
    setGeminiKeyState('');
    clearGeminiKeyStorage();
  };

  const handleSetGroqKey = (key: string) => {
    const trimmed = key.trim();
    setGroqKeyState(trimmed);
    saveGroqKey(trimmed);
  };

  const handleSetGroqModel = (model: string) => {
    const trimmed = model.trim() || GROQ_MODEL_DEFAULT;
    setGroqModelState(trimmed);
    saveGroqModel(trimmed);
  };

  const handleSetUseGroq = (enabled: boolean) => {
    setUseGroqState(enabled);
    saveUseGroq(enabled);
  };

  const handleSetDoubleCheck = (enabled: boolean) => {
    setDoubleCheckState(enabled);
    saveDoubleCheck(enabled);
  };

  const handleClearGroqKey = () => {
    setGroqKeyState('');
    clearGroqKeyStorage();
  };

  const handleEraseAllData = () => {
    eraseAllDataStorage();
    setDisplayNameState('Aspirant');
    setGeminiKeyState('');
    setGeminiModelState(GEMINI_MODEL);
    setGroqKeyState('');
    setGroqModelState(GROQ_MODEL_DEFAULT);
    setUseGroqState(true);
    setDoubleCheckState(true);
  };

  return (
    <ProfileContext.Provider
      value={{
        displayName,
        geminiKey,
        hasGeminiKey: Boolean(geminiKey && geminiKey.trim().length > 0),
        geminiModel,
        groqKey,
        hasGroqKey: Boolean(groqKey && groqKey.trim().length > 0),
        groqModel,
        useGroq,
        doubleCheck,
        setDisplayName: handleSetDisplayName,
        setGeminiKey: handleSetGeminiKey,
        setGeminiModel: handleSetGeminiModel,
        clearGeminiKey: handleClearGeminiKey,
        setGroqKey: handleSetGroqKey,
        setGroqModel: handleSetGroqModel,
        setUseGroq: handleSetUseGroq,
        setDoubleCheck: handleSetDoubleCheck,
        clearGroqKey: handleClearGroqKey,
        eraseAllData: handleEraseAllData,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
};

export const useProfile = () => useContext(ProfileContext);
