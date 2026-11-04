import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type AuthState =
  | { status: "loading" }
  | { status: "out" }
  | { status: "recovery" } // opened the password-reset link: must choose a new password
  | { status: "in"; session: Session };

/** Current Supabase session (supabase-js keeps it in localStorage and refreshes the token). */
export function useAuth(): { state: AuthState; finishRecovery: () => void } {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setSession((s) => (s === undefined ? data.session : s));
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (event === "SIGNED_OUT") setRecovery(false);
      setSession(next);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const finishRecovery = useCallback(() => setRecovery(false), []);

  let state: AuthState;
  if (session === undefined) state = { status: "loading" };
  else if (!session) state = { status: "out" };
  else if (recovery) state = { status: "recovery" };
  else state = { status: "in", session };
  return { state, finishRecovery };
}

/** Local sign-out: never waits for the network, so it also works offline or with a dead token. */
export const signOut = () => supabase.auth.signOut({ scope: "local" });

export async function currentAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// ── Supabase errors in Ukrainian ────────────────────────────────────────────────

interface AuthLikeError {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

export const ALREADY_REGISTERED = "Цей email уже зареєстровано. Спробуйте увійти.";

export function authErrorMessage(err: unknown): string {
  const e = (err ?? {}) as AuthLikeError;
  const code = e.code ?? "";
  const msg = (e.message ?? "").toLowerCase();
  if (e.name === "AuthRetryableFetchError" || err instanceof TypeError) return "Немає з'єднання з сервером.";
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) return "Невірний email або пароль.";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed"))
    return "Email ще не підтверджено. Перевірте пошту.";
  if (code === "user_already_exists" || msg.includes("already registered")) return ALREADY_REGISTERED;
  if (code === "weak_password" || msg.includes("password should be")) return "Пароль занадто слабкий: мінімум 6 символів.";
  if (code === "same_password" || msg.includes("different from the old"))
    return "Новий пароль має відрізнятися від попереднього.";
  if (code === "validation_failed" || msg.includes("valid email") || msg.includes("invalid format"))
    return "Перевірте адресу email.";
  if (code === "signup_disabled") return "Реєстрацію вимкнено.";
  if (code.includes("rate_limit") || e.status === 429) return "Забагато спроб. Зачекайте трохи.";
  if (code === "provider_disabled" || msg.includes("provider is not enabled")) return "Вхід через Google не налаштовано.";
  return "Не вдалося виконати запит. Спробуйте ще раз.";
}
