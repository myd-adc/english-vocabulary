import { createBrowserRouter, Navigate } from "react-router";
import { Home } from "./routes/Home";
import { RootLayout } from "./routes/RootLayout";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
