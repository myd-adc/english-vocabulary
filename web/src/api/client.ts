// fetch wrapper: bearer token from localStorage, JSON in/out, 401 anywhere -> back to login.

const API_URL = "/api";
const TOKEN_KEY = "lexi_token";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

// ── Token store (subscribable, so React can react to login / logout / 401) ──────
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  emit();
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable
  }
  emit();
}

export function subscribeToken(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── Requests ────────────────────────────────────────────────────────────────────
interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Skip the Authorization header and the 401 handling (login itself). */
  anonymous?: boolean;
}

/** Throws ApiError on a non-2xx response, TypeError when the network is down. */
export async function request<T>(
  path: string,
  { method = "GET", body, anonymous }: RequestOptions = {},
): Promise<T> {
  const token = anonymous ? null : getToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401 && !anonymous) clearToken();
  if (!res.ok) throw new ApiError(res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Query-string builder that repeats array values (?section=a&section=b) and skips empties. */
export function qs(params: Record<string, string | number | string[] | undefined>): string {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => p.append(key, v));
    else p.append(key, String(value));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}
