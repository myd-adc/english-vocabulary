import type { ReactNode } from "react";
import styles from "./ErrorMsg.module.css";

/** Inline error; when the device is offline it says so instead of the generic text. */
export function ErrorMsg({ children, offlineAware }: { children: ReactNode; offlineAware?: boolean }) {
  return <p className={styles.error}>{offlineAware && !navigator.onLine ? "Немає з'єднання." : children}</p>;
}
