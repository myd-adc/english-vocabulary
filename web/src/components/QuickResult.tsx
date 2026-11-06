import { useState } from "react";
import type { Word } from "../api/types";
import { markerFor } from "../lib/marker";
import { FALLBACK_TOPIC } from "../lib/words";
import { Button } from "./Button";
import { ErrorMsg } from "./ErrorMsg";
import { Mark } from "./Mark";
import type { QuickResultState } from "./quick";
import styles from "./QuickResult.module.css";

interface Props {
  result: QuickResultState | null;
  busy: boolean;
  onManualSave: (translation: string) => void;
  onEdit: (word: Word, focus?: "section") => void;
  onDelete: () => void;
}

/** One dictionary entry, or the state of an add in progress. */
export function QuickResult({ result, busy, onManualSave, onEdit, onDelete }: Props) {
  return (
    <section className={styles.result} hidden={!result} aria-live="polite">
      {result && <Body result={result} busy={busy} onManualSave={onManualSave} onEdit={onEdit} onDelete={onDelete} />}
    </section>
  );
}

function Body({ result, busy, onManualSave, onEdit, onDelete }: Props & { result: QuickResultState }) {
  switch (result.status) {
    case "pending":
      return (
        <>
          <h3 className={styles.word}>
            <Mark ink="zinc" lang="en">
              {result.input}
            </Mark>
          </h3>
          <p className={`${styles.status} ${styles.pending}`}>Перекладаю…</p>
        </>
      );
    case "error":
      return <ErrorMsg offlineAware>Не вдалося додати слово.</ErrorMsg>;
    case "not_english":
      return <p className={styles.note}>Це не схоже на англійське слово.</p>;
    case "unavailable":
      return (
        <>
          <p className={styles.note}>Переклад зараз недоступний. Введіть переклад вручну.</p>
          <ManualForm busy={busy} onSave={onManualSave} />
          {result.error && <ErrorMsg>{result.error}</ErrorMsg>}
        </>
      );
    default: {
      const { word, input, status } = result;
      const topic = word.section || FALLBACK_TOPIC;
      return (
        <>
          <h3 className={styles.word}>
            <Mark topic={word.section} drawKey={status === "created" ? word.id : undefined} lang="en">
              {word.word}
            </Mark>
          </h3>
          <Parts word={word} />
          {word.definition && (
            <p className={styles.definition} lang="en">
              {word.definition}
            </p>
          )}
          {input && input.trim().toLowerCase() !== word.word.toLowerCase() && (
            <p className={styles.note}>{`Ви ввели «${input.trim()}» → збережено «${word.word}»`}</p>
          )}
          <div className={styles.meta}>
            <button
              type="button"
              className={styles.chip}
              aria-label={`Тема: ${topic}. Змінити тему`}
              onClick={() => onEdit(word, "section")}
            >
              <span className={styles.dot} style={{ background: `var(--mk-${markerFor(topic)})` }} aria-hidden="true" />
              {topic}
            </button>
            <span className={styles.status}>{status === "exists" ? "Уже є у словнику" : "Збережено"}</span>
          </div>
          <div className={styles.actions}>
            <Button variant="edit" onClick={() => onEdit(word)}>
              Змінити
            </Button>
            <Button variant="delete" onClick={onDelete}>
              Видалити
            </Button>
          </div>
          {result.error && <ErrorMsg>{result.error}</ErrorMsg>}
        </>
      );
    }
  }
}

function ManualForm({ busy, onSave }: { busy: boolean; onSave: (translation: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <form
      className={styles.manualForm}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <input
        type="text"
        id="manual-translation"
        className={styles.manualInput}
        placeholder="Переклад"
        aria-label="Переклад"
        autoComplete="off"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button type="submit" className={styles.save} disabled={busy}>
        Зберегти
      </Button>
    </form>
  );
}

// "дієслово: бігти, керувати" lines -> a pos label and meanings, the main one in bold
function Parts({ word }: { word: Word }) {
  const main = (word.main_translation || "").trim().toLowerCase();
  const lines = (word.translation || "").split("\n").filter(Boolean);
  return (
    <div className={styles.parts}>
      {lines.map((line, n) => {
        const i = line.indexOf(":");
        const items = (i > 0 ? line.slice(i + 1) : line)
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean);
        const hasMain = !!main && items.some((m) => m.toLowerCase() === main);
        return (
          <div key={n} className={i > 0 ? styles.part : `${styles.part} ${styles.partBare}`}>
            {i > 0 && <span className={styles.partPos}>{line.slice(0, i).trim()}</span>}
            <span className={hasMain ? `${styles.partMeanings} ${styles.hasMain}` : styles.partMeanings}>
              {items.map((m, k) => (
                <span key={k}>
                  {k > 0 && ", "}
                  {m.toLowerCase() === main ? <strong>{m}</strong> : m}
                </span>
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
