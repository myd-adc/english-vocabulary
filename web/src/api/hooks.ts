import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSections, getWords } from "./endpoints";

export const sectionsKey = ["sections"] as const;
export const wordsKey = ["words"] as const;

export const useSections = () => useQuery({ queryKey: sectionsKey, queryFn: getSections });

export const useWords = (section: string, q: string) =>
  useQuery({
    queryKey: [...wordsKey, { section, q }],
    queryFn: () => getWords({ section: section ? [section] : undefined, q }),
  });

/** After any change to words: refetch tiles, counts and whatever list is on screen. */
export function useInvalidateWords() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: sectionsKey }),
      qc.invalidateQueries({ queryKey: wordsKey }),
    ]);
}
