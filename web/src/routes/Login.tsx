import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { ApiError, setToken } from "../api/client";
import { login } from "../api/endpoints";
import { Button } from "../components/Button";
import { TextInput } from "../components/TextInput";
import styles from "./Login.module.css";

export function Login() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { token } = await login(password);
      setBusy(false);
      navigate("/", { replace: true });
      setToken(token);
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiError) {
        setError(err.status === 429 ? "Забагато спроб. Спробуй за кілька хвилин." : "Невірний пароль.");
        inputRef.current?.select();
      } else {
        setError("Немає з'єднання з сервером.");
      }
    }
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <img src="/icon-192.png" alt="LexiVocab" className={styles.logo} />
        <h1>LexiVocab</h1>
        <form onSubmit={submit}>
          <TextInput
            ref={inputRef}
            type="password"
            className={styles.input}
            placeholder="Пароль"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" disabled={busy} busy={busy}>
            Увійти
          </Button>
        </form>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
