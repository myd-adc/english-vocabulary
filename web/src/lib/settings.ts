import { useState } from "react";
import type { Direction } from "../api/types";

export type Activity = "cards" | "quiz";

const DIR_KEY = "lexi_dir";
const ACTIVITY_KEY = "lexi_activity";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // session only
  }
}

export const readDirection = (): Direction => (read(DIR_KEY) === "reverse" ? "reverse" : "forward");
export const readActivity = (): Activity => (read(ACTIVITY_KEY) === "quiz" ? "quiz" : "cards");

export function useDirection() {
  const [value, set] = useState(readDirection);
  return [
    value,
    (v: Direction) => {
      write(DIR_KEY, v);
      set(v);
    },
  ] as const;
}

export function useActivity() {
  const [value, set] = useState(readActivity);
  return [
    value,
    (v: Activity) => {
      write(ACTIVITY_KEY, v);
      set(v);
    },
  ] as const;
}
