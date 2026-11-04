import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Header } from "../components/Header";
import { Menu } from "../components/Menu";
import { Page } from "../components/Page";
import { QuickAdd } from "../components/QuickAdd";
import { SectionTitle } from "../components/SectionTitle";
import { TopicTiles } from "../components/TopicTiles";
import styles from "./Home.module.css";

export function Home() {
  const navigate = useNavigate();
  const [note, setNote] = useState("");

  // The backfill note disappears by itself.
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(""), 6000);
    return () => clearTimeout(t);
  }, [note]);

  return (
    <Page>
      <Header title="LexiVocab" home>
        <button type="button" className={styles.review} onClick={() => navigate("/review")}>
          Повторити
        </button>
        <Menu onNote={setNote} />
      </Header>
      <main className={styles.main}>
        <QuickAdd />
        <section aria-labelledby="topics-title" className={styles.topics}>
          <SectionTitle id="topics-title">Теми</SectionTitle>
          <p className={styles.note} role="status" hidden={!note}>
            {note}
          </p>
          <TopicTiles />
        </section>
      </main>
    </Page>
  );
}
