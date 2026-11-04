import styles from "./Switch.module.css";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelledBy: string;
  describedBy: string;
}

export function Switch({ checked, onChange, labelledBy, describedBy }: Props) {
  return (
    <button
      type="button"
      role="switch"
      className={styles.switch}
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} aria-hidden="true" />
    </button>
  );
}
