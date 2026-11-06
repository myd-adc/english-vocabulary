// Mirrors app/models.py.

export type Direction = "forward" | "reverse";

export interface Word {
  id: number;
  word: string;
  translation: string;
  transcription: string | null;
  part_of_speech: string | null;
  example: string | null;
  example_translation: string | null;
  notes: string | null;
  section: string | null;
  main_translation: string | null;
  definition: string | null;
  created_at: string;
  interval: number;
  ease_factor: number;
  repetitions: number;
  lapses: number;
  next_review: string;
  reverse_interval: number;
  reverse_ease_factor: number;
  reverse_repetitions: number;
  reverse_lapses: number;
  reverse_next_review: string;
}

/** Editable word fields (WordCreate / WordUpdate). */
export interface WordFields {
  word: string;
  translation: string;
  transcription: string | null;
  part_of_speech: string | null;
  example: string | null;
  example_translation: string | null;
  notes: string | null;
  section: string | null;
  main_translation: string | null;
  definition: string | null;
}

export type WordCreate = Pick<WordFields, "word" | "translation"> & Partial<WordFields>;
/** Only the fields that are sent change; null clears an optional one. */
export type WordUpdate = { [K in keyof WordFields]?: WordFields[K] | null };

export interface WordList {
  total: number;
  words: Word[];
}

export interface Section {
  name: string;
  words: number;
  due: number;
  due_reverse: number;
}

export type QuickAddStatus = "created" | "exists" | "not_english" | "unavailable";

export interface QuickAddResult {
  status: QuickAddStatus;
  input: string;
  word: Word | null;
}

export interface BackfillResult {
  updated: number;
  remaining: number;
}
