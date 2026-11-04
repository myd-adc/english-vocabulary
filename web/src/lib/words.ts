import type { Word } from "../api/types";

/** Topic shown (and assigned) for words that have none. */
export const FALLBACK_TOPIC = "Без теми";

/** Short answer for options and prompts: the main meaning, else the first line of the translation. */
export const shortMeaning = (c: Word): string =>
  c.main_translation || (c.translation || "").split("\n").find((l) => l.trim()) || "";

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}
