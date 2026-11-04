import type { ComponentProps } from "react";
import { cx } from "../lib/cx";
import styles from "./TextInput.module.css";

/** Full-width text input (login password, topic search). */
export function TextInput({ className, ...rest }: ComponentProps<"input">) {
  return <input className={cx(styles.input, className)} {...rest} />;
}
