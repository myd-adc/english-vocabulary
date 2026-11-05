/** Ukrainian plural: one / few / many forms, e.g. plural(2, "тема", "теми", "тем") -> "2 теми". */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} ${one}`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} ${few}`;
  return `${n} ${many}`;
}

/** "слово": 1 слово, 2 слова, 5 слів. */
export const pluralWords = (n: number): string => plural(n, "слово", "слова", "слів");
