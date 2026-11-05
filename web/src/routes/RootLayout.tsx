import { useEffect, useRef } from "react";
import { Outlet, ScrollRestoration } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { useMe } from "../api/hooks";
import { Button } from "../components/Button";
import { Centered } from "../components/Centered";
import { EditSheetProvider } from "../components/EditSheet";
import { OfflineBanner } from "../components/OfflineBanner";
import { QuickProvider } from "../components/quick";
import { AppShell } from "../components/TabBar";
import { useAuth } from "../lib/auth";
import { AuthScreen, SetPassword } from "./Auth";
import { NoAccess } from "./NoAccess";

/** Sign-in is a gate, not a route: without a session the auth screen replaces the app. */
export function RootLayout() {
  const { state, finishRecovery } = useAuth();
  const qc = useQueryClient();
  const userId = state.status === "in" ? state.session.user.id : null;
  const lastUser = useRef<string | null>(null);

  // Never show one person's data to the next one: drop every cached query on sign-out.
  useEffect(() => {
    if (userId === null && lastUser.current !== null) qc.clear();
    lastUser.current = userId;
  }, [userId, qc]);

  let screen;
  if (state.status === "loading") screen = <Centered aria-busy="true" />;
  else if (state.status === "out") screen = <AuthScreen />;
  else if (state.status === "recovery") screen = <SetPassword onDone={finishRecovery} />;
  else screen = <AllowedOnly key={state.session.user.id} email={state.session.user.email ?? ""} />;

  return (
    <>
      {screen}
      <OfflineBanner />
      <ScrollRestoration />
    </>
  );
}

/** Signed in: ask the server who we are. A 403 means the email is not invited. */
function AllowedOnly({ email }: { email: string }) {
  const me = useMe();
  if (me.data) {
    return (
      <QuickProvider>
        <EditSheetProvider>
          <AppShell>
            <Outlet />
          </AppShell>
        </EditSheetProvider>
      </QuickProvider>
    );
  }
  if (me.error instanceof ApiError && me.error.status === 403) {
    return <NoAccess email={email} />;
  }
  if (me.error && !(me.error instanceof ApiError && me.error.status === 401)) {
    return (
      <Centered>
        <p>{navigator.onLine ? "Не вдалося зв'язатися із сервером." : "Немає з'єднання."}</p>
        <Button variant="secondary" onClick={() => void me.refetch()}>
          Спробувати ще раз
        </Button>
      </Centered>
    );
  }
  return <Centered aria-busy="true" />; // loading (a 401 signs out by itself)
}
