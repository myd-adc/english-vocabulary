import { cx } from "../lib/cx";
import styles from "./Skeleton.module.css";

/** Shimmering placeholder shown while a list loads. */
export function Skeleton({ kind, count = 1 }: { kind: "tile" | "row"; count?: number }) {
  return Array.from({ length: count }, (_, i) => (
    <div key={i} className={cx(styles.skeleton, kind === "tile" ? styles.tile : styles.row)} aria-hidden="true" />
  ));
}

export function Spinner() {
  return <span className={styles.spinner} aria-hidden="true" />;
}
