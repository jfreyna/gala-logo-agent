import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ConvexReactClient } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { authClient } from "./lib/auth";
import { config } from "./lib/config";
import "./index.css";
import { App } from "./App";
import { RouterProvider } from "./lib/router";
import { ThemeProvider } from "./lib/theme";

const convex = new ConvexReactClient(config.galaConvexUrl);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ConvexBetterAuthProvider client={convex} authClient={authClient}>
      <ThemeProvider>
        <RouterProvider>
          <App />
        </RouterProvider>
      </ThemeProvider>
    </ConvexBetterAuthProvider>
  </StrictMode>,
);
