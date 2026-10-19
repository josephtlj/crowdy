import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fill, Language, serverErrorKey, StringKey, STRINGS } from "./strings";

const STORAGE_KEY = "crowdy:language";

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: StringKey, vars?: Record<string, string | number>) => string;
  errorText: (message: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (stored === "en" || stored === "zh") setLanguageState(stored);
    });
  }, []);

  const setLanguage = (next: Language) => {
    setLanguageState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch((err) => {
      console.error("Failed to store language:", err);
    });
  };

  const value = useMemo<LanguageContextValue>(() => {
    const t = (key: StringKey, vars?: Record<string, string | number>) => fill(STRINGS[language][key], vars);
    return {
      language,
      setLanguage,
      t,
      errorText: (message: string) => {
        const key = serverErrorKey(message);
        return key ? t(key) : message;
      },
    };
  }, [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within a LanguageProvider");
  return ctx;
}
