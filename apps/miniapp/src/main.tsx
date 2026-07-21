import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthGate } from "./app/AuthGate";
import { ThemeProvider } from "./app/theme";
import "./index.css";
import { router } from "./routes";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider>
      <AuthGate>
        <RouterProvider router={router} />
      </AuthGate>
    </ThemeProvider>
  </StrictMode>,
);
