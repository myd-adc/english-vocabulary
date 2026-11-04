import type { HTMLAttributes } from "react";
import { cx } from "../lib/cx";
import styles from "./Centered.module.css";

/** Empty / loading / done states: centred column of muted text. */
export function Centered({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.centered, className)} {...rest} />;
}
