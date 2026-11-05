import type { ReactNode } from "react";
import styles from "./Icon.module.css";

// Small stroke icons (24x24 grid, 2 stroke).
const PATHS = {
  speaker: (
    <>
      <path d="M4 9.5v5h3.5l4.5 4v-13l-4.5 4H4z" />
      <path d="M15.5 9.2a4 4 0 0 1 0 5.6" />
      <path d="M18.2 6.5a7.6 7.6 0 0 1 0 11" />
    </>
  ),
  "chevron-left": <path d="M14.5 5.5 8 12l6.5 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  "chevron-right": <path d="M9.5 5.5 16 12l-6.5 6.5" />,
  words: (
    <>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </>
  ),
  topics: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="2" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="2" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" />
    </>
  ),
  review: (
    <>
      <rect x="3.5" y="6.5" width="13" height="13" rx="3" />
      <path d="M8 3.5h9.5A3 3 0 0 1 20.5 6.5V16" />
    </>
  ),
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.1" />
      <circle cx="12" cy="12" r="1.1" />
      <circle cx="18.5" cy="12" r="1.1" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <span className={styles.icon} aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {PATHS[name]}
      </svg>
    </span>
  );
}
