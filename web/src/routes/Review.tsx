import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { qs } from "../api/client";
import { useSections } from "../api/hooks";
import { Button } from "../components/Button";
import { Centered } from "../components/Centered";
import { Header } from "../components/Header";
import { LinkButton } from "../components/LinkButton";
import { Mark } from "../components/Mark";
import { Page } from "../components/Page";
import { SectionTitle } from "../components/SectionTitle";
import { Segmented } from "../components/Segmented";
import { Skeleton } from "../components/Skeleton";
import { Switch } from "../components/Switch";
import { cx } from "../lib/cx";
import { pluralWords } from "../lib/plural";
import { useActivity, useDirection } from "../lib/settings";
import { getAutoplay, setAutoplay, useVoiceVersion, voiceProblem } from "../lib/speech";
import styles from "./Review.module.css";

/** Pick topics, exercise, direction and audio, then start a session at /study. */
export function Review() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, isPending } = useSections();
  const sections = data ?? [];
  const preselect = params.getAll("section");
  // null = "all topics" until the user changes the selection
  const [chosen, setChosen] = useState<Set<string> | null>(preselect.length ? new Set(preselect) : null);
  const [direction, setDirection] = useDirection();
  const [activity, setActivity] = useActivity();
  const [autoplay, setAutoplayState] = useState(getAutoplay);
  useVoiceVersion(); // the voice list may arrive late
  const problem = voiceProblem();

  const selected = chosen ?? new Set(sections.map((s) => s.name));
  const all = sections.length > 0 && sections.every((s) => selected.has(s.name));
  const anySelected = sections.some((s) => selected.has(s.name));

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setChosen(next);
  };

  function start() {
    const names = sections.map((s) => s.name).filter((n) => selected.has(n));
    navigate(`/study${qs({ section: names.length === sections.length ? [] : names })}`);
  }

  return (
    <Page>
      <Header title="Повторення" home />
      <main className={styles.main}>
        <div className={styles.head}>
          <SectionTitle as="h3" id="review-topics-title" className={styles.title}>
            Теми
          </SectionTitle>
          {sections.length >= 2 && (
            <LinkButton
              className={styles.link}
              onClick={() => setChosen(new Set(all ? [] : sections.map((s) => s.name)))}
            >
              {all ? "Зняти всі" : "Вибрати всі"}
            </LinkButton>
          )}
        </div>
        <div role="group" aria-labelledby="review-topics-title">
          {isPending && <Skeleton kind="row" count={4} />}
          {sections.map((s) => {
            const due = direction === "reverse" ? s.due_reverse : s.due;
            return (
              <label key={s.name} className={styles.check}>
                <input
                  type="checkbox"
                  className={styles.box}
                  checked={selected.has(s.name)}
                  onChange={() => toggle(s.name)}
                />
                <span className={styles.text}>
                  <span className={styles.name}>
                    <Mark topic={s.name}>{s.name}</Mark>
                  </span>
                  <span className={styles.sub}>
                    {due ? `${pluralWords(s.words)}, до повторення ${due}` : pluralWords(s.words)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
        {!isPending && sections.length === 0 && <Centered>Слів ще немає.</Centered>}

        <section className={styles.settings}>
          <div className={styles.row}>
            <span className={styles.label} id="activity-label">Вправа</span>
            <Segmented
              labelledBy="activity-label"
              value={activity}
              onChange={setActivity}
              options={[
                { value: "cards", label: "Картки" },
                { value: "quiz", label: "Квіз" },
              ]}
            />
            {activity === "quiz" && (
              <p className={styles.desc}>Тест із варіантами відповіді. Розклад повторень не змінюється.</p>
            )}
          </div>
          <div className={styles.row}>
            <span className={styles.label} id="dir-label">Напрямок</span>
            <Segmented
              labelledBy="dir-label"
              value={direction}
              onChange={setDirection}
              options={[
                { value: "forward", label: "EN – UA" },
                { value: "reverse", label: "UA – EN" },
              ]}
            />
          </div>
          <div className={cx(styles.row, styles.inline)}>
            <div className={styles.setting}>
              <span className={styles.label} id="autoplay-label">Автоозвучення</span>
              <span className={styles.desc} id="autoplay-desc">Вимовляти слово й речення</span>
              {problem && <span className={cx(styles.desc, styles.voiceStatus)}>{problem}</span>}
            </div>
            <Switch
              checked={autoplay}
              labelledBy="autoplay-label"
              describedBy="autoplay-desc"
              onChange={(v) => {
                setAutoplay(v);
                setAutoplayState(v);
              }}
            />
          </div>
        </section>
      </main>
      <div className={styles.bar}>
        <Button disabled={!anySelected} onClick={start}>
          Почати
        </Button>
      </div>
    </Page>
  );
}
