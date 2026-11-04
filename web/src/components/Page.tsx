import type { HTMLAttributes } from "react";
import { cx } from "../lib/cx";
import styles from "./Page.module.css";

/** One screen: a centred column at least as tall as the viewport. */
export function Page({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx(styles.page, className)} {...rest} />;
}
