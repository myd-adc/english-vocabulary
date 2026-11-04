import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Word } from "../api/types";

/** What the result card under the quick-add input shows. */
export type QuickResultState =
  | { status: "pending"; input: string }
  | { status: "error" }
  | { status: "not_english" }
  | { status: "unavailable"; input: string; error?: string }
  | { status: "created" | "exists"; input: string; word: Word; error?: string };

interface QuickContextValue {
  text: string;
  setText: (text: string) => void;
  result: QuickResultState | null;
  setResult: (result: QuickResultState | null) => void;
}

const QuickContext = createContext<QuickContextValue | null>(null);

/** Keeps the quick-add input and its result alive while the user visits other screens. */
export function QuickProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<QuickResultState | null>(null);
  return <QuickContext.Provider value={{ text, setText, result, setResult }}>{children}</QuickContext.Provider>;
}

export function useQuick(): QuickContextValue {
  const ctx = useContext(QuickContext);
  if (!ctx) throw new Error("useQuick outside QuickProvider");
  return ctx;
}
