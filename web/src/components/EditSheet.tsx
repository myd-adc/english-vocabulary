import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "../api/client";
import { createWord, deleteWord, quickAdd, updateWord } from "../api/endpoints";
import { useInvalidateWords, useSections } from "../api/hooks";
import type { Word, WordFields } from "../api/types";
import { FALLBACK_TOPIC } from "../lib/words";
import { Button } from "./Button";
import { Field, Sheet, SheetActions, SheetError, SheetTitle } from "./Sheet";
import styles from "./EditSheet.module.css";
import sheetStyles from "./Sheet.module.css";

type FieldKey = keyof WordFields;
type Values = Record<FieldKey, string>;

const FIELDS: { key: FieldKey; label: string; kind: "input" | "textarea"; placeholder?: string }[] = [
  { key: "word", label: "Слово (англійською)", kind: "input" },
  { key: "translation", label: "Переклад", kind: "textarea" },
  { key: "main_translation", label: "Головне значення", kind: "input" },
  { key: "transcription", label: "Транскрипція (IPA)", kind: "input", placeholder: "/ˈæp.əl/" },
  { key: "part_of_speech", label: "Частина мови", kind: "input", placeholder: "noun, verb…" },
  { key: "example", label: "Приклад (англійською)", kind: "textarea" },
  { key: "example_translation", label: "Переклад прикладу", kind: "textarea" },
  { key: "notes", label: "Нотатки", kind: "textarea" },
  { key: "section", label: "Тема", kind: "input" },
];

const EMPTY: Values = Object.fromEntries(FIELDS.map((f) => [f.key, ""])) as Values;

export interface EditOptions {
  /** Field to focus (default: the word). */
  focus?: FieldKey;
  /** Topic pre-filled for a new word. */
  defaultSection?: string;
  /** Called with the saved word after editing an existing word. */
  onSaved?: (word: Word) => void;
  onDeleted?: () => void;
}

type OpenEdit = (word: Word | null, options?: EditOptions) => void;
const EditSheetContext = createContext<OpenEdit | null>(null);

/** Opens the add / edit sheet from anywhere under the provider. */
export function useEditSheet(): OpenEdit {
  const open = useContext(EditSheetContext);
  if (!open) throw new Error("useEditSheet outside EditSheetProvider");
  return open;
}

interface Session {
  id: number;
  word: Word | null;
  options: EditOptions;
}

