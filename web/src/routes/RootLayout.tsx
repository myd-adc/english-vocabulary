import { useEffect, useSyncExternalStore } from "react";
import { Outlet, ScrollRestoration } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { getToken, subscribeToken } from "../api/client";
import { EditSheetProvider } from "../components/EditSheet";
import { OfflineBanner } from "../components/OfflineBanner";
import { QuickProvider } from "../components/quick";
import { Login } from "./Login";

/** Login is a gate, not a route: without a token (or after a 401) the login form replaces the app. */
export function RootLayout() {
  const token = useSyncExternalStore(subscribeToken, getToken);
  const qc = useQueryClient();

  // Never show one session's data to the next login.
  useEffect(() => {
    if (!token) qc.clear();
  }, [token, qc]);

  return (
    <>
      {token ? (
        <QuickProvider>
          <EditSheetProvider>
            <Outlet />
          </EditSheetProvider>
        </QuickProvider>
      ) : (
        <Login />
      )}
      <OfflineBanner />
      <ScrollRestoration />
    </>
  );
}
