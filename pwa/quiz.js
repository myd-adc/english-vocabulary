// Multiple-choice quiz: EN → UA, UA → EN and listen → EN, looping over the given cards
// (reshuffled every round) until stopped. Practice only: never touches the SM-2 schedule.
import { canSpeak, getSettings, speak, speakCard, stopSpeaking } from "./speech.js";

const OPTION_COUNT = 4;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  el.append(...children.filter((c) => c != null));
  return el;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function exampleBlock(card) {
  if (!card.example) return null;
  return h(
    "div",
    { class: "ex-block" },
    h("p", { class: "ex-en", lang: "en", text: card.example }),
    card.example_translation ? h("p", { class: "ex-ua", text: card.example_translation }) : null
  );
}

// label(card) = what an option shows (and what must differ between options)
const KINDS = {
  en2ua: { label: (c) => c.translation, english: false },
  ua2en: { label: (c) => c.word, english: true },
  listen: { label: (c) => c.word, english: true },
};

function kindsFor(card) {
  const kinds = ["en2ua", "ua2en"];
  if (canSpeak()) kinds.push("listen");
  return kinds;
}

function distractors(card, kind, pool) {
  const { label } = KINDS[kind];
  const seen = new Set([label(card).toLowerCase()]);
  const sim = (c) => (c.part_of_speech && c.part_of_speech === card.part_of_speech ? 1 : 0);
  const candidates = shuffle(pool)
    .filter((c) => c.id !== card.id)
    .sort((a, b) => sim(b) - sim(a))
    .filter((c) => {
      const t = label(c).toLowerCase();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  return shuffle(candidates.slice(0, 8)).slice(0, OPTION_COUNT - 1);
}

function buildQuestion(card, pool, previousKind) {
  const kinds = shuffle(kindsFor(card)).sort(
    (a, b) => (a === previousKind ? 1 : 0) - (b === previousKind ? 1 : 0)
  );
  for (const kind of kinds) {
    const others = distractors(card, kind, pool);
    if (others.length === OPTION_COUNT - 1) return { card, kind, options: shuffle([card, ...others]) };
  }
  return null;
}

// root: element to render into; hooks: { onProgress(text), onFinish({asked, correct}) }
export function createQuiz(root, hooks) {
  let cards = [];
  let pool = [];
  let queue = [];
  let index = 0;
  let round = 0;
  let asked = 0;
  let correctCount = 0;
  let questionsThisRound = 0;
  let previousKind = null;
  let current = null;
  let active = false;

  function stop() {
    active = false;
    stopSpeaking();
    root.replaceChildren();
  }
  function finish() {
    stop();
    hooks.onFinish({ asked, correct: correctCount });
  }

  function start({ cards: cardList, fullDeck }) {
    stop();
    active = true;
    cards = cardList;
    pool = fullDeck;
    queue = [];
    index = 0;
    round = 0;
    asked = 0;
    correctCount = 0;
    questionsThisRound = 0;
    previousKind = null;
    next();
  }

  function newRound() {
    const last = queue[queue.length - 1];
    queue = shuffle(cards);
    if (queue.length > 1 && queue[0] === last) queue.push(queue.shift());
    index = 0;
    round++;
    questionsThisRound = 0;
  }

  function next() {
    for (;;) {
      if (index >= queue.length) {
        if (round > 0 && questionsThisRound === 0) return finish();
        newRound();
      }
      const question = buildQuestion(queue[index], pool, previousKind);
      if (question) {
        questionsThisRound++;
        previousKind = question.kind;
        current = { question, answered: false };
        hooks.onProgress(`Коло ${round} · ${index + 1} / ${queue.length}`);
        render();
        return;
      }
      index++;
    }
  }

  function render() {
    const { card, kind, options } = current.question;
    const prompt = h("div", { class: "quiz-prompt" });
    if (kind === "en2ua") {
      prompt.append(
        h("p", { class: "quiz-label", text: "Що означає це слово?" }),
        h("span", { class: "quiz-word", lang: "en", text: card.word }),
        card.transcription ? h("p", { class: "card-ipa", text: card.transcription }) : null
      );
    } else if (kind === "ua2en") {
      prompt.append(
        h("p", { class: "quiz-label", text: "Як це буде англійською?" }),
        h("p", { class: "quiz-meaning", text: card.translation })
      );
    } else {
      prompt.append(
        h("p", { class: "quiz-label", text: "Послухайте й оберіть слово" }),
        h("button", {
          class: "btn btn-secondary quiz-play",
          type: "button",
          text: "🔊 Відтворити",
          onclick: () => speak(card.word),
        })
      );
    }

    const opts = h("div", { class: "quiz-options", role: "group", "aria-label": "Відповіді" });
    options.forEach((option, i) => {
      const btn = h("button", {
        class: `quiz-option${KINDS[kind].english ? " quiz-option-en" : ""}`,
        type: "button",
        "data-id": String(option.id),
        onclick: () => answer(option.id),
      });
      btn.append(
        h("span", { class: "quiz-key", "aria-hidden": "true", text: String(i + 1) }),
        h("span", { text: KINDS[kind].label(option), ...(KINDS[kind].english ? { lang: "en" } : {}) })
      );
      opts.append(btn);
    });

    root.replaceChildren(
      prompt,
      opts,
      h("div", { class: "quiz-result", "aria-live": "polite" }),
      h("button", { class: "link-btn quiz-stop", type: "button", text: "Завершити квіз", onclick: finish })
    );
    // Only the listening question speaks by itself; otherwise the answer would be given away.
    if (kind === "listen") speak(card.word);
  }

  function answer(pickedId) {
    if (!current || current.answered) return;
    current.answered = true;
    const { card } = current.question;
    const correct = pickedId === card.id;
    asked++;
    if (correct) correctCount++;
    for (const btn of root.querySelectorAll(".quiz-option")) {
      btn.disabled = true;
      const id = Number(btn.dataset.id);
      if (id === card.id) btn.classList.add("right");
      else if (id === pickedId) btn.classList.add("wrong");
    }
    const nextBtn = h("button", {
      class: "btn btn-primary quiz-next",
      type: "button",
      text: "Далі →",
      onclick: () => {
        index++;
        next();
      },
    });
    root.querySelector(".quiz-result").replaceChildren(
      h("p", { class: `quiz-verdict ${correct ? "ok" : "no"}`, text: correct ? "✓ Правильно" : "✗ Не зовсім" }),
      h("span", { class: "quiz-word quiz-word-sm", lang: "en", text: card.word }),
      card.transcription ? h("p", { class: "card-ipa", text: card.transcription }) : null,
      h("p", { class: "quiz-english", text: card.translation }),
      exampleBlock(card),
      h(
        "div",
        { class: "quiz-actions" },
        h("button", {
          class: "btn btn-secondary",
          type: "button",
          text: "🔊 Прослухати",
          onclick: () => speakCard(card),
        }),
        nextBtn
      )
    );
    nextBtn.focus({ preventScroll: true });
    if (getSettings().autoplay) speakCard(card);
  }

  return { start, stop };
}
