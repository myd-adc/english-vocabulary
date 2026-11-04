import { createBrowserRouter, Navigate } from "react-router";
import { Connect } from "./routes/Connect";
import { Home } from "./routes/Home";
import { Review } from "./routes/Review";
import { RootLayout } from "./routes/RootLayout";
import { Study } from "./routes/Study";
import { TopicRoute } from "./routes/Topic";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "topic/:name?", element: <TopicRoute /> },
      { path: "connect", element: <Connect /> },
      { path: "review", element: <Review /> },
      { path: "study", element: <Study /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
