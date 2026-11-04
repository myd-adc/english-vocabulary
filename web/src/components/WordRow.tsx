import type { Word } from "../api/types";
import { speak } from "../lib/speech";
import { shortMeaning } from "../lib/words";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import styles from "./WordRow.module.css";

/** One word in a topic list: tap the text to edit, the speaker to listen. */
export function WordRow({ word, onEdit }: { word: Word; onEdit: (word: Word) => void }) {
  return (
    <div className={styles.row}>
      <button type="button" className={styles.main} onClick={() => onEdit(word)}>
        <span className={styles.title}>{word.word}</span>
        <span className={styles.def}>{shortMeaning(word)}</span>
      </button>
      <IconButton className={styles.speak} aria-label={`Прослухати ${word.word}`} onClick={() => speak(word.word)}>
        <Icon name="speaker" />
      </IconButton>
    </div>
  );
}
