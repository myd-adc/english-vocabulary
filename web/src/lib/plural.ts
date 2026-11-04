/** Ukrainian plural for "слово": 1 слово, 2 слова, 5 слів. */
export function pluralWords(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} слово`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} слова`;
  return `${n} слів`;
}
