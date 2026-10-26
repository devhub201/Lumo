import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
export interface Preferences {
  name: string;
  motion: boolean;
  contrast: boolean;
  largeText: boolean;
  accent: "cyan" | "blue";
  appearance: "midnight" | "graphite";
}
const defaults: Preferences = {
  name: "",
  motion: true,
  contrast: false,
  largeText: false,
  accent: "cyan",
  appearance: "midnight",
};
const Context = createContext<{
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
}>({ preferences: defaults, update: () => {} });
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(defaults);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("lumo-preferences") ?? "{}");
      setPreferences({
        ...defaults,
        ...saved,
        accent: saved.accent === "blue" ? "blue" : "cyan",
        appearance: saved.appearance === "graphite" ? "graphite" : "midnight",
      });
    } catch {
      /* use defaults when storage is unavailable */
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (ready) {
      try {
        localStorage.setItem("lumo-preferences", JSON.stringify(preferences));
      } catch {
        /* Browser may block storage. */
      }
    }
  }, [preferences, ready]);
  return (
    <Context.Provider
      value={{ preferences, update: (patch) => setPreferences((old) => ({ ...old, ...patch })) }}
    >
      <div
        className="lumo-app"
        data-motion={preferences.motion}
        data-contrast={preferences.contrast}
        data-large-text={preferences.largeText}
        data-accent={preferences.accent}
        data-appearance={preferences.appearance}
      >
        {children}
      </div>
    </Context.Provider>
  );
}
export const usePreferences = () => useContext(Context);
