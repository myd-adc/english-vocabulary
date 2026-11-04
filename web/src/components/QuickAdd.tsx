import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { createWord, deleteWord, quickAdd } from "../api/endpoints";
import { sectionsKey } from "../api/hooks";
import type { Word } from "../api/types";
import { cx } from "../lib/cx";
import { FALLBACK_TOPIC } from "../lib/words";
import { Button } from "./Button";
import { useEditSheet } from "./EditSheet";
import { useQuick } from "./quick";
import { QuickResult } from "./QuickResult";
import styles from "./QuickAdd.module.css";

const PLACEHOLDER = "Англійське слово";

/** Add-a-word input with the result card below it. */
export function QuickAdd() {
  const { text, setText, result, setResult } = useQuick();
  const [busy, setBusy] = useState(false);
  const [empty, setEmpty] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const openEdit = useEditSheet();
  const refreshTiles = () => qc.invalidateQueries({ queryKey: sectionsKey });

  async function submit(e: FormEvent) {
    e.preventDefault();
    const word = text.trim();
    if (busy) return;
    if (!word) {
      // Empty field: say so instead of silently ignoring the tap.
      setEmpty(true);
      inputRef.current?.focus();
      return;
    }
    setBusy(true);
    // Show the word right away; the translation fills in when it arrives.
    setResult({ status: "pending", input: word });
    try {
      const r = await quickAdd(word);
      if ((r.status === "created" || r.status === "exists") && r.word) {
        setResult({ status: r.status, input: r.input || word, word: r.word });
        setText("");
        if (r.status === "created") void refreshTiles();
      } else if (r.status === "unavailable") {
        setResult({ status: "unavailable", input: r.input || word });
      } else {
        setResult({ status: "not_english" });
      }
    } catch {
      setResult({ status: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function saveManual(translation: string) {
    const t = translation.trim();
    if (!t || busy || result?.status !== "unavailable") return;
    const input = result.input;
    setBusy(true);
    try {
      const word = await createWord({ word: input.trim(), translation: t, section: FALLBACK_TOPIC });
      setResult({ status: "created", input: word.word, word });
      setText("");
      void refreshTiles();
    } catch (err) {
      const error =
        err instanceof TypeError
          ? "Немає з'єднання."
          : err instanceof ApiError && err.status === 409
            ? "Таке слово вже є."
            : "Не вдалося зберегти.";
      setResult({ status: "unavailable", input, error });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (result?.status !== "created" && result?.status !== "exists") return;
    const current = result;
    try {
      await deleteWord(current.word.id);
    } catch {
      setResult({ ...current, error: "Не вдалося видалити." });
      return;
    }
    setResult(null);
    void refreshTiles();
  }

  function edit(word: Word, focus?: "section") {
    openEdit(word, {
      focus,
      onSaved: (updated) => {
        if (result?.status === "created" || result?.status === "exists") {
          setResult({ ...result, word: { ...word, ...updated }, error: undefined });
        }
      },
      onDeleted: () => setResult(null),
    });
  }

  return (
    <div className={styles.quick}>
      <form className={styles.form} noValidate onSubmit={submit}>
        <input
          ref={inputRef}
          type="text"
          className={cx(styles.input, empty && styles.inputEmpty)}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setEmpty(false);
          }}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          enterKeyHint="done"
          placeholder={empty ? "Спершу введіть англійське слово" : PLACEHOLDER}
          aria-label={PLACEHOLDER}
        />
        <Button type="submit" className={styles.add} disabled={busy} busy={busy}>
          {busy ? "Додаю…" : "Додати"}
        </Button>
      </form>
      <QuickResult result={result} busy={busy} onManualSave={saveManual} onEdit={edit} onDelete={remove} />
    </div>
  );
}
