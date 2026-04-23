import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { Lang, translations, detectLang, detectLangByIP, Translations } from "./i18n";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Translations;
}

const LangContext = createContext<LangContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  // Synchronous initial value from browser lang (no flash)
  const [lang, setLangState] = useState<Lang>(detectLang);
  // Track whether user manually switched — stored in memory only (no localStorage)
  const manualLang = useRef<Lang | null>(null);

  // On mount: async IP geolocation, skip if user already switched
  useEffect(() => {
    detectLangByIP(manualLang.current).then(detected => {
      if (!manualLang.current) setLangState(detected);
    });
  }, []);

  // When user manually switches: lock in choice for this session
  function setLang(l: Lang) {
    manualLang.current = l;
    setLangState(l);
  }

  const t = translations[lang] as Translations;
  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}
