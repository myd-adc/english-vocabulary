import { qs, request } from "./client";
import type {
  BackfillResult,
  Direction,
  QuickAddResult,
  Section,
  Word,
  WordCreate,
  WordList,
  WordUpdate,
} from "./types";

export const login = (password: string) =>
  request<{ token: string }>("/auth/login", { method: "POST", body: { password }, anonymous: true });

export const getSections = () => request<Section[]>("/sections");

export const getWords = (params: { section?: string[]; q?: string; limit?: number }) =>
  request<WordList>(`/vocabulary${qs({ limit: 1000, ...params })}`);

export const getDue = (direction: Direction, section: string[]) =>
  request<Word[]>(`/vocabulary/due${qs({ direction, section })}`);

export const quickAdd = (text: string) =>
  request<QuickAddResult>("/vocabulary/quick", { method: "POST", body: { text } });

export const createWord = (body: WordCreate) => request<Word>("/vocabulary", { method: "POST", body });

export const updateWord = (id: number, body: WordUpdate) =>
  request<Word>(`/vocabulary/${id}`, { method: "PATCH", body });

export const deleteWord = (id: number) => request<void>(`/vocabulary/${id}`, { method: "DELETE" });

export const reviewWord = (id: number, quality: number, direction: Direction) =>
  request<Word>(`/vocabulary/${id}/review?direction=${direction}`, { method: "PATCH", body: { quality } });

export const renameTopic = (name: string, next: string) =>
  request<{ updated: number }>(`/topics/${encodeURIComponent(name)}`, { method: "PATCH", body: { name: next } });

export const backfillTopics = () => request<BackfillResult>("/topics/backfill", { method: "POST" });
