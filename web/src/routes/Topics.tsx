import { useSections } from "../api/hooks";
import { useEditSheet } from "../components/EditSheet";
import { Header } from "../components/Header";
import { Icon } from "../components/Icon";
import { Page } from "../components/Page";
import { TopicTiles } from "../components/TopicTiles";
import { plural } from "../lib/plural";
import styles from "./Topics.module.css";

/** /topics — every topic with its marker colour and word count. */
export function Topics() {
  const openEdit = useEditSheet();
  const { data } = useSections();
  const count = data?.length ?? 0;
  return (
    <Page>
      <Header title="Теми" home>
        {count > 0 && <span className={styles.count}>{plural(count, "тема", "теми", "тем")}</span>}
      </Header>
      <main className={styles.main}>
        <TopicTiles />
      </main>
      <button type="button" className={styles.fab} aria-label="Додати слово" onClick={() => openEdit(null)}>
        <Icon name="plus" size={26} />
      </button>
    </Page>
  );
}
