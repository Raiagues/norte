import { Brand } from "./Brand";
import { UserBadge } from "./UserBadge";
import { FolderKanban, Home, UsersRound, FileText, Compass, DraftingCompass, Boxes, TestTubeDiagonal, Satellite, ListChecks, Code2, ShieldCheck } from "lucide-react";
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
  activeArea: string | null;
  onAreaSelect: (area: "requirements" | "software" | "verification") => void;
};

/** Areas cut across the phases: reachable at any point, in any order. */
const AREAS = [
  { id: "requirements" as const, pt: "Requisitos", en: "Requirements", Icon: ListChecks },
  { id: "software" as const, pt: "Software", en: "Software", Icon: Code2 },
  { id: "verification" as const, pt: "Verificação", en: "Verification", Icon: ShieldCheck }
];

const labels = {
  pt: ["Memória do projeto", "Concepção", "Projeto preliminar", "Projeto detalhado", "Integração e verificação", "Operações"],
  en: ["Project memory", "Conception", "Preliminary design", "Detailed design", "Integration & verification", "Operations"]
};
const phaseIcons = [FileText, Compass, DraftingCompass, Boxes, TestTubeDiagonal, Satellite];
function PhaseIcon({ step }: { step: number }) { const Icon = phaseIcons[step]; return <Icon aria-hidden="true" />; }

function LockIcon() {
  return <svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="5.1" width="7.6" height="5.1" rx="1" /><path d="M3.8 5.1V3.7a2.2 2.2 0 0 1 4.4 0v1.4" /></svg>;
}

export function MissionSidebar({ language, currentStep, expanded, connectedLabel, homeLabel, teamLabel, homeActive, teamActive, projects, projectTeamName, highestUnlockedStep, activeProjectId, onToggle, onHome, onTeam, onProjectSelect, onStepSelect, activeArea, onAreaSelect }: Props) {
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
            const upcoming = step > 2 || step === 2 && highestUnlockedStep < 2;
            const complete = !upcoming && step < highestUnlockedStep;
            const current = currentStep === step;
            const locked = upcoming || step > highestUnlockedStep;
            const state = current ? "current" : locked ? "locked" : complete ? "complete" : "available";
            const clickable = !locked && !current;
            const stateLabel = upcoming ? language === "pt" ? "Fase futura" : "Upcoming phase" : stateWords[state];
            const tooltip = `${String(step + 1).padStart(2, "0")} · ${label} · ${stateLabel}`;

            return (
              <button className={`mission-phase ${state}`} key={label} type="button" aria-current={current ? "step" : undefined} disabled={locked} aria-disabled={!clickable} tabIndex={locked ? -1 : 0} onClick={() => clickable && onStepSelect(step)} title={tooltip} aria-label={`${label} · ${stateLabel}`}>
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

        <div className="mission-sidebar-divider" />

        <nav className="mission-areas" aria-label={language === "pt" ? "Áreas do projeto" : "Project areas"}>
          {expanded && <small className="mission-areas-title">{language === "pt" ? "Áreas do projeto" : "Project areas"}</small>}
          {AREAS.map(({ id, pt, en, Icon }) => {
            const label = language === "pt" ? pt : en;
            const available = Boolean(activeProjectId);
            return <button key={id} type="button" className={`mission-area${activeArea === id ? " active" : ""}`} disabled={!available} aria-current={activeArea === id ? "page" : undefined} onClick={() => onAreaSelect(id)} title={available ? label : language === "pt" ? "Abra um projeto primeiro" : "Open a project first"}>
              <span className="mission-area-icon"><Icon aria-hidden="true" /></span>
              <span className="mission-area-label">{label}</span>
            </button>;
          })}
        </nav>

        <div className="mission-sidebar-user"><UserBadge connectedLabel={connectedLabel} compact={!expanded} /></div>
      </aside>
      <button className={expanded ? "mission-sidebar-overlay visible" : "mission-sidebar-overlay"} type="button" aria-label={language === "pt" ? "Recolher barra lateral" : "Collapse sidebar"} onClick={onToggle} />
    </>
  );
}
