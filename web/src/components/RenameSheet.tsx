import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ApiError } from "../api/client";
import { renameTopic } from "../api/endpoints";
import { useInvalidateWords, useSections } from "../api/hooks";
import { Field, Sheet, SheetActions, SheetError, SheetHint, SheetTitle } from "./Sheet";

interface Props {
  open: boolean;
  /** Current topic name. */
  name: string;
  onClose: () => void;
  onRenamed: (next: string) => void;
}

export function RenameSheet({ open, name, onClose, onRenamed }: Props) {
  const [value, setValue] = useState(name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sections = useSections().data ?? [];
  const invalidate = useInvalidateWords();

  useEffect(() => {
    if (!open) return;
    setValue(name);
    setError("");
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open, name]);

  const next = value.trim();
  const merges = !!next && next !== name && sections.some((s) => s.name === next);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!next) return setError("Введи назву теми.");
    if (next === name) return onClose();
    setSaving(true);
    try {
      await renameTopic(name, next);
    } catch (err) {
      setSaving(false);
      return setError(err instanceof ApiError && err.status === 404 ? "Такої теми вже немає." : "Не вдалося перейменувати.");
    }
    setSaving(false);
    onClose();
    onRenamed(next);
    await invalidate();
  }

  return (
    <Sheet open={open} onClose={onClose} titleId="rename-title" onSubmit={submit}>
      <SheetTitle id="rename-title">Перейменувати тему</SheetTitle>
      <Field label="Назва" htmlFor="rename-input">
        <input
          ref={inputRef}
          id="rename-input"
          type="text"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError("");
          }}
        />
      </Field>
      {merges && <SheetHint>Така тема вже є, слова об'єднаються.</SheetHint>}
      {error && <SheetError message={error} />}
      <SheetActions onCancel={onClose} saveLabel="Зберегти" saving={saving} />
    </Sheet>
  );
}
