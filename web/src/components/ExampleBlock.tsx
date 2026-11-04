import type { Word } from "../api/types";
import styles from "./ExampleBlock.module.css";

/** English example sentence with its Ukrainian translation. Renders nothing without an example. */
export function ExampleBlock({ card }: { card: Pick<Word, "example" | "example_translation"> }) {
  if (!card.example) return null;
  return (
    <div className={styles.block}>
      <p className={styles.en} lang="en">
        {card.example}
      </p>
      {card.example_translation && <p className={styles.ua}>{card.example_translation}</p>}
    </div>
  );
}
