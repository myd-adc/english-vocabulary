import { useState } from "react";
import { useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { connectClaude } from "../api/endpoints";
import { useMe } from "../api/hooks";
import { signOut } from "../lib/auth";
import { Button } from "../components/Button";
import { LinkButton } from "../components/LinkButton";
import { AuthFrame } from "./Auth";
import styles from "./Auth.module.css";

/** Claude's connector sends people here to approve access to their own dictionary. */
export function Connect() {
  const [params] = useSearchParams();
  const requestId = params.get("request") ?? "";
  const email = useMe().data?.email ?? "";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function allow() {
    setError("");
    setBusy(true);
    try {
      const { redirect_url } = await connectClaude(requestId);
      window.location.assign(redirect_url); // back to Claude with the authorization code
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof ApiError && err.status === 404
          ? "Запит застарів. Почніть підключення в Claude знову."
          : "Не вдалося підключити. Спробуйте ще раз.",
      );
    }
  }

  if (!requestId) {
    return (
      <AuthFrame title="Підключення Claude" lead="Це посилання неповне. Почніть підключення в Claude знову." >
        <></>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      title="Підключити Claude"
      lead={`Claude зможе додавати слова у ваш словник і читати його. Ви увійшли як ${email}.`}
    >
      <Button onClick={() => void allow()} disabled={busy} busy={busy}>
        Дозволити
      </Button>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.aside}>
        <LinkButton onClick={() => void signOut()}>Це не я: вийти</LinkButton>
      </div>
    </AuthFrame>
  );
}
