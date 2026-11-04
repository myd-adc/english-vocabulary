import { useEffect, useRef, useState } from "react";
import { clearToken } from "../api/client";
import { backfillTopics } from "../api/endpoints";
import { useInvalidateWords, useSections } from "../api/hooks";
import { pluralWords } from "../lib/plural";
import { THEME_LABELS, useTheme } from "../lib/theme";
import { FALLBACK_TOPIC } from "../lib/words";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import styles from "./Menu.module.css";

/** Header "⋯" menu: sort untopiced words, switch theme, log out. */
export function Menu({ onNote }: { onNote: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, cycle } = useTheme();
  const sections = useSections().data ?? [];
  const invalidate = useInvalidateWords();
  const canBackfill = sections.some((s) => s.name === FALLBACK_TOPIC);

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function backfill() {
    if (backfilling) return;
    setBackfilling(true);
    let total = 0;
    let failed = false;
    try {
      // each call handles a capped batch; stop when nothing was updated (translator down)
      for (;;) {
        const { updated, remaining } = await backfillTopics();
        total += updated;
        if (remaining <= 0 || updated === 0) {
          failed = remaining > 0;
          break;
        }
      }
    } catch {
      failed = true;
    }
    await invalidate();
    setOpen(false);
    setBackfilling(false);
    onNote(
      failed
        ? total
          ? `Розкладено ${pluralWords(total)}. Решту — пізніше.`
          : "Не вдалося розкласти слова."
        : `Розкладено ${pluralWords(total)}`,
    );
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <IconButton
        className={styles.button}
        aria-label="Меню"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="app-menu"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="more" />
      </IconButton>
      {open && (
        <div id="app-menu" className={styles.menu} role="menu" aria-label="Меню" ref={menuRef}>
          {canBackfill && (
            <button type="button" className={styles.item} role="menuitem" disabled={backfilling} onClick={backfill}>
              {backfilling ? "Розкладаю…" : "Розкласти слова без теми"}
            </button>
          )}
          <button type="button" className={styles.item} role="menuitem" onClick={cycle}>
            {THEME_LABELS[theme]}
          </button>
          <button type="button" className={styles.item} role="menuitem" onClick={clearToken}>
            Вийти
          </button>
        </div>
      )}
    </div>
  );
}
