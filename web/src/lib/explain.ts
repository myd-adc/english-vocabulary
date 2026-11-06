import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateMe } from "../api/endpoints";
import { meKey, useMe } from "../api/hooks";
import type { ExplainLang, Me, Word } from "../api/types";

export const EXPLAIN_LABELS: Record<ExplainLang, string> = {
  uk: "Пояснення: українською",
  en: "Пояснення: англійською",
};

/** The language word explanations are shown in (saved in the account), and a toggle for it. */
export function useExplainLang() {
  const qc = useQueryClient();
  const lang: ExplainLang = useMe().data?.explain_lang ?? "uk";
  const mutation = useMutation({
    mutationFn: (next: ExplainLang) => updateMe({ explain_lang: next }),
    onMutate: (next) => {
      const prev = qc.getQueryData<Me>(meKey);
      if (prev) qc.setQueryData<Me>(meKey, { ...prev, explain_lang: next });
      return prev;
    },
    onError: (_err, _next, prev) => {
      if (prev) qc.setQueryData(meKey, prev);
    },
    onSuccess: (me) => qc.setQueryData(meKey, me),
  });
  const toggle = () => mutation.mutate(lang === "uk" ? "en" : "uk");
  return { lang, toggle };
}

/** The word's explanation in the chosen language; the other one if that is missing. */
export function explanation(word: Pick<Word, "definition" | "definition_uk">, lang: ExplainLang) {
  const uk = word.definition_uk?.trim();
  const en = word.definition?.trim();
  if (lang === "uk") return uk ? { text: uk, lang: "uk" as const } : en ? { text: en, lang: "en" as const } : null;
  return en ? { text: en, lang: "en" as const } : uk ? { text: uk, lang: "uk" as const } : null;
}
