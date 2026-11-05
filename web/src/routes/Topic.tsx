import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { useWords } from "../api/hooks";
import { Button } from "../components/Button";
import { Centered } from "../components/Centered";
import { useEditSheet } from "../components/EditSheet";
import { ErrorMsg } from "../components/ErrorMsg";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { Page } from "../components/Page";
import { RenameSheet } from "../components/RenameSheet";
import { Skeleton } from "../components/Skeleton";
import { TextInput } from "../components/TextInput";
import { WordRow } from "../components/WordRow";
import { pluralWords } from "../lib/plural";
import { FALLBACK_TOPIC } from "../lib/words";
import styles from "./Topic.module.css";

/** /topic/:name — words of one topic; /topic — all words. */
export function TopicRoute() {
  const { name = "" } = useParams();
  // A new topic starts with a clean search box and sheet.
  return <Topic key={name} name={name} />;
}

function Topic({ name }: { name: string }) {
  const navigate = useNavigate();
  const openEdit = useEditSheet();
  const isAll = !name;
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [renaming, setRenaming] = useState(false);
  const { data, isPending, isError } = useWords(name, q);
  const words = data?.words ?? [];

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  return (
    <Page>
      <Header title={isAll ? "Усі слова" : name} back="/topics" />
      <main className={styles.main}>
        {!isAll && (
          <div className={styles.actions}>
            <Button onClick={() => navigate(`/review?section=${encodeURIComponent(name)}`)}>Повторити тему</Button>
            {name !== FALLBACK_TOPIC && (
              <Button variant="secondary" onClick={() => setRenaming(true)}>
                Перейменувати
              </Button>
            )}
          </div>
        )}
        <TextInput
          type="search"
          placeholder="Пошук"
          aria-label="Пошук"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className={styles.count}>{!isPending && words.length > 0 && pluralWords(words.length)}</p>
        {!isPending && !isError && words.length === 0 && (
          <Centered>
            <p>Слів не знайдено.</p>
          </Centered>
        )}
        <div>
          {isPending && <Skeleton kind="row" count={6} />}
          {isError && <ErrorMsg offlineAware>Не вдалося завантажити слова.</ErrorMsg>}
          {words.map((w) => (
            <WordRow key={w.id} word={w} onEdit={(word) => openEdit(word)} />
          ))}
        </div>
      </main>
      <button type="button" className={styles.fab} aria-label="Додати слово" onClick={() => openEdit(null, { defaultSection: name })}>
        <Icon name="plus" size={26} />
      </button>
      {!isAll && (
        <RenameSheet
          open={renaming}
          name={name}
          onClose={() => setRenaming(false)}
          onRenamed={(next) => navigate(`/topic/${encodeURIComponent(next)}`, { replace: true })}
        />
      )}
    </Page>
  );
}
