import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router/dom";
import { router } from "./router";
import "@fontsource-variable/onest/wght.css";
import "./styles/tokens.css";
import "./lib/speech"; // registers the iOS speech unlock on first tap

// The old vanilla PWA kept its own cache; its service worker is replaced by the new one at /sw.js.
if ("caches" in window) void caches.delete("lexivocab-v6");

const queryClient = new QueryClient({
  defaultOptions: {
    // Offline requests should fail (and show the error) instead of waiting for the network.
    queries: { networkMode: "always", retry: false, refetchOnWindowFocus: false },
    mutations: { networkMode: "always" },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
