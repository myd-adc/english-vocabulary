import { useEffect, useRef, useState } from "react";
import type { Word } from "../api/types";
import { cx } from "../lib/cx";
import { isEnglishOption, optionLabel, QuizSession } from "../lib/quiz";
import type { Step } from "../lib/quiz";
import { getAutoplay, speak, speakCard, stopSpeaking } from "../lib/speech";
import { shortMeaning } from "../lib/words";
import { Button } from "./Button";
import { ExampleBlock } from "./ExampleBlock";
import { Icon } from "./Icon";
import { Mark } from "./Mark";
import { LinkButton } from "./LinkButton";
import styles from "./Quiz.module.css";

interface Props {
  cards: Word[];
  /** Whole deck: wrong options are drawn from here. */
  pool: Word[];
  onProgress: (text: string) => void;
  onFinish: (result: { asked: number; correct: number }) => void;
}

export function Quiz({ cards, pool, onProgress, onFinish }: Props) {
  const [{ session, first }] = useState(() => {
    const s = new QuizSession(cards, pool);
    return { session: s, first: s.next() };
  });
  const [step, setStep] = useState<Step | null>(first);
  const [picked, setPicked] = useState<number | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  const finish = () => onFinish({ asked: session.asked, correct: session.correct });

  useEffect(() => {
    if (!step) return finish();
    onProgress(step.progress);
    // Only the listening question speaks by itself; otherwise the answer would be given away.
    if (step.question.kind === "listen") speak(step.question.card.word);
  }, [step]);

  useEffect(() => stopSpeaking, []);

  useEffect(() => {
    if (picked !== null) nextRef.current?.focus({ preventScroll: true });
  }, [picked]);

  // Number keys pick the option with that number.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!step || picked !== null || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const option = step.question.options[Number(e.key) - 1];
      if (option) answer(option.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  if (!step) return null;
  const { card, kind, options } = step.question;
  const english = isEnglishOption(kind);

  function answer(id: number) {
    if (picked !== null) return;
    setPicked(id);
    session.record(id === card.id);
    if (getAutoplay()) speakCard(card);
  }

  function next() {
    session.advance();
    setPicked(null);
    setStep(session.next());
  }

  const correct = picked === card.id;

  return (
    <div className={styles.quiz}>
      <div className={styles.prompt}>
        {kind === "en2ua" && (
          <>
            <p className={styles.label}>Що означає це слово?</p>
            <span className={styles.word} lang="en">
              <Mark topic={card.section}>{card.word}</Mark>
            </span>
            {card.transcription && <p className={styles.ipa}>{card.transcription}</p>}
          </>
        )}
        {kind === "ua2en" && (
          <>
            <p className={styles.label}>Як це англійською?</p>
            <p className={styles.meaning}>{shortMeaning(card)}</p>
          </>
        )}
        {kind === "listen" && (
          <>
            <p className={styles.label}>Послухай і вибери слово</p>
            <Button variant="secondary" className={styles.play} onClick={() => speak(card.word)}>
              <Icon name="speaker" />
              Відтворити
            </Button>
          </>
        )}
      </div>

      <div className={styles.options} role="group" aria-label="Відповіді">
        {options.map((option, i) => (
          <button
            key={option.id}
            type="button"
            className={cx(
              styles.option,
              english && styles.optionEn,
              picked !== null && option.id === card.id && styles.right,
              picked !== null && option.id !== card.id && option.id === picked && styles.wrong,
            )}
            disabled={picked !== null}
            onClick={() => answer(option.id)}
          >
            <span className={styles.key} aria-hidden="true">
              {i + 1}
            </span>
            <span lang={english ? "en" : undefined}>{optionLabel(kind, option)}</span>
          </button>
        ))}
      </div>

      <div className={styles.result} aria-live="polite">
        {picked !== null && (
          <>
            <p className={cx(styles.verdict, correct ? styles.ok : styles.no)}>{correct ? "Правильно" : "Неправильно"}</p>
            <span className={cx(styles.word, styles.wordSm)} lang="en">
              <Mark topic={card.section}>{card.word}</Mark>
            </span>
            {card.transcription && <p className={styles.ipa}>{card.transcription}</p>}
            <p className={styles.english}>{card.translation}</p>
            {card.definition && (
              <p className={styles.explain} lang="en">
                {card.definition}
              </p>
            )}
            <ExampleBlock card={card} />
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => speakCard(card)}>
                <Icon name="speaker" />
                Прослухати
              </Button>
              <Button ref={nextRef} onClick={next}>
                Далі
              </Button>
            </div>
          </>
        )}
      </div>

      <LinkButton className={styles.stop} onClick={finish}>
        Завершити квіз
      </LinkButton>
    </div>
  );
}
