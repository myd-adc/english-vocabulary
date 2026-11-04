import { cx } from "../lib/cx";
import styles from "./Segmented.module.css";

interface Props<T extends string> {
  labelledBy: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** Two- or three-way toggle. */
export function Segmented<T extends string>({ labelledBy, value, options, onChange }: Props<T>) {
  return (
    <div className={styles.segmented} role="group" aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={cx(styles.seg, o.value === value && styles.active)}
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
