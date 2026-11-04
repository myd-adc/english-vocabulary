import { signOut } from "../lib/auth";
import { Button } from "../components/Button";
import { AuthFrame } from "./Auth";

/** Signed in with Supabase, but the email is not on the server's allowlist (403 no_access). */
export function NoAccess({ email }: { email: string }) {
  return (
    <AuthFrame
      title="Немає доступу"
      lead={`Акаунт ${email} не має доступу до LexiVocab. Це приватний словник: попросіть власника додати вашу адресу.`}
    >
      <Button variant="secondary" onClick={() => void signOut()}>
        Вийти
      </Button>
    </AuthFrame>
  );
}
