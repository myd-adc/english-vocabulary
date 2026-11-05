import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { getDue, getWords, reviewWord } from "../api/endpoints";
import type { Word } from "../api/types";
import { Button } from "../components/Button";
import { Centered } from "../components/Centered";
import { useEditSheet } from "../components/EditSheet";
import { ErrorMsg } from "../components/ErrorMsg";
import { Flashcard } from "../components/Flashcard";
import { Header } from "../components/Header";
import { Page } from "../components/Page";
import { Quiz } from "../components/Quiz";
import { Spinner } from "../components/Skeleton";
import { readActivity, readDirection } from "../lib/settings";
import { stopSpeaking } from "../lib/speech";
import { shuffle } from "../lib/words";
import styles from "./Study.module.css";

type Phase =
  | { name: "loading" }
  | { name: "error" }
  | { name: "empty" }
  | { name: "notice"; text: string }
  | { name: "cards" }
  | { name: "quiz"; cards: Word[]; deck: Word[] }
  | { name: "done"; text: string };

/** /study?section=a&section=b — a flashcard session or a quiz over the chosen topics. */
export function Study() {
  const navigate = useNavigate();
  const openEdit = useEditSheet();
  const [params] = useSearchParams();
  const sections = params.getAll("section");
  const sectionKey = sections.join("\n");
  // The exercise and direction chosen on the review screen are fixed for the session.
  const [direction] = useState(readDirection);
  const [activity] = useState(readActivity);

  const [phase, setPhase] = useState<Phase>({ name: "loading" });
  const [run, setRun] = useState(0);
  const [cards, setCards] = useState<Word[]>([]);
  const [index, setIndex] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [quizProgress, setQuizProgress] = useState("");
  const rating = useRef(false);

  // Load the session (again on "Ще раз").
  useEffect(() => {
    let cancelled = false;
    setPhase({ name: "loading" });
    setQuizProgress("");
    (async () => {
      try {
        if (activity === "quiz") {
          const [deck, chosen] = await Promise.all([
            getWords({ limit: 1000 }),
            sections.length ? getWords({ limit: 1000, section: sections }) : null,
          ]);
          if (cancelled) return;
          const quizCards = (chosen ?? deck).words;
          if (deck.words.length < 4 || quizCards.length === 0) {
            const text =
              deck.words.length < 4 ? "Для квізу потрібно щонайменше 4 слова." : "У вибраних темах слів немає.";
            setPhase({ name: "notice", text });
          } else {
            setPhase({ name: "quiz", cards: quizCards, deck: deck.words });
          }
        } else {
          const due = shuffle(await getDue(direction, sections));
          if (cancelled) return;
          setCards(due);
          setIndex(0);
          setReviewed(0);
          setPhase(due.length ? { name: "cards" } : { name: "empty" });
        }
      } catch {
        if (!cancelled) setPhase({ name: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [run, activity, direction, sectionKey]); // `sections` is derived from sectionKey

  useEffect(() => stopSpeaking, []);

  const card = cards[index];

  async function rate(quality: number) {
    if (!card || rating.current) return;
    rating.current = true;
    try {
      await reviewWord(card.id, quality, direction);
    } catch {
      // best effort: don't block studying on a network hiccup
    }
    rating.current = false;
    setReviewed((n) => n + 1);
    if (index + 1 >= cards.length) finishCards(reviewed + 1);
    else setIndex(index + 1);
  }

  const finishCards = (n: number) => setPhase({ name: "done", text: n ? `Повторено слів: ${n}.` : "" });

  function editCard() {
    if (!card) return;
    openEdit(card, {
      onSaved: (updated) => setCards((cs) => cs.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))),
      onDeleted: () => {
        const rest = cards.filter((c) => c.id !== card.id);
        setCards(rest);
        if (index >= rest.length) finishCards(reviewed);
      },
    });
  }

  let progress = "";
  if (phase.name === "cards") progress = `${index + 1} / ${cards.length}`;
  else if (phase.name === "quiz") progress = quizProgress;

  return (
    <Page>
      <Header title="Навчання">
        <span className={styles.progress}>{progress}</span>
      </Header>
      <main className={styles.main}>
        {phase.name === "loading" && (
          <Centered>
            <Spinner />
            Завантаження…
          </Centered>
        )}
        {phase.name === "error" && <ErrorMsg offlineAware>Не вдалося завантажити слова.</ErrorMsg>}
        {phase.name === "empty" && (
          <Centered>
            <p>На сьогодні слів немає.</p>
            <Button variant="secondary" onClick={() => navigate("/")}>
              На головну
            </Button>
          </Centered>
        )}
        {phase.name === "notice" && <Centered className={styles.notice}>{phase.text}</Centered>}
        {phase.name === "done" && (
          <Centered>
            <h2>Сесію завершено</h2>
            <p>{phase.text}</p>
            <Button onClick={() => setRun((r) => r + 1)}>Ще раз</Button>
            <Button variant="secondary" onClick={() => navigate("/")}>
              На головну
            </Button>
          </Centered>
        )}
        {phase.name === "cards" && card && (
          <Flashcard key={`${index}:${card.id}`} card={card} direction={direction} onRate={rate} onEdit={editCard} />
        )}
        {phase.name === "quiz" && (
          <Quiz
            key={run}
            cards={phase.cards}
            pool={phase.deck}
            onProgress={setQuizProgress}
            onFinish={({ asked, correct }) => {
              setQuizProgress("");
              setPhase({
                name: "done",
                text: asked ? `Відповідей: ${asked}, правильних: ${correct}.` : "Квіз завершено без відповідей.",
              });
            }}
          />
        )}
      </main>
    </Page>
  );
}
