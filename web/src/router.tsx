import { createBrowserRouter, Navigate } from "react-router";
import { Home } from "./routes/Home";
import { RootLayout } from "./routes/RootLayout";
import { TopicRoute } from "./routes/Topic";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "topic/:name?", element: <TopicRoute /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
