import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { ALREADY_REGISTERED, authErrorMessage } from "../lib/auth";
import { supabase } from "../lib/supabase";
import { Button } from "../components/Button";
import { LinkButton } from "../components/LinkButton";
import { Segmented } from "../components/Segmented";
import { TextInput } from "../components/TextInput";
import styles from "./Auth.module.css";

/** Shared frame of every full-screen account screen: logo, title, optional lead text. */
export function AuthFrame({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <img src="/icon-192.png" alt="" className={styles.logo} />
        <h1>{title}</h1>
        {lead && <p className={styles.lead}>{lead}</p>}
        {children}
      </div>
    </div>
  );
}

type Mode = "signin" | "signup" | "forgot";

const SUBMIT_LABEL: Record<Mode, string> = {
  signin: "Увійти",
  signup: "Створити акаунт",
  forgot: "Надіслати лист",
};

/** Email + password, Google, sign-up and password reset: one screen, three modes. */
export function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setInfo("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setInfo("");
    setBusy(true);
    const address = email.trim();
    // Come back to the same page (it may be /connect?request=...), signed in.
    const back = window.location.href;
    try {
      if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: address, password });
        if (err) throw err;
        // the session arrives through onAuthStateChange and replaces this screen
      } else if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: address,
          password,
          options: { emailRedirectTo: back },
        });
        if (err) throw err;
        if (data.user && data.user.identities?.length === 0) {
          setError(ALREADY_REGISTERED); // Supabase hides existing accounts behind an empty identity list
        } else if (!data.session) {
          setMode("signin");
          setPassword("");
          setInfo("Перевірте пошту, щоб підтвердити email.");
        }
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(address, {
          redirectTo: `${window.location.origin}/`,
        });
        if (err) throw err;
        setMode("signin");
        setInfo("Якщо такий акаунт є, ми надіслали лист із посиланням для нового пароля.");
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setError("");
    setInfo("");
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (err) setError(authErrorMessage(err));
  }

  return (
    <AuthFrame title="Dicktionary" lead={mode === "forgot" ? "Надішлемо посилання для нового пароля." : undefined}>
      {mode !== "forgot" && (
        <>
          <span id="auth-mode" className={styles.srOnly}>
            Вхід або реєстрація
          </span>
          <Segmented
            labelledBy="auth-mode"
            value={mode}
            options={[
              { value: "signin", label: "Увійти" },
              { value: "signup", label: "Створити акаунт" },
            ]}
            onChange={switchMode}
          />
        </>
      )}
      <form onSubmit={submit}>
        <TextInput
          type="email"
          className={styles.input}
          placeholder="Email"
          aria-label="Email"
          autoComplete="email"
          inputMode="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== "forgot" && (
          <TextInput
            type="password"
            className={styles.input}
            placeholder="Пароль"
            aria-label="Пароль"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            minLength={mode === "signup" ? 6 : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
        <Button type="submit" disabled={busy} busy={busy}>
          {SUBMIT_LABEL[mode]}
        </Button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {info && (
        <p className={styles.info} role="status">
          {info}
        </p>
      )}
      {mode === "signin" && (
        <div className={styles.aside}>
          <LinkButton onClick={() => switchMode("forgot")}>Забули пароль?</LinkButton>
        </div>
      )}
      {mode === "forgot" ? (
        <div className={styles.aside}>
          <LinkButton onClick={() => switchMode("signin")}>Назад до входу</LinkButton>
        </div>
      ) : (
        <>
          <div className={styles.divider} aria-hidden="true">
            або
          </div>
          <Button variant="secondary" className={styles.google} onClick={() => void google()}>
            <GoogleMark />
            Увійти через Google
          </Button>
        </>
      )}
    </AuthFrame>
  );
}

/** Shown after opening the reset-password link: choose a new password, then carry on signed in. */
export function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) setError(authErrorMessage(err));
    else onDone();
  }

  return (
    <AuthFrame title="Новий пароль" lead="Придумайте пароль, яким будете входити.">
      <form onSubmit={submit}>
        <TextInput
          type="password"
          className={styles.input}
          placeholder="Новий пароль"
          aria-label="Новий пароль"
          autoComplete="new-password"
          minLength={6}
          required
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" disabled={busy} busy={busy}>
          Зберегти пароль
        </Button>
      </form>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </AuthFrame>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.63h6.45a5.51 5.51 0 0 1-2.39 3.62v3h3.87c2.27-2.09 3.57-5.17 3.57-8.8z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.09A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.29 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l4-3.09z" />
      <path fill="#EA4335" d="M12 4.76c1.76 0 3.34.61 4.59 1.8l3.43-3.43C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.62l4 3.09C6.23 6.87 8.88 4.76 12 4.76z" />
    </svg>
  );
}
