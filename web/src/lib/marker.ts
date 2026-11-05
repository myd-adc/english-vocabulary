import { FALLBACK_TOPIC } from "./words";

/** The six marker inks; each has a `--mk-<name>` token in tokens.css. */
export const INKS = ["yellow", "pink", "green", "orange", "blue", "violet"] as const;
export type Ink = (typeof INKS)[number];

/** FNV-1a: small and stable across sessions and devices. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** Topic name -> marker ink. Words without a topic are yellow. Case and surrounding spaces do not change the colour. */
export function markerFor(topic: string | null | undefined): Ink {
  const t = (topic ?? "").trim().toLowerCase();
  if (!t || t === FALLBACK_TOPIC.toLowerCase()) return "yellow";
  return INKS[hash(t) % INKS.length]!;
}
