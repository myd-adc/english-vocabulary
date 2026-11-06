import type { Word } from "../api/types";
import { explanation, useExplainLang } from "../lib/explain";
import { speak } from "../lib/speech";
import { shortMeaning } from "../lib/words";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import { Mark } from "./Mark";
import styles from "./WordRow.module.css";

/** One word in a list: headword on its topic's swipe, gloss and explanation beneath.
    Tap the text to edit, the speaker to listen. */
export function WordRow({ word, onEdit }: { word: Word; onEdit: (word: Word) => void }) {
  const explain = explanation(word, useExplainLang().lang);
  return (
    <div className={styles.row}>
      <button type="button" className={styles.main} onClick={() => onEdit(word)}>
        <span className={styles.title}>
          <Mark topic={word.section} lang="en">
            {word.word}
          </Mark>
        </span>
        <span className={styles.def}>{shortMeaning(word)}</span>
        {explain && (
          <span className={styles.explain} lang={explain.lang}>
            {explain.text}
          </span>
        )}
      </button>
      <IconButton className={styles.speak} aria-label={`Прослухати ${word.word}`} onClick={() => speak(word.word)}>
        <Icon name="speaker" />
      </IconButton>
    </div>
  );
}
