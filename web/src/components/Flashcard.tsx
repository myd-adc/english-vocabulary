import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
import type { Direction, Word } from "../api/types";
import { cx } from "../lib/cx";
import { canSpeak, getAutoplay, speak, speakCard, stopSpeaking, useVoiceVersion } from "../lib/speech";
import { shortMeaning } from "../lib/words";
import { Button } from "./Button";
import { ExampleBlock } from "./ExampleBlock";
import { Icon } from "./Icon";
import styles from "./Flashcard.module.css";

const SWIPE_THRESHOLD = 90;

const RATINGS = [
  { quality: 0, label: "Ще раз", hint: "вліво" },
  { quality: 3, label: "Важко" },
  { quality: 4, label: "Добре", hint: "вправо", good: true },
  { quality: 5, label: "Легко" },
];

interface Props {
  card: Word;
  direction: Direction;
  onRate: (quality: number) => void;
  onEdit: () => void;
}

interface Drag {
  x: number;
  y: number;
  dx: number;
  moved: boolean;
  id: number;
}

/** A dictionary entry that flips. Tap flips; swipe right = Good, left = Again once flipped. */
export function Flashcard({ card, direction, onRate, onEdit }: Props) {
  const reverse = direction === "reverse";
  const [flipped, setFlipped] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  useVoiceVersion();

  // A new card starts on its front; in EN -> UA the word is read out right away.
  useEffect(() => {
    stopSpeaking();
    if (!reverse && getAutoplay()) speak(card.word);
  }, [card.id, reverse, card.word]);

  function flip() {
    const next = !flipped;
    setFlipped(next);
    if (next && getAutoplay()) {
      if (reverse) speakCard(card);
      else if (card.example) speak(card.example);
    }
  }

  function resetDrag() {
    drag.current = null;
    const wrap = wrapRef.current;
    if (!wrap) return;
    wrap.classList.remove(styles.dragging!);
    wrap.style.transform = "";
    wrap.style.opacity = "";
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, moved: false, id: e.pointerId };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    const wrap = wrapRef.current;
    if (!d || !wrap || e.pointerId !== d.id) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
      d.moved = true;
      wrap.classList.add(styles.dragging!);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (d.moved) {
      d.dx = dx;
      wrap.style.transform = `translateX(${dx}px) rotate(${dx / 25}deg)`;
      wrap.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 500));
    }
  }

  function onPointerUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    resetDrag();
    if (!d.moved) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 50);
    if (Math.abs(d.dx) < SWIPE_THRESHOLD) return;
    if (!flipped) flip();
    else onRate(d.dx > 0 ? 4 : 0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      flip();
    }
  }

  const showSpeaker = canSpeak() && !(reverse && !flipped);

  return (
    <div className={styles.area}>
      <div className={styles.wrap} ref={wrapRef}>
        <div
          className={cx(styles.scene, flipped && styles.flipped)}
          role="button"
          tabIndex={0}
          aria-label="Торкнись, щоб перевернути картку"
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={resetDrag}
          onClick={() => {
            if (suppressClick.current || window.getSelection()?.toString()) return;
            flip();
          }}
        >
          <div className={styles.card}>
            <div className={styles.front}>
              <div className={styles.lang}>{reverse ? "Українська" : "English"}</div>
              <div className={styles.wordRow}>
                <div className={styles.word} lang={reverse ? "uk" : "en"}>
                  {reverse ? shortMeaning(card) : card.word}
                </div>
              </div>
              {(reverse ? card.part_of_speech : card.transcription) && (
                <div className={styles.ipa}>{reverse ? card.part_of_speech : card.transcription}</div>
              )}
              <div className={styles.hint}>торкнись, щоб перевернути</div>
            </div>
            <div className={styles.back}>
              <div className={styles.lang}>{reverse ? "English" : "Українська"}</div>
              {!reverse && <div className={styles.backWord} lang="en">{card.word}</div>}
              <div className={styles.definition} lang={reverse ? "en" : "uk"}>
                {reverse ? card.word : card.translation}
              </div>
              {reverse && card.transcription && <div className={styles.ipa}>{card.transcription}</div>}
              {!reverse && card.part_of_speech && <div className={styles.pos}>{card.part_of_speech}</div>}
              <ExampleBlock card={card} />
              {card.notes && <div className={styles.notes}>{card.notes}</div>}
            </div>
          </div>
        </div>
      </div>

      {showSpeaker && (
        <div className={styles.speakRow}>
          <Button
            variant="secondary"
            className={styles.speak}
            onClick={() => (flipped || reverse ? speakCard(card) : speak(card.word))}
          >
            <Icon name="speaker" />
            Прослухати
          </Button>
        </div>
      )}

      {flipped && (
        <div className={styles.ratings}>
          <p className={styles.ratingLabel}>Як згадалось слово?</p>
          <div className={styles.ratingRow}>
            {RATINGS.map((r) => (
              <button key={r.quality} type="button" className={cx(styles.rating, "good" in r && styles.good)} onClick={() => onRate(r.quality)}>
                {r.label}
                {r.hint && <small>{r.hint}</small>}
              </button>
            ))}
          </div>
          <button type="button" className={styles.edit} onClick={onEdit}>
            Редагувати
          </button>
        </div>
      )}
    </div>
  );
}
