import type { ComponentProps } from "react";
import { cx } from "../lib/cx";
import styles from "./LinkButton.module.css";

/** Text-only accent button. */
export function LinkButton({ className, type = "button", ...rest }: ComponentProps<"button">) {
  return <button type={type} className={cx(styles.link, className)} {...rest} />;
}
