import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useSections, useWords } from "../api/hooks";
import { Centered } from "../components/Centered";
import { useEditSheet } from "../components/EditSheet";
import { ErrorMsg } from "../components/ErrorMsg";
import { Header } from "../components/Header";
import { Mark } from "../components/Mark";
import { Menu } from "../components/Menu";
import { Page } from "../components/Page";
import { useQuick } from "../components/quick";
import { QuickAdd } from "../components/QuickAdd";
import { Skeleton } from "../components/Skeleton";
import { WordRow } from "../components/WordRow";
import { cx } from "../lib/cx";
import { markerFor } from "../lib/marker";
import { pluralWords } from "../lib/plural";
import styles from "./Home.module.css";

const SHOWN = 40;
/** Words whose swipe has already been drawn this session: it is drawn once. */
const drawn = new Set<number>();

export function Home() {
  const navigate = useNavigate();
  const openEdit = useEditSheet();
  const { result } = useQuick();
  const [note, setNote] = useState("");
  const [topic, setTopic] = useState("");
  const [fresh, setFresh] = useState<number | null>(null);
  const sections = useSections().data ?? [];
  const total = sections.reduce((sum, s) => sum + s.words, 0);
  const { data, isPending, isError } = useWords(topic, "");
  const words = data?.words ?? [];

  // The backfill note disappears by itself.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 6000);
    return () => clearTimeout(t);
  }, [note]);

  // A word that has just been added gets its swipe drawn, once.
  const createdId = result?.status === "created" ? result.word.id : null;
  useEffect(() => {
    if (createdId !== null && !drawn.has(createdId)) {
      drawn.add(createdId);
      setFresh(createdId);
    }
  }, [createdId]);

  // A topic that disappeared (renamed, merged) falls back to everything.
  const topicGone = topic !== "" && sections.length > 0 && !sections.some((s) => s.name === topic);
  useEffect(() => {
    if (topicGone) setTopic("");
  }, [topicGone]);

  const shown = words.slice(0, SHOWN);
  const empty = !isPending && !isError && total === 0 && sections.length === 0 && words.length === 0;

  return (
    <Page>
      <Header title="Glossa" home>
        {total > 0 && <span className={styles.count}>{pluralWords(total)}</span>}
        <Menu onNote={setNote} />
      </Header>
      <main className={styles.main}>
        <QuickAdd />
        <p className={styles.note} role="status" hidden={!note}>
          {note}
        </p>
        {sections.length > 0 && (
          <div className={styles.chips} role="group" aria-label="Теми">
            <button type="button" className={cx(styles.chip, topic === "" && styles.on)} aria-pressed={topic === ""} onClick={() => setTopic("")}>
              Усі
            </button>
            {sections.map((s) => (
              <button
                key={s.name}
                type="button"
                className={cx(styles.chip, topic === s.name && styles.on)}
                aria-pressed={topic === s.name}
                onClick={() => setTopic(s.name)}
              >
                <span className={styles.dot} style={{ background: `var(--mk-${markerFor(s.name)})` }} aria-hidden="true" />
                {s.name}
              </button>
            ))}
          </div>
        )}
        <section className={styles.list} aria-label="Нові слова">
          {isPending && <Skeleton kind="row" count={5} />}
          {isError && (
            <div className={styles.pad}>
              <ErrorMsg offlineAware>Не вдалося завантажити слова.</ErrorMsg>
            </div>
          )}
          {shown.map((w) => (
            <WordRow key={w.id} word={w} onEdit={(word) => openEdit(word)} fresh={w.id === fresh} />
          ))}
          {words.length > SHOWN && (
            <button
              type="button"
              className={styles.more}
              onClick={() => navigate(topic ? `/topic/${encodeURIComponent(topic)}` : "/topic")}
            >
              Усі слова: {words.length}
            </button>
          )}
          {empty && (
            <Centered className={styles.empty}>
              <h2>
                Тут з'явиться ваш <Mark ink="yellow">словник</Mark>
              </h2>
              <p>Напишіть слово, яке щойно зустріли, у поле вгорі. Переклад і тема з'являться самі.</p>
            </Centered>
          )}
          {!isPending && !isError && !empty && words.length === 0 && (
            <Centered className={styles.empty}>
              <p>У цій темі слів немає.</p>
            </Centered>
          )}
        </section>
      </main>
    </Page>
  );
}
