"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en } from "@/messages/en";
import { ru, type Messages } from "@/messages/ru";

export type Locale = "ru" | "en";
const STORAGE_KEY = "atlas-locale";

type LocaleContextValue = {
  locale: Locale;
  messages: Messages;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>("ru");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "ru" || stored === "en") setLocale(stored);
    } catch {
      // A blocked storage API keeps the RU default and does not block the UI.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Locale remains usable for this session when persistence is unavailable.
    }
  }, [hydrated, locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, messages: locale === "en" ? en : ru, setLocale }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);
  if (!value) throw new Error("LocaleProvider is required");
  return value;
}
