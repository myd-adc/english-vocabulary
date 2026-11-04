import type { HTMLAttributes } from "react";
import { cx } from "../lib/cx";
import styles from "./SectionTitle.module.css";

export function SectionTitle({
  as: Tag = "h2",
  className,
  ...rest
}: HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" }) {
  return <Tag className={cx(styles.title, className)} {...rest} />;
}