export function EditSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session>({ id: 0, word: null, options: {} });
  const [values, setValues] = useState<Values>(EMPTY);
  const [error, setError] = useState<{ message: string; n: number } | null>(null);
  const [saving, setSaving] = useState<string | null>(null); // label shown on the save button
  const refs = useRef<Partial<Record<FieldKey, HTMLInputElement | HTMLTextAreaElement | null>>>({});
  const errorRef = useRef<HTMLParagraphElement>(null);
  const invalidate = useInvalidateWords();
  const sections = useSections().data ?? [];

  const openEdit = useCallback<OpenEdit>((word, options = {}) => {
    const initial = { ...EMPTY };
    for (const { key } of FIELDS) {
      if (word) initial[key] = word[key] || "";
      else if (key === "section" && options.defaultSection !== FALLBACK_TOPIC) initial[key] = options.defaultSection ?? "";
    }
    setValues(initial);
    setError(null);
    setSession((s) => ({ id: s.id + 1, word, options }));
    setOpen(true);
  }, []);

  // Focus the requested field once the sheet is showing.
  useEffect(() => {
    if (!open) return;
    const focus = session.options.focus ?? "word";
    const el = refs.current[focus];
    el?.focus();
    if (focus === "section") el?.select();
  }, [session.id, open, session.options.focus]);

  useEffect(() => {
    errorRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [error]);

  const close = useCallback(() => setOpen(false), []);
  const fail = (message: string) => setError({ message, n: Date.now() });
  const { word: editing, options } = session;

  const readBody = () => {
    const body = {} as Record<FieldKey, string | null>;
    for (const { key } of FIELDS) body[key] = values[key].trim() || null;
    return body;
  };

  // New word without a translation: translate it automatically (same flow as the home input),
  // then apply the other fields typed in the sheet, if any.
  async function saveNewAuto(body: Record<FieldKey, string | null>) {
    setSaving("Перекладаю…");
    try {
      const r = await quickAdd(body.word!);
      if (r.status === "not_english") return fail("Це не схоже на англійське слово.");
      if (r.status === "unavailable") return fail("Автопереклад зараз недоступний. Введіть переклад вручну.");
      if (r.status === "exists") return fail(`«${r.word?.word}» уже є у словнику.`);
      const extra: Partial<WordFields> = {};
      for (const key of ["transcription", "part_of_speech", "example", "example_translation", "notes", "section"] as const) {
        if (body[key]) extra[key] = body[key];
      }
      if (Object.keys(extra).length && r.word) {
        try {
          await updateWord(r.word.id, extra);
        } catch (err) {
          if (!(err instanceof ApiError)) throw err; // word is saved; only the extras failed
        }
      }
      close();
      await invalidate();
    } catch {
      fail("Не вдалося додати слово.");
    } finally {
      setSaving(null);
    }
  }

  async function save() {
    const body = readBody();
    if (!body.word) return fail("Введіть слово.");
    if (!editing && !body.translation) return saveNewAuto(body);
    if (!body.translation) return fail("Введіть переклад.");
    setSaving("Збереження…");
    try {
      const saved = editing
        ? await updateWord(editing.id, body)
        : await createWord({ ...body, word: body.word, translation: body.translation });
      close();
      if (editing) options.onSaved?.(saved);
      await invalidate();
    } catch (err) {
      fail(err instanceof ApiError && err.status === 409 ? "Таке слово вже є." : "Не вдалося зберегти.");
    } finally {
      setSaving(null);
    }
  }

  async function remove() {
    if (!editing || !confirm(`Видалити «${editing.word}»?`)) return;
    try {
      await deleteWord(editing.id);
    } catch {
      return fail("Не вдалося видалити.");
    }
    close();
    options.onDeleted?.();
    await invalidate();
  }

  const topicOptions = useMemo(() => sections.map((s) => <option key={s.name} value={s.name} />), [sections]);

  return (
    <EditSheetContext.Provider value={openEdit}>
      {children}
      <Sheet open={open} onClose={close} titleId="edit-title">
        <SheetTitle id="edit-title">{editing ? "Редагувати слово" : "Нове слово"}</SheetTitle>
        <EntryPreview word={values.word} translation={values.main_translation || values.translation} />
        {FIELDS.map(({ key, label, kind, placeholder }) => {
          const id = `edit-${key}`;
          const common = {
            id,
            value: values[key],
            onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [key]: e.target.value })),
            ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
              refs.current[key] = el;
            },
          };
          return (
            <Field key={key} label={label} htmlFor={id}>
              {kind === "textarea" ? (
                <textarea
                  {...common}
                  rows={2}
                  placeholder={key === "translation" && !editing ? "Залиште порожнім — перекладу автоматично" : undefined}
                />
              ) : (
                <input
                  {...common}
                  type="text"
                  autoComplete="off"
                  autoCapitalize={key === "word" ? "off" : undefined}
                  placeholder={placeholder}
                  list={key === "section" ? "section-options" : undefined}
                />
              )}
              {key === "section" && <datalist id="section-options">{topicOptions}</datalist>}
            </Field>
          );
        })}
        {error && <SheetError key={error.n} message={error.message} ref={errorRef} />}
        <SheetActions onCancel={close} onSave={save} saveLabel={saving ?? "Зберегти"} saving={saving !== null} />
        {editing && (
          <Button variant="delete" className={styles.delete} onClick={remove}>
            Видалити слово
          </Button>
        )}
      </Sheet>
    </EditSheetContext.Provider>
  );
}

/** The entry as it will look: headword with its gloss beneath. Hidden until there is a word. */
function EntryPreview({ word, translation }: { word: string; translation: string }) {
  const w = word.trim();
  if (!w) return null;
  const gloss = translation.split("\n").find((l) => l.trim()) ?? "";
  return (
    <div className={sheetStyles.preview} aria-hidden="true">
      <span className={sheetStyles.previewWord} lang="en">
        {w}
      </span>
      {gloss && <span className={sheetStyles.previewGloss}>{gloss.trim()}</span>}
    </div>
  );
}
