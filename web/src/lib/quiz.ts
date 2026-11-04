// Multiple-choice quiz engine: EN -> UA, UA -> EN and listen -> EN, looping over the given cards
// (reshuffled every round) until stopped. Practice only: never touches the SM-2 schedule.
import type { Word } from "../api/types";
import { canSpeak } from "./speech";
import { shortMeaning, shuffle } from "./words";

const OPTION_COUNT = 4;

export type QuizKind = "en2ua" | "ua2en" | "listen";

export interface Question {
  card: Word;
  kind: QuizKind;
  options: Word[];
}

export interface Step {
  question: Question;
  progress: string;
}

/** What an option shows (and what must differ between options). */
export const optionLabel = (kind: QuizKind, c: Word) => (kind === "en2ua" ? shortMeaning(c) : c.word);
/** Options in English are set in the serif face. */
export const isEnglishOption = (kind: QuizKind) => kind !== "en2ua";

function kindsFor(): QuizKind[] {
  const kinds: QuizKind[] = ["en2ua", "ua2en"];
  if (canSpeak()) kinds.push("listen");
  return kinds;
}

function distractors(card: Word, kind: QuizKind, pool: Word[]): Word[] {
  const seen = new Set([optionLabel(kind, card).toLowerCase()]);
  const sim = (c: Word) => (c.part_of_speech && c.part_of_speech === card.part_of_speech ? 1 : 0);
  const candidates = shuffle(pool)
    .filter((c) => c.id !== card.id)
    .sort((a, b) => sim(b) - sim(a))
    .filter((c) => {
      const t = optionLabel(kind, c).toLowerCase();
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
  return shuffle(candidates.slice(0, 8)).slice(0, OPTION_COUNT - 1);
}

function buildQuestion(card: Word, pool: Word[], previousKind: QuizKind | null): Question | null {
  const kinds = shuffle(kindsFor()).sort((a, b) => (a === previousKind ? 1 : 0) - (b === previousKind ? 1 : 0));
  for (const kind of kinds) {
    const others = distractors(card, kind, pool);
    if (others.length === OPTION_COUNT - 1) return { card, kind, options: shuffle([card, ...others]) };
  }
  return null;
}

export class QuizSession {
  asked = 0;
  correct = 0;
  private queue: Word[] = [];
  private index = 0;
  private round = 0;
  private questionsThisRound = 0;
  private previousKind: QuizKind | null = null;

  /** cards: what is asked; pool: where wrong options come from. */
  constructor(
    private readonly cards: Word[],
    private readonly pool: Word[],
  ) {}

  private newRound() {
    const last = this.queue[this.queue.length - 1];
    this.queue = shuffle(this.cards);
    if (this.queue.length > 1 && this.queue[0] === last) this.queue.push(this.queue.shift()!);
    this.index = 0;
    this.round++;
    this.questionsThisRound = 0;
  }

  /** The next question, or null when no further question can be built. */
  next(): Step | null {
    for (;;) {
      if (this.index >= this.queue.length) {
        if (this.round > 0 && this.questionsThisRound === 0) return null;
        this.newRound();
      }
      const question = buildQuestion(this.queue[this.index]!, this.pool, this.previousKind);
      if (question) {
        this.questionsThisRound++;
        this.previousKind = question.kind;
        return { question, progress: `Коло ${this.round}, ${this.index + 1} з ${this.queue.length}` };
      }
      this.index++;
    }
  }

  record(correct: boolean) {
    this.asked++;
    if (correct) this.correct++;
  }

  /** Move past the current card; call next() afterwards. */
  advance() {
    this.index++;
  }
}
