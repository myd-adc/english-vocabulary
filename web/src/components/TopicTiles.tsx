import { useNavigate } from "react-router";
import { useSections } from "../api/hooks";
import { cx } from "../lib/cx";
import { pluralWords } from "../lib/plural";
import { Icon } from "./Icon";
import { Mark } from "./Mark";
import { Skeleton } from "./Skeleton";
import styles from "./TopicTiles.module.css";

/** Topic list: each topic's name on its marker swipe with the word count; the last row opens all words. */
export function TopicTiles() {
  const { data, isPending } = useSections();
  const navigate = useNavigate();
  if (isPending) {
    return (
      <div className={styles.tiles}>
        <Skeleton kind="tile" count={5} />
      </div>
    );
  }
  const sections = data ?? [];
  const total = sections.reduce((sum, s) => sum + s.words, 0);
  return (
    <div className={styles.tiles}>
      {sections.map((s) => (
        <button key={s.name} type="button" className={styles.tile} onClick={() => navigate(`/topic/${encodeURIComponent(s.name)}`)}>
          <span className={styles.name}>
            <Mark topic={s.name}>{s.name}</Mark>
          </span>
          <span className={styles.count}>{pluralWords(s.words)}</span>
          <Icon name="chevron-right" size={18} />
        </button>
      ))}
      <button type="button" className={cx(styles.tile, styles.all)} onClick={() => navigate("/topic")}>
        <span className={styles.name}>Усі слова</span>
        <span className={styles.count}>{pluralWords(total)}</span>
        <Icon name="chevron-right" size={18} />
      </button>
    </div>
  );
}
