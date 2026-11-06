import { cx } from "../lib/cx";
import styles from "./Skeleton.module.css";

/** Shimmering placeholder shown while a list loads. */
export function Skeleton({ kind, count = 1 }: { kind: "tile" | "row" | "chips"; count?: number }) {
  if (kind === "chips") {
    return (
      <div className={styles.chips} aria-hidden="true">
        {[44, 84, 78, 68, 92].map((w, i) => (
          <span key={i} className={cx(styles.skeleton, styles.chip)} style={{ width: w }} />
        ))}
      </div>
    );
  }
  if (kind === "row") {
    return Array.from({ length: count }, (_, i) => (
      <div key={i} className={styles.rowBox} aria-hidden="true">
        <span className={cx(styles.skeleton, styles.head)} style={{ width: `${34 + ((i * 17) % 30)}%` }} />
        <span className={cx(styles.skeleton, styles.sub)} style={{ width: `${22 + ((i * 11) % 24)}%` }} />
        <span className={cx(styles.skeleton, styles.sub)} style={{ width: `${48 + ((i * 13) % 34)}%` }} />
      </div>
    ));
  }
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className={cx(styles.skeleton, styles.tile)} aria-hidden="true" />
  ));
}

export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}
