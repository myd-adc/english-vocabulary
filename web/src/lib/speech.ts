// English text-to-speech through the browser's Web Speech API (en-US voice).
import { useSyncExternalStore } from "react";
import type { Word } from "../api/types";

const KEY = "lexi_autoplay";
const RATE = 0.9;
const synth: SpeechSynthesis | null =
  typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;

let autoplay = true;
try {
  autoplay = localStorage.getItem(KEY) !== "false";
} catch {
  // storage unavailable: default applies
}
export const getAutoplay = () => autoplay;
export function setAutoplay(value: boolean) {
  autoplay = value;
  try {
    localStorage.setItem(KEY, String(value));
  } catch {
    // session only
  }
}

let voices: SpeechSynthesisVoice[] = [];
let voice: SpeechSynthesisVoice | null = null;
let version = 0;
const listeners = new Set<() => void>();
const langOf = (v: SpeechSynthesisVoice) => v.lang.replace("_", "-").toLowerCase();

function score(v: SpeechSynthesisVoice) {
  let s = 0;
  if (langOf(v) === "en-us") s += 20;
  else if (langOf(v).startsWith("en")) s += 5;
  if (/premium|enhanced|siri|samantha|google us/i.test(v.name)) s += 5;
  return s;
}

function refreshVoices() {
  if (!synth) return;
  voices = synth.getVoices();
  voice = voices.filter((v) => langOf(v).startsWith("en")).sort((a, b) => score(b) - score(a))[0] ?? null;
  version++;
  listeners.forEach((cb) => cb());
}
if (synth) {
  refreshVoices();
  synth.addEventListener?.("voiceschanged", refreshVoices);
}

function onVoiceChange(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Re-renders the component when the voice list changes. */
export function useVoiceVersion() {
  return useSyncExternalStore(onVoiceChange, () => version);
}

// Optimistic while the voice list is still loading.
export const canSpeak = () => !!synth && (!!voice || voices.length === 0);

export function voiceProblem(): string | null {
  if (!synth) return "Цей браузер не підтримує озвучення.";
  if (!canSpeak())
    return "Англійський голос не знайдено. iPhone: Налаштування › Універсальний доступ › Промовлений вміст › Голоси.";
  return null;
}

// iOS only allows speech after a user gesture: a silent utterance on first tap unlocks it.
let unlocked = false;
function unlockSpeech() {
  if (unlocked || !synth) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  synth.speak(u);
}
if (typeof document !== "undefined") {
  for (const type of ["touchend", "click", "keydown"]) {
    document.addEventListener(type, unlockSpeech, { once: true, capture: true });
  }
}

export const stopSpeaking = () => synth?.cancel();

/** Speak each text in order, replacing whatever is playing. */
export function speak(...texts: (string | null | undefined)[]): boolean {
  const parts = texts.map((t) => (t || "").trim()).filter(Boolean);
  if (!synth || !parts.length || !canSpeak()) return false;
  synth.cancel();
  for (const part of parts) {
    const u = new SpeechSynthesisUtterance(part);
    if (voice) u.voice = voice;
    u.lang = "en-US";
    u.rate = RATE;
    synth.speak(u);
  }
  return true;
}

export const speakCard = (card: Pick<Word, "word" | "example">) => speak(card.word, card.example);
