import { Brand } from "./Brand";
import { UserBadge } from "./UserBadge";
import { FolderKanban, Home, UsersRound } from "lucide-react";
import type { ProjectSummary } from "../lib/team";
import type { Language } from "../lib/types";

type Props = {
  language: Language;
  currentStep: number | null;
  expanded: boolean;
  connectedLabel: string;
  homeLabel: string;
  teamLabel: string;
  homeActive: boolean;
  teamActive: boolean;
  projects: ProjectSummary[];
  projectTeamName: string;
  highestUnlockedStep: number;
  activeProjectId: string;
  onToggle: () => void;
  onHome: () => void;
  onTeam: () => void;
  onProjectSelect: (projectId: string) => void;
  onStepSelect: (step: number) => void;
};

const labels = {
  pt: ["Memória do projeto", "Concepção"],
  en: ["Project memory", "Conception"]
};

function PhaseIcon({ step }: { step: number }) {
  if (step === 0) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v13H5z" /><path d="M8 9h8M8 12h8M8 15h5" /></svg>;
  if (step === 1) return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="8" /></svg>;
  if (step === 2) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 15 9l6 .9-4.5 4.3 1.1 6.1L12 17.4 6.4 20.3l1.1-6.1L3 9.9 9 9z" /></svg>;
  if (step === 3) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 4v10l-7 4-7-4V7z" /><path d="m5 7 7 4 7-4M12 11v10" /></svg>;
  if (step === 4) return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M4 12c2.2-4 4.9-6 8-6s5.8 2 8 6c-2.2 4-4.9 6-8 6s-5.8-2-8-6Z" /></svg>;
  if (step === 5) return <svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-25 12 12)" /><circle cx="12" cy="12" r="2" /></svg>;
  if (step === 6) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 17v4M9 21h6" /><path d="M8.5 15.5 12 12l3.5 3.5" /><path d="M6 11a8 8 0 0 1 12 0M8.8 13.2a4.5 4.5 0 0 1 6.4 0" /></svg>;
  if (step === 7) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5z" /><path d="m8 9 1.5 1.5L12 8M14 9h2M8 14l1.5 1.5L12 13M14 14h2" /></svg>;
  if (step === 8) return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 7-4 5 4 5M15 7l4 5-4 5M13 5l-2 14" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z" /><path d="m8 12 2.2 2.2L16 8.5" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="5.1" width="7.6" height="5.1" rx="1" /><path d="M3.8 5.1V3.7a2.2 2.2 0 0 1 4.4 0v1.4" /></svg>;
}

export function MissionSidebar({ language, currentStep, expanded, connectedLabel, homeLabel, teamLabel, homeActive, teamActive, projects, projectTeamName, highestUnlockedStep, activeProjectId, onToggle, onHome, onTeam, onProjectSelect, onStepSelect }: Props) {
  const phaseLabels = labels[language];
  const stateWords = language === "pt" ? { complete: "Concluída", current: "Fase atual", available: "Disponível", locked: "Ainda não disponível" } : { complete: "Complete", current: "Current phase", available: "Available", locked: "Not available yet" };
  const contextWords = language === "pt" ? { project: "Projeto ativo", team: "Equipe", noneProject: "Nenhum projeto", noneTeam: "Nenhuma equipe", switcher: "Trocar projeto" } : { project: "Active project", team: "Team", noneProject: "No project", noneTeam: "No team", switcher: "Switch project" };

  return (
    <>
      <aside className={expanded ? "mission-sidebar expanded" : "mission-sidebar collapsed"} aria-label={language === "pt" ? "Navegação da missão" : "Mission navigation"}>
        <div className="mission-sidebar-header">
          {expanded && <Brand />}
          <button className="mission-sidebar-toggle" type="button" onClick={onToggle} aria-label={expanded ? (language === "pt" ? "Recolher barra lateral" : "Collapse sidebar") : (language === "pt" ? "Expandir barra lateral" : "Expand sidebar")} aria-expanded={expanded}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d={expanded ? "m12.5 5-5 5 5 5" : "m7.5 5 5 5-5 5"} /></svg>
          </button>
        </div>

        <button className={homeActive ? "mission-sidebar-home active" : "mission-sidebar-home"} type="button" onClick={onHome} title={!expanded ? homeLabel : undefined}>
          <span className="mission-sidebar-home-icon"><Home aria-hidden="true" /></span>
          <span className="mission-sidebar-home-label">{homeLabel}</span>
        </button>

        <button className={teamActive ? "mission-sidebar-home mission-sidebar-team active" : "mission-sidebar-home mission-sidebar-team"} type="button" onClick={onTeam} title={!expanded ? teamLabel : undefined}>
          <span className="mission-sidebar-home-icon"><UsersRound aria-hidden="true" /></span>
          <span className="mission-sidebar-home-label">{teamLabel}</span>
        </button>

        <div className="mission-sidebar-divider" />

        {expanded ? <section className="mission-context-switcher" aria-label={contextWords.switcher}>
          <label><span>{contextWords.project}</span><select value={activeProjectId} onChange={(event) => event.target.value && onProjectSelect(event.target.value)}><option value="">{contextWords.noneProject}</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></label>
          <div className="mission-project-team"><span>{contextWords.team}</span><strong>{projectTeamName || contextWords.noneTeam}</strong></div>
        </section> : <button className="mission-context-compact" type="button" onClick={onToggle} title={contextWords.switcher} aria-label={contextWords.switcher}><FolderKanban aria-hidden="true" /></button>}

        <div className="mission-sidebar-divider context-divider" />

        <nav className="mission-pipeline" aria-label={language === "pt" ? "Pipeline da missão" : "Mission pipeline"}>
          {phaseLabels.map((label, step) => {
            const complete = step < highestUnlockedStep;
            const current = currentStep === step;
            const locked = step > highestUnlockedStep;
            const state = current ? "current" : locked ? "locked" : complete ? "complete" : "available";
            const clickable = !locked && !current;
            const stateLabel = stateWords[state];
            const tooltip = `${String(step + 1).padStart(2, "0")} · ${label} · ${stateLabel}`;

            return (
              <button className={`mission-phase ${state}`} key={label} type="button" aria-current={current ? "step" : undefined} disabled={locked} aria-disabled={!clickable} tabIndex={locked ? -1 : 0} onClick={() => clickable && onStepSelect(step)} title={!expanded ? tooltip : undefined}>
                <span className="mission-phase-rail" />
                <span className="mission-phase-icon">
                  <PhaseIcon step={step} />
                  {complete && <span className="mission-phase-check">✓</span>}
                  {locked && <span className="mission-phase-lock"><LockIcon /></span>}
                </span>
                <span className="mission-phase-copy">
                  <small>{String(step + 1).padStart(2, "0")}</small>
                  <span>{label}</span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="mission-sidebar-user"><UserBadge connectedLabel={connectedLabel} compact={!expanded} /></div>
      </aside>
      <button className={expanded ? "mission-sidebar-overlay visible" : "mission-sidebar-overlay"} type="button" aria-label={language === "pt" ? "Recolher barra lateral" : "Collapse sidebar"} onClick={onToggle} />
    </>
  );
}
