import { useState } from "react";
import { CalendarDays, Lightbulb, Network } from "lucide-react";
import { ConceptionTimeline } from "../components/ConceptionTimeline";
import { LanguageToggle } from "../components/LanguageToggle";
import { UserBadge } from "../components/UserBadge";
import { BrainstormLab } from "./BrainstormLab";
import { SystemWorkspace } from "./SystemWorkspace";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";
import { ux } from "../lib/uxCopy";

type Props = {
  language: Language; project: MissionProject; t: (path: string) => string;
  onLanguageChange: (language: Language) => void;
  onProjectChange: (project: MissionProject) => void; onHome: () => void; onBackSetup: () => void;
};
type Workspace = "system" | "timeline" | "discovery";

export function BrainstormPage({ language, project, t, onLanguageChange, onProjectChange, onBackSetup }: Props) {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "timeline" || requested === "discovery") return requested;
    if (requested === "system" || requested === "map") return "system";
    return project.navigation.lastConceptionWorkspace ?? "system";
  });
  function selectWorkspace(next: Workspace) {
    setWorkspace(next);
    onProjectChange({ ...project, navigation: { ...project.navigation, lastConceptionWorkspace: next } });
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(window.history.state, "", url);
  }
  const tabs = [
    { id: "system" as const, label: language === "pt" ? "Sistema" : "System", Icon: Network },
    { id: "timeline" as const, label: language === "pt" ? "Cronograma" : "Timeline", Icon: CalendarDays },
    { id: "discovery" as const, label: language === "pt" ? "Descoberta" : "Discovery", Icon: Lightbulb }
  ];
  return <div className="brain-shell brain-v2 engineering-conception">
    <main className="brain-main">
      <header className="brain-topbar">
        <div className="brain-top-left"><div className="brain-breadcrumb"><span>{project.name}</span><span>›</span><strong>{language === "pt" ? "Concepção" : "Conception"}</strong></div></div>
        <div className="brain-top-actions"><LanguageToggle language={language} onChange={onLanguageChange} /><UserBadge connectedLabel={t("common.connected")} /></div>
      </header>
      <section className="brain-workspace">
        <div className="brain-title-row">
          <div className="brain-title-stack">
            <div className="brain-title"><h1>{ux(language, "conceptionRoom")}</h1></div>
            <div className="brain-mode-tabs" role="tablist" aria-label={ux(language, "conceptionRoom")}>
              {tabs.map(({ id, label, Icon }, index) => <button key={id} id={`workspace-tab-${id}`} type="button" role="tab" aria-controls="conception-workspace" aria-selected={workspace === id} tabIndex={workspace === id ? 0 : -1} className={workspace === id ? "active" : ""} onClick={() => selectWorkspace(id)} onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowRight" ? 1 : 2)) % 3;
                selectWorkspace(tabs[next].id);
                document.getElementById(`workspace-tab-${tabs[next].id}`)?.focus();
              }}><Icon aria-hidden="true" />{label}{id === "discovery" && <em>BETA</em>}</button>)}
            </div>
          </div>
          {workspace === "discovery" && <div id="brainstorm-lab-toolbar" className="brain-toolbar" data-control />}
        </div>
        <div id="conception-workspace" className="conception-workspace-content" role="tabpanel" aria-labelledby={`workspace-tab-${workspace}`}>
          {workspace === "timeline" ? <ConceptionTimeline language={language} project={project} /> : workspace === "system" ? <SystemWorkspace language={language} project={project} onProjectChange={onProjectChange} onBackSetup={onBackSetup} /> : <BrainstormLab language={language} project={project} onProjectChange={onProjectChange} />}
        </div>
      </section>
    </main>
  </div>;
}
