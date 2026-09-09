import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider, useAuth } from "./lib/auth";
import { AuthPage } from "./pages/AuthPage";
import "./styles.css";
import "./workspace.css";
import "./polish.css";
import "./home-artwork.css";
import "./setup-memory-readability.css";
import "./brainstorm-readability.css";
import "./brainstorm-controls.css";
import "./brainstorm-lab.css";
import "./conception-workspace.css";
import "./project-areas.css";
import "./auth.css";

function Root() {
  const auth = useAuth();
  return auth.status === "authenticated" ? <App /> : <AuthPage />;
}

const root = document.getElementById("root");

if (!root) throw new Error("Norte root element was not found.");

createRoot(root).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>
);
