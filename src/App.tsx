import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MissionSidebar } from "./components/MissionSidebar";
import { HomePage } from "./pages/HomePage";
import { StudySetupPage } from "./pages/StudySetupPage";
import { TeamPage } from "./pages/TeamPage";
import { TeamsHubPage } from "./pages/TeamsHubPage";
import { BrainstormPage } from "./pages/BrainstormPage";
import { ApiError, useAuth } from "./lib/auth";
import { getStoredLanguage, resolveText, setStoredLanguage } from "./lib/i18n";
import { createEmptyProject, loadProject, normalizeProject, completeConception, recordMemoryRevision, saveProject } from "./lib/projectStore";
import type { MissionProject } from "./lib/projectStore";
import type { ProjectSummary, TeamRecord } from "./lib/team";
import type { Language } from "./lib/types";
import "./mission-sidebar.css";

type Route = "home" | "setup" | "teams" | "projectTeam" | "brainstorm" | "preliminary";

const ACTIVE_PROJECT_KEY = "norte-active-project-v1";

function storedPreference(key: string): string {
  return typeof window === "undefined" ? "" : window.localStorage.getItem(key) || "";
}

function getRoute(): Route {
  if (window.location.hash === "#/preliminary-design") return "preliminary";
  if (window.location.hash === "#/brainstorming") return "brainstorm";
  if (window.location.hash === "#/study-setup" || window.location.hash === "#/project-setup") return "setup";
  if (window.location.hash === "#/project-team") return "projectTeam";
  if (window.location.hash === "#/teams" || window.location.hash === "#/team") return "teams";
  return "home";
}

function projectSummary(project: MissionProject): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    programId: project.context.programId,
    teamId: project.context.teamId,
    updatedAt: project.updatedAt,
    memberCount: project.context.assignments.length
  };
}

function hasLocalWork(project: MissionProject): boolean {
  return Boolean(project.name.trim() || project.context.configured || project.board.nodes.length || project.setup.statement.trim());
}

