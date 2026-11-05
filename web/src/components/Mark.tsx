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
  /** Draw the swipe left to right once (a newly added word). */
  draw?: boolean;
  children: ReactNode;
  className?: string;
  lang?: string;
}

/** A headword on its highlighter swipe. */
export function Mark({ topic, ink, draw, children, className, lang }: Props) {
  const color = ink ?? markerFor(topic);
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
