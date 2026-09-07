import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, LoaderCircle, Plus, Trash2, UsersRound, X } from "lucide-react";
import { LanguageToggle } from "../components/LanguageToggle";
import { UserBadge } from "../components/UserBadge";
import { referenceProgram } from "../lib/programs";
import type { ProjectSummary } from "../lib/team";
import type { Language } from "../lib/types";
import "../home-overrides.css";

type Props = {
  language: Language;
  t: (path: string) => string;
  onLanguageChange: (language: Language) => void;
  projects?: ProjectSummary[];
  loadingProjects?: boolean;
  onOpenProject?: (projectId: string) => void;
  onDeleteProject?: (projectId: string) => Promise<void> | void;
  onOpenTeams?: () => void;
};

export function HomePage({
  language,
  t,
  onLanguageChange,
  projects = [],
  loadingProjects = false,
  onOpenProject,
  onDeleteProject,
  onOpenTeams
}: Props) {
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  const c = language === "pt" ? {
    teams: "Equipes",
    teamsDescription: "Encontre e organize sua equipe.",
    create: "Novo projeto",
    createDescription: "Em breve",
    open: "Abrir projeto",
    openDescription: "Retome exatamente de onde sua equipe parou.",
    chooseProject: "Escolha um projeto",
    chooseHint: "O projeto será aberto na última fase trabalhada.",
    empty: "Nenhum projeto criado ainda.",
    emptyHint: "A criação de projetos estará disponível em breve.",
    loading: "Carregando projetos",
    untitled: "Projeto sem nome",
    noProgram: "Programa ainda não selecionado",
    member: "membro",
    members: "membros",
    updated: "Atualizado",
    delete: "Excluir projeto",
    deleteConfirm: "Excluir este projeto permanentemente? A equipe e seus artefatos permanentes não serão apagados.",
    close: "Fechar"
  } : {
    teams: "Teams",
    teamsDescription: "Discover and organize your team.",
    create: "New project",
    createDescription: "Coming soon",
    open: "Open project",
    openDescription: "Resume exactly where your team stopped.",
    chooseProject: "Choose a project",
    chooseHint: "The project opens at the last phase your team worked on.",
    empty: "No projects have been created yet.",
    emptyHint: "Project creation will be available soon.",
    loading: "Loading projects",
    untitled: "Untitled project",
    noProgram: "Program not selected yet",
    member: "member",
    members: "members",
    updated: "Updated",
    delete: "Delete project",
    deleteConfirm: "Delete this project permanently? The team and its permanent artifacts will not be deleted.",
    close: "Close"
  };

  useEffect(() => {
    if (!projectPickerOpen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setProjectPickerOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [projectPickerOpen]);

  async function deleteProject(projectId: string) {
    if (!window.confirm(c.deleteConfirm)) return;
    setDeletingId(projectId);
    try {
      await onDeleteProject?.(projectId);
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="home-shell home-landing-shell">
      <main className="home-main">
        <header className="home-topbar home-landing-topbar">
          <div className="top-actions">
            <LanguageToggle language={language} onChange={onLanguageChange} />
            <UserBadge connectedLabel={t("common.connected")} />
          </div>
        </header>

        <section className="home-landing" aria-labelledby="norte-home-title">
          <span className="tech-corner tl" /><span className="tech-corner tr" /><span className="tech-corner bl" /><span className="tech-corner br" />
          <h1 id="norte-home-title">NORTE</h1>
          <div className="home-action-grid" aria-label={language === "pt" ? "Ações principais" : "Primary actions"}>
            <button className="home-action-card accent-open" type="button" onClick={() => setProjectPickerOpen(true)}>
              <span className="home-card-icon"><FolderOpen aria-hidden="true" /></span>
              <strong>{c.open}</strong>
              <small>{c.openDescription}</small>
              <ArrowRight className="home-card-arrow" aria-hidden="true" />
            </button>
            <button className="home-action-card accent-create" type="button" disabled>
              <span className="home-card-icon"><Plus aria-hidden="true" /></span>
              <strong>{c.create}</strong>
              <small>{c.createDescription}</small>
              <ArrowRight className="home-card-arrow" aria-hidden="true" />
            </button>
            <button className="home-action-card accent-team" type="button" onClick={onOpenTeams}>
              <span className="home-card-icon"><UsersRound aria-hidden="true" /></span>
              <strong>{c.teams}</strong>
              <small>{c.teamsDescription}</small>
              <ArrowRight className="home-card-arrow" aria-hidden="true" />
            </button>
          </div>
        </section>
      </main>

      {projectPickerOpen && <div className="home-project-dialog-backdrop" role="presentation" onPointerDown={() => setProjectPickerOpen(false)}>
        <section className="home-project-dialog" role="dialog" aria-modal="true" aria-labelledby="home-project-dialog-title" onPointerDown={(event) => event.stopPropagation()}>
          <header>
            <div><span>{c.open}</span><h2 id="home-project-dialog-title">{c.chooseProject}</h2><p>{c.chooseHint}</p></div>
            <button className="home-dialog-close" type="button" onClick={() => setProjectPickerOpen(false)} aria-label={c.close}><X aria-hidden="true" /></button>
          </header>
          <div className="home-project-picker-list">
            {loadingProjects ? <div className="home-project-dialog-empty"><LoaderCircle className="home-spin" aria-hidden="true" />{c.loading}</div> : projects.length === 0 ? (
              <div className="home-project-dialog-empty"><FolderOpen aria-hidden="true" /><strong>{c.empty}</strong><span>{c.emptyHint}</span><button type="button" disabled><Plus aria-hidden="true" />{c.create}</button></div>
            ) : projects.map((project) => {
              const program = referenceProgram(project.programId);
              const date = new Intl.DateTimeFormat(language === "pt" ? "pt-BR" : "en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(project.updatedAt));
              return <article className="home-project-picker-row" key={project.id}>
                <button className="home-project-open" type="button" onClick={() => { setProjectPickerOpen(false); onOpenProject?.(project.id); }}>
                  <span className="home-project-symbol"><FolderOpen aria-hidden="true" /></span>
                  <span className="home-project-copy"><strong>{project.name || c.untitled}</strong><small>{program?.name[language] ?? c.noProgram}</small></span>
                  <span className="home-project-meta"><small>{project.memberCount} {project.memberCount === 1 ? c.member : c.members}</small><small>{c.updated} {date}</small></span>
                  <ArrowRight aria-hidden="true" />
                </button>
                <button className="home-project-delete" type="button" disabled={deletingId === project.id} onClick={() => void deleteProject(project.id)} title={c.delete} aria-label={`${c.delete}: ${project.name || c.untitled}`}>
                  {deletingId === project.id ? <LoaderCircle className="home-spin" aria-hidden="true" /> : <Trash2 aria-hidden="true" />}
                </button>
              </article>;
            })}
          </div>
        </section>
      </div>}
    </div>
  );
}
