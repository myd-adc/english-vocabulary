import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "../lib/cx";
import { markerFor } from "../lib/marker";
import type { Ink } from "../lib/marker";
import styles from "./Mark.module.css";

interface Props {
  /** Topic whose marker colour to use. */
  topic?: string | null;
  /** Explicit ink (overrides topic); "zinc" is the neutral swipe for a word still being translated. */
  ink?: Ink | "zinc";
  /** Draw the swipe left to right, once per session for this key (a newly added word's id). */
  drawKey?: number;
  children: ReactNode;
  className?: string;
  lang?: string;
}

/** A headword on its highlighter swipe. */
/** Keys whose swipe has already been drawn: a swipe draws once, never again on a remount. */
const drawn = new Set<number>();

export function Mark({ topic, ink, drawKey, children, className, lang }: Props) {
  const color = ink ?? markerFor(topic);
  // Decided once per mount, so a re-render does not restart or cancel the animation.
  const [draw] = useState(() => drawKey !== undefined && !drawn.has(drawKey) && (drawn.add(drawKey), true));
  return (
    <span
      className={cx(styles.mark, draw && styles.draw, className)}
      style={{ "--mk": `var(--mk-${color})` } as CSSProperties}
      lang={lang}
    >
      {children}
    </span>
  );
}
