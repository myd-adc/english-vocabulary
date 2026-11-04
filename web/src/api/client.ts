// fetch wrapper: Supabase access token, JSON in/out, 401 anywhere -> back to the sign-in screen.
import { currentAccessToken, signOut } from "../lib/auth";

const API_URL = "/api";

export class ApiError extends Error {
  readonly status: number;
  /** Machine-readable reason from the server, e.g. "no_access" on a 403. */
  readonly detail: string;
  constructor(status: number, detail = "") {
    super(`HTTP ${status}`);
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

/** Throws ApiError on a non-2xx response, TypeError when the network is down. */
export async function request<T>(path: string, { method = "GET", body }: RequestOptions = {}): Promise<T> {
  const token = await currentAccessToken();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) void signOut();
  if (!res.ok) {
    let detail = "";
    try {
      const data = (await res.json()) as { detail?: unknown };
      if (typeof data.detail === "string") detail = data.detail;
    } catch {
      // not JSON
    }
    throw new ApiError(res.status, detail);
  }
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
