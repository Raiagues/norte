import { useEffect, useState } from "react";
import { KeyRound, LockKeyhole, RadioTower, RefreshCw, ShieldCheck } from "lucide-react";
import { LanguageToggle } from "../components/LanguageToggle";
import { ApiError, useAuth } from "../lib/auth";
import { getStoredLanguage, setStoredLanguage } from "../lib/i18n";
import type { Language } from "../lib/types";

type Mode = "login" | "register";

export function AuthPage() {
  const auth = useAuth();
  const [language, setLanguage] = useState<Language>(getStoredLanguage);
  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMode(window.location.hash.startsWith("#/join?") ? "register" : auth.hasOwner ? "login" : "register");
  }, [auth.hasOwner]);

  const joinParameters = new URLSearchParams(window.location.hash.split("?")[1] || "");

  const c = language === "pt" ? {
    brandLine: "ENGENHARIA DE SISTEMAS ASSISTIDA POR IA",
    loginTitle: "Entrar no Norte",
    registerTitle: "Criar sua conta",
    firstAccount: "A primeira conta deste ambiente recebe a administração inicial.",
    name: "Nome completo",
    email: "E-mail",
    password: "Senha",
    passwordHint: "Use uma frase com pelo menos 15 caracteres.",
    enter: "Entrar",
    create: "Criar conta",
    noAccount: "Criar conta",
    hasAccount: "Já tenho conta",
    offlineTitle: "Serviço temporariamente indisponível",
    offlineText: "Tente novamente em alguns instantes.",
    retry: "Tentar novamente",
    loading: "Abrindo sessão segura"
  } : {
    brandLine: "AI-ASSISTED SYSTEMS ENGINEERING",
    loginTitle: "Sign in to Norte",
    registerTitle: "Create your account",
    firstAccount: "The first account in this environment receives initial administration.",
    name: "Full name",
    email: "Email",
    password: "Password",
    passwordHint: "Use a passphrase with at least 15 characters.",
    enter: "Sign in",
    create: "Create account",
    noAccount: "Create account",
    hasAccount: "I already have an account",
    offlineTitle: "Service temporarily unavailable",
    offlineText: "Try again in a few moments.",
    retry: "Try again",
    loading: "Opening secure session"
  };

  function changeLanguage(next: Language) {
    setLanguage(next);
    setStoredLanguage(next);
    document.documentElement.lang = next === "pt" ? "pt-BR" : "en";
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      if (mode === "login") {
        await auth.login(String(data.get("email") || ""), String(data.get("password") || ""));
      } else {
        await auth.register({
          name: String(data.get("name") || ""),
          email: String(data.get("email") || ""),
          password: String(data.get("password") || "")
        });
      }
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : (language === "pt" ? "Não foi possível concluir o acesso." : "Access could not be completed."));
    } finally {
      setBusy(false);
    }
  }

  if (auth.status === "loading") {
    return <div className="auth-status-screen"><RadioTower aria-hidden="true" /><span>{c.loading}</span></div>;
  }

  if (auth.status === "offline") {
    return (
      <div className="auth-status-screen auth-offline">
        <RadioTower aria-hidden="true" />
        <h1>{c.offlineTitle}</h1>
        <p>{c.offlineText}</p>
        <button onClick={() => void auth.refresh()}><RefreshCw aria-hidden="true" />{c.retry}</button>
      </div>
    );
  }

  return (
    <main className="auth-page">
      <header className="auth-header">
        <div className="auth-brand"><RadioTower aria-hidden="true" /><span>NORTE</span></div>
        <LanguageToggle language={language} onChange={changeLanguage} />
      </header>

      <section className="auth-layout">
        <div className="auth-context">
          <span>{c.brandLine}</span>
          <h1>NORTE</h1>
          <div className="auth-security-mark"><ShieldCheck aria-hidden="true" /><span>{language === "pt" ? "Sessão protegida" : "Protected session"}</span></div>
        </div>

        <form className="auth-form" onSubmit={submit}>
          <div className="auth-form-heading">
            <div className="auth-form-icon">{mode === "login" ? <KeyRound aria-hidden="true" /> : <LockKeyhole aria-hidden="true" />}</div>
            <div><span>{mode === "login" ? "LOGIN" : "ACCOUNT"}</span><h2>{mode === "login" ? c.loginTitle : c.registerTitle}</h2></div>
          </div>

          {mode === "register" && !auth.hasOwner && <p className="auth-owner-note">{c.firstAccount}</p>}

          <div className="auth-fields auth-fields-simple">
            {mode === "register" && <label><span>{c.name}</span><input name="name" autoComplete="name" required minLength={2} maxLength={100} /></label>}
            <label><span>{c.email}</span><input name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={mode === "register" ? joinParameters.get("email") || "" : ""} /></label>
            <label><span>{c.password}</span><input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "login" ? 1 : 15} maxLength={128} /><small>{mode === "register" ? c.passwordHint : ""}</small></label>
          </div>

          {error && <div className="auth-error" role="alert">{error}</div>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? <RefreshCw className="auth-spinner" aria-hidden="true" /> : mode === "login" ? <KeyRound aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}{mode === "login" ? c.enter : c.create}</button>
          <button className="auth-mode-switch" type="button" onClick={() => { setMode((current) => current === "login" ? "register" : "login"); setError(""); }}>{mode === "login" ? c.noAccount : c.hasAccount}</button>
        </form>
      </section>
    </main>
  );
}
