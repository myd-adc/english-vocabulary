import type { CSSProperties, ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { cx } from "../lib/cx";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import styles from "./TabBar.module.css";

const TABS: { to: string; label: string; icon: IconName; match: (path: string) => boolean }[] = [
  { to: "/", label: "Слова", icon: "words", match: (p) => p === "/" },
  { to: "/topics", label: "Теми", icon: "topics", match: (p) => p === "/topics" || p.startsWith("/topic") },
  { to: "/review", label: "Повторити", icon: "review", match: (p) => p === "/review" },
];

/** Screens that take the whole display: the study session and the Claude connect page. */
const BARE = ["/study", "/connect"];

/** App frame: content plus a bottom tab bar on phones, a left rail on wide screens. */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const showTabs = !BARE.includes(pathname);
  return (
    <div
      className={cx(styles.shell, showTabs && styles.withTabs)}
      style={{ "--tabbar-space": showTabs ? "calc(var(--tabbar-h) + env(safe-area-inset-bottom))" : "0px" } as CSSProperties}
    >
      {children}
      {showTabs && (
        <nav className={styles.tabs} aria-label="Розділи">
          <span className={styles.brand} aria-hidden="true">
            Glossa
          </span>
          {TABS.map((t) => {
            const active = t.match(pathname);
            return (
              <NavLink key={t.to} to={t.to} className={cx(styles.tab, active && styles.active)} aria-current={active ? "page" : undefined}>
                <Icon name={t.icon} size={24} />
                <span className={styles.label}>{t.label}</span>
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
}