export function App() {
  const auth = useAuth();
  const [language, setLanguage] = useState<Language>(getStoredLanguage);
  const [project, setProject] = useState<MissionProject>(() => loadProject(getStoredLanguage()));
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [route, setRoute] = useState<Route>(getRoute);
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState(() => storedPreference(ACTIVE_PROJECT_KEY));
  const [initializing, setInitializing] = useState(false);
  const [initializationError, setInitializationError] = useState("");
  const initializationRef = useRef(false);
  const [isDraft, setIsDraft] = useState(false);
  const projectRef = useRef(project);
  const saveTimerRef = useRef<number | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const cloudReadyRef = useRef(false);
  const persistableRef = useRef(false);
  const draftRef = useRef(false);

  const refreshProjects = useCallback(async () => {
    const response = await auth.api<{ projects: ProjectSummary[]; validationResetId?: string | null }>("/projects");
    if (response.validationResetId && window.localStorage.getItem("norte-validation-reset-id") !== response.validationResetId) {
      // Only an explicitly guarded reset authorizes clearing obsolete workspace caches.
      const keys = Array.from({ length: window.localStorage.length }, (_, index) => window.localStorage.key(index));
      for (const key of keys) if (key && /^(norte-project-v2|mission-dev-project-v2|norte-active-project-v1|norte-default-team-v1|norte-brainstorm-lab|mission-dev-brainstorm-lab)/u.test(key)) window.localStorage.removeItem(key);
      window.localStorage.setItem("norte-validation-reset-id", response.validationResetId);
    }
    setProjects(response.projects);
    return response.projects;
  }, [auth.api]);

  const refreshTeams = useCallback(async () => {
    const response = await auth.api<{ teams: TeamRecord[] }>("/teams");
    setTeams(response.teams);
    return response.teams;
  }, [auth.api]);

  const persistProject = useCallback((nextProject: MissionProject) => {
    // Preserve write order: an older autosave must never arrive after a rename
    // or after saving progress while opening Conception. Failed saves do not block retries.
    const operation = saveQueueRef.current.then(async () => {
      let response: { project: MissionProject };
      try {
        response = await auth.api<{ project: MissionProject }>("/projects/" + nextProject.id, { method: "PUT", body: JSON.stringify(nextProject) });
      } catch (reason) {
        if (!(reason instanceof ApiError) || reason.status !== 404) throw reason;
        response = await auth.api<{ project: MissionProject }>("/projects", { method: "POST", body: JSON.stringify(nextProject) });
      }
      setProjects((current) => {
        const next = current.filter((item) => item.id !== nextProject.id);
        return [projectSummary(nextProject), ...next];
      });
      if (projectRef.current.id === nextProject.id) {
        setActiveProjectId(nextProject.id);
        window.localStorage.setItem(ACTIVE_PROJECT_KEY, nextProject.id);
      }
      return normalizeProject(response.project);
    });
    saveQueueRef.current = operation.then(() => undefined, () => undefined);
    return operation;
  }, [auth.api]);

  const flushProject = useCallback(() => {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!persistableRef.current || draftRef.current) return;
    const saved = saveProject(projectRef.current);
    projectRef.current = saved;
    if (cloudReadyRef.current && hasLocalWork(saved)) void persistProject(saved).catch(() => undefined);
  }, [persistProject]);

  const changeProject = useCallback((candidate: MissionProject) => {
    const nextProject = recordMemoryRevision(projectRef.current, candidate);
    projectRef.current = nextProject;
    setProject(nextProject);
    if (!persistableRef.current || draftRef.current) return;
    setProjects((current) => current.map((item) => item.id === nextProject.id ? projectSummary(nextProject) : item));
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushProject, 240);
  }, [flushProject]);

  useEffect(() => {
    if (!auth.isDemo) return;
    function applyExplicitValidation(event: Event) {
      const candidate = (event as CustomEvent<{ project: MissionProject }>).detail?.project;
      if (!candidate) return;
      if (saveTimerRef.current !== null) { window.clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
      const next = saveProject(normalizeProject(candidate, getStoredLanguage()));
      projectRef.current = next;
      persistableRef.current = true;
      draftRef.current = false;
      setProject(next);
      setIsDraft(false);
      setActiveProjectId(next.id);
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, next.id);
      void refreshProjects(); void refreshTeams();
    }
    window.addEventListener("norte-demo-validation-updated", applyExplicitValidation);
    return () => window.removeEventListener("norte-demo-validation-updated", applyExplicitValidation);
  }, [auth.isDemo, refreshProjects, refreshTeams]);

  useEffect(() => {
    let cancelled = false;
    cloudReadyRef.current = false;
    persistableRef.current = false;
    draftRef.current = false;
    setIsDraft(false);
    setLoadingProjects(true);

    void Promise.all([refreshProjects(), refreshTeams()])
      .then(async ([summaries]) => {
        if (cancelled || draftRef.current) return;
        if (summaries.length === 0) {
          const empty = createEmptyProject(getStoredLanguage());
          const directDraft = ["setup", "projectTeam"].includes(getRoute());
          draftRef.current = directDraft;
          setIsDraft(directDraft);
          projectRef.current = empty;
          setProject(empty);
          setActiveProjectId("");
          window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
          return;
        }

        const storedId = storedPreference(ACTIVE_PROJECT_KEY);
        const preferredId = summaries.some((item) => item.id === storedId)
          ? storedId
          : summaries.some((item) => item.id === projectRef.current.id) ? projectRef.current.id : summaries[0].id;
        const response = await auth.api<{ project: MissionProject }>("/projects/" + preferredId);
        if (cancelled || !response.project) return;
        const normalized = normalizeProject(response.project, getStoredLanguage());
        projectRef.current = normalized;
        setProject(saveProject(normalized));
        persistableRef.current = true;
        setActiveProjectId(normalized.id);
        window.localStorage.setItem(ACTIVE_PROJECT_KEY, normalized.id);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          cloudReadyRef.current = true;
          setLoadingProjects(false);
        }
      });

    return () => {
      cancelled = true;
      cloudReadyRef.current = false;
    };
  }, [auth.api, auth.user?.id, refreshProjects, refreshTeams]);

  useEffect(() => {
    function onHashChange() {
      const nextRoute = getRoute();
      if (window.location.hash === "#/project-setup") {
        window.location.replace("#/study-setup");
        return;
      }
      if (window.location.hash === "#/team") {
        window.location.replace("#/teams");
        return;
      }
      setRoute(nextRoute);
    }

    window.addEventListener("hashchange", onHashChange);
    onHashChange();
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  useEffect(() => {
    function saveBeforeLeaving() {
      flushProject();
    }

    function saveWhenHidden() {
      if (document.visibilityState === "hidden") flushProject();
    }

    window.addEventListener("pagehide", saveBeforeLeaving);
    window.addEventListener("beforeunload", saveBeforeLeaving);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", saveBeforeLeaving);
      window.removeEventListener("beforeunload", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", saveWhenHidden);
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    };
  }, [flushProject]);

  useLayoutEffect(() => {
    const legacySelectors = [".app-page .home-sidebar", ".app-page .setup-sidebar", ".app-page .brain-sidebar", ".app-page .sidebar-overlay", ".app-page .square-menu", ".app-page .mobile-menu"];
    document.querySelectorAll<HTMLElement>(legacySelectors.join(",")).forEach((element) => {
      element.style.setProperty("display", "none", "important");
      element.setAttribute("aria-hidden", "true");
    });
  }, [route]);

  const t = useMemo(() => (path: string) => resolveText(language, path), [language]);
  const currentStep = ["setup", "projectTeam"].includes(route) ? 0 : route === "brainstorm" ? 1 : route === "preliminary" ? 2 : null;

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);
    document.documentElement.lang = nextLanguage === "pt" ? "pt-BR" : "en";
  }

  async function openProject(projectId: string) {
    flushProject();
    try {
      const response = await auth.api<{ project: MissionProject }>("/projects/" + projectId);
      const next = saveProject(normalizeProject(response.project, language));
      draftRef.current = false;
      persistableRef.current = true;
      projectRef.current = next;
      setProject(next);
      setIsDraft(false);
      setActiveProjectId(next.id);
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, next.id);
      const nextRoute = next.navigation.lastRoute === "preliminary" ? "preliminary" : next.navigation.lastRoute === "brainstorm" ? "brainstorm" : "setup";
      const url = new URL(window.location.href);
      if (nextRoute === "brainstorm") url.searchParams.set("view", next.navigation.lastConceptionWorkspace ?? "system");
      else url.searchParams.delete("view");
      url.hash = nextRoute === "preliminary" ? "/preliminary-design" : nextRoute === "brainstorm" ? "/brainstorming" : "/study-setup";
      window.history.pushState(window.history.state, "", url);
      setRoute(nextRoute);
    } catch {
      const local = projects.find((item) => item.id === projectId);
      if (local && projectRef.current.id === projectId) window.location.hash = projectRef.current.navigation.lastRoute === "preliminary" ? "#/preliminary-design" : projectRef.current.navigation.lastRoute === "brainstorm" ? "#/brainstorming" : "#/study-setup";
    }
  }

  async function deleteProject(projectId: string) {
    await auth.api("/projects/" + projectId, { method: "DELETE" });
    const remaining = projects.filter((item) => item.id !== projectId);
    setProjects(remaining);
    if (projectRef.current.id !== projectId && activeProjectId !== projectId) return;

    persistableRef.current = false;
    draftRef.current = false;
    setIsDraft(false);
    const nextId = remaining[0]?.id || "";
    setActiveProjectId(nextId);
    if (nextId) {
      window.localStorage.setItem(ACTIVE_PROJECT_KEY, nextId);
      const response = await auth.api<{ project: MissionProject }>("/projects/" + nextId);
      const next = saveProject(normalizeProject(response.project, language));
      projectRef.current = next;
      setProject(next);
      persistableRef.current = true;
    } else {
      window.localStorage.removeItem(ACTIVE_PROJECT_KEY);
      const empty = createEmptyProject(language);
      projectRef.current = empty;
      setProject(empty);
    }
  }

  function setProjectNavigation(lastRoute: MissionProject["navigation"]["lastRoute"]) {
    const current = projectRef.current;
    if (current.navigation.lastRoute === lastRoute) return current;
    const next = { ...current, navigation: { ...current.navigation, lastRoute } };
    changeProject(next);
    return next;
  }

  function openMemory() {
    setProjectNavigation("setup");
    window.location.hash = "#/study-setup";
  }

  function openTeams() {
    window.location.hash = "#/teams";
  }

  function openProjectTeam() {
    window.location.hash = "#/project-team";
  }

  async function openBrainstorm() {
    if (initializationRef.current) return;
    initializationRef.current = true;
    setInitializationError("");
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    try {
      let current = projectRef.current;
      if (!persistableRef.current || draftRef.current) throw new Error(language === "pt" ? "Abra um projeto existente para iniciar a concepção." : "Open an existing project to start conception.");
      let prepared = current;
      if (!current.engineeringSystem) {
        setInitializing(true);
        // Generation reads persisted project memory on the server.
        current = await persistProject(current);
        const response = await auth.api<{ engineeringSystem: NonNullable<MissionProject["engineeringSystem"]> }>("/system-ai/generate", { method: "POST", body: JSON.stringify({ projectId: current.id, language }) });
        prepared = completeConception(current, response.engineeringSystem);
      } else {
        prepared = completeConception(current, current.engineeringSystem);
      }
      prepared = await persistProject(prepared);
      projectRef.current = prepared;
      setProject(saveProject(prepared));
      const url = new URL(window.location.href);
      url.searchParams.set("view", prepared.navigation.lastConceptionWorkspace ?? "system");
      url.hash = "/brainstorming";
      window.history.replaceState(window.history.state, "", url);
      setRoute("brainstorm");
    } catch (reason) {
      const messages: Record<string, string> = language === "pt" ? {
        SYSTEM_MEMORY_INSUFFICIENT: "Vincule à memória um arquivo de texto ou PDF que descreva o sistema e tente novamente.",
        SYSTEM_AI_NOT_CONFIGURED: "A leitura assistida ainda não está configurada. A memória foi salva; tente novamente quando o serviço estiver disponível.",
        SYSTEM_AI_UNAVAILABLE: "O serviço de engenharia está temporariamente indisponível. A memória foi preservada. Tente novamente.",
        SYSTEM_RESPONSE_INVALID: "Não foi possível validar a arquitetura gerada. Tente novamente ou revise as fontes na memória.",
        SYSTEM_EVIDENCE_INVALID: "Não foi possível confirmar os dados nas fontes. Revise os arquivos vinculados e tente novamente.",
        SYSTEM_HIERARCHY_INVALID: "Não foi possível validar a organização do sistema. A memória foi preservada; tente novamente.",
        SYSTEM_FORMULA_INVALID: "Não foi possível validar as dependências dos cálculos. A memória foi preservada; tente novamente.",
        PROJECT_MEMORY_CHANGED: "A memória mudou durante a leitura. Tente novamente para usar a versão atual."
      } : {
        SYSTEM_MEMORY_INSUFFICIENT: "Link a text or PDF file describing the system to Project Memory and try again.",
        SYSTEM_AI_NOT_CONFIGURED: "Assisted reading is not configured yet. Your memory is saved; retry when the service is available.",
        SYSTEM_AI_UNAVAILABLE: "The engineering service is temporarily unavailable. Your memory is preserved; try again.",
        SYSTEM_RESPONSE_INVALID: "The generated architecture could not be validated. Retry or review the sources in Project Memory.",
        SYSTEM_EVIDENCE_INVALID: "The extracted data could not be confirmed in its sources. Review the linked files and retry.",
        SYSTEM_HIERARCHY_INVALID: "The system hierarchy could not be validated. Your memory is preserved; try again.",
        SYSTEM_FORMULA_INVALID: "The calculation dependencies could not be validated. Your memory is preserved; try again.",
        PROJECT_MEMORY_CHANGED: "Project Memory changed during extraction. Retry to use the current version."
      };
      const message = (reason instanceof ApiError && messages[reason.code]) || (reason instanceof Error ? reason.message : language === "pt" ? "Não foi possível ler a memória. Tente novamente." : "Could not read project memory. Try again.");
      setInitializationError(message);
      throw new Error(message, { cause: reason });
    } finally {
      initializationRef.current = false;
      setInitializing(false);
    }
  }

  function openHome() {
    if (draftRef.current) {
      draftRef.current = false;
      persistableRef.current = false;
      setIsDraft(false);
      const empty = createEmptyProject(language);
      projectRef.current = empty;
      setProject(empty);
      setActiveProjectId("");
    } else {
      flushProject();
    }
    window.location.hash = "#/";
  }

  function openPreliminary() {
    const current = projectRef.current;
    if (!current.engineeringSystem) return;
    changeProject({ ...current, phaseProgress: { highestUnlockedStep: 2 }, navigation: { ...current.navigation, lastRoute: "preliminary" } });
    window.location.hash = "#/preliminary-design";
  }

  function openPipelineStep(step: number) {
    if (step === 0) openMemory();
    if (step === 2 && projectRef.current.phaseProgress.highestUnlockedStep >= 2) openPreliminary();
    if (step === 1 && projectRef.current.phaseProgress.highestUnlockedStep >= 1) void openBrainstorm().catch(() => undefined);
  }

  let page = <HomePage language={language} t={t} onLanguageChange={changeLanguage} projects={projects} loadingProjects={loadingProjects} onOpenProject={(id) => void openProject(id)} onDeleteProject={deleteProject} onOpenTeams={openTeams} />;
  if (route === "setup") page = <StudySetupPage language={language} project={project} isDraft={isDraft} t={t} onLanguageChange={changeLanguage} onProjectChange={changeProject} onContinue={openBrainstorm} onHome={openHome} onTeams={openTeams} onManageTeam={openProjectTeam} />;
  if (route === "teams") page = <TeamsHubPage language={language} t={t} onLanguageChange={changeLanguage} onBack={openHome} initialTeamId={project.context.teamId ?? ""} onTeamsChanged={() => void refreshTeams()} />;
  if (route === "projectTeam") page = <TeamPage language={language} project={project} t={t} onLanguageChange={changeLanguage} onBack={openMemory} onProjectSetup={openMemory} />;
  if (route === "brainstorm" || route === "preliminary") page = <BrainstormPage key={`${project.id}:${route}`} preliminary={route === "preliminary"} onNextPhase={openPreliminary} onConception={() => void openBrainstorm().catch(() => undefined)} language={language} project={project} t={t} onLanguageChange={changeLanguage} onProjectChange={changeProject} onHome={openHome} onBackSetup={openMemory} />;

  return (
    <div className={sidebarExpanded ? "app-shell route-" + route + " sidebar-expanded" : "app-shell route-" + route}>
      <MissionSidebar language={language} currentStep={currentStep} expanded={sidebarExpanded} connectedLabel={t("common.connected")} homeLabel={t("home.start")} teamLabel={language === "pt" ? "Equipes" : "Teams"} homeActive={route === "home"} teamActive={route === "teams"} projects={projects} projectTeamName={teams.find((team) => team.id === project.context.teamId)?.name || project.context.teamName} highestUnlockedStep={activeProjectId ? project.phaseProgress.highestUnlockedStep : -1} activeProjectId={activeProjectId} onToggle={() => setSidebarExpanded((current) => !current)} onHome={openHome} onTeam={openTeams} onProjectSelect={(id) => void openProject(id)} onStepSelect={openPipelineStep} />
      <div className="app-page">{page}</div>
      {initializing && <div className="conception-initialization" role="status" aria-live="polite"><div><span className="initialization-orbit" aria-hidden="true" /><small>NORTE</small><h2>{language === "pt" ? "Lendo a memória do projeto" : "Reading project memory"}</h2><p>{language === "pt" ? "Identificando o sistema, suas dependências e requisitos." : "Identifying the system, its dependencies and requirements."}</p><strong>{project.name}</strong></div></div>}
      {initializationError && route !== "setup" && <div className="conception-error" role="alert"><p>{initializationError}</p><button type="button" onClick={() => { setInitializationError(""); openMemory(); }}>{language === "pt" ? "Voltar à memória do projeto" : "Back to project memory"}</button><button type="button" onClick={() => setInitializationError("")}>{language === "pt" ? "Fechar" : "Close"}</button></div>}
    </div>
  );
}
