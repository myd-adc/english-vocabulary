import { useNavigate } from "react-router";
import { useSections } from "../api/hooks";
import { cx } from "../lib/cx";
import { pluralWords } from "../lib/plural";
import { Skeleton } from "./Skeleton";
import styles from "./TopicTiles.module.css";

/** Topic grid on the home screen; the last tile opens all words. */
export function TopicTiles() {
  const { data, isPending } = useSections();
  const navigate = useNavigate();
  if (isPending) {
    return (
      <div className={styles.tiles}>
        <Skeleton kind="tile" count={4} />
      </div>
    );
  }
  const sections = data ?? [];
  const total = sections.reduce((sum, s) => sum + s.words, 0);
  return (
    <div className={styles.tiles}>
      {sections.map((s) => (
        <button key={s.name} type="button" className={styles.tile} onClick={() => navigate(`/topic/${encodeURIComponent(s.name)}`)}>
          <span className={styles.name}>{s.name}</span>
          <span className={styles.count}>{pluralWords(s.words)}</span>
        </button>
      ))}
      <button type="button" className={cx(styles.tile, styles.all)} onClick={() => navigate("/topic")}>
        <span className={styles.name}>Усі слова</span>
        <span className={styles.count}>{pluralWords(total)}</span>
      </button>
    </div>
  );
}
