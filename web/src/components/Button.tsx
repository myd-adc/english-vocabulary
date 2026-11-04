import type { ButtonHTMLAttributes } from "react";
import { cx } from "../lib/cx";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "edit" | "delete";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Shows a small spinner after the label (aria-busy). */
  busy?: boolean;
}

const CLASSES: Record<Variant, string> = {
  primary: cx(styles.btn, styles.btnPrimary),
  secondary: cx(styles.btn, styles.btnSecondary),
  edit: styles.btnEdit ?? "",
  delete: styles.btnDelete ?? "",
};

export function Button({ variant = "primary", busy, className, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx(CLASSES[variant], className)}
      aria-busy={busy === undefined ? undefined : busy}
      {...rest}
    />
  );
}

export function IconButton({ className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={cx(styles.btnIcon, className)} {...rest} />;
}
