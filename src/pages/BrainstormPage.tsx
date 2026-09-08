import { useState } from "react";
import { Lightbulb, Network, FileText, ArrowRight, DraftingCompass } from "lucide-react";
import { LanguageToggle } from "../components/LanguageToggle";
import { UserBadge } from "../components/UserBadge";
import { BrainstormLab } from "./BrainstormLab";
import { SystemWorkspace } from "./SystemWorkspace";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";
import { ux } from "../lib/uxCopy";

type Props = {
  preliminary?: boolean; onNextPhase: () => void; onConception: () => void;
  language: Language; project: MissionProject; t: (path: string) => string;
  onLanguageChange: (language: Language) => void;
  onProjectChange: (project: MissionProject) => void; onHome: () => void; onBackSetup: () => void;
};
type Workspace = "system" | "discovery";

export function BrainstormPage({ preliminary = false, onNextPhase, onConception, language, project, t, onLanguageChange, onProjectChange, onBackSetup }: Props) {
  const [workspace, setWorkspace] = useState<Workspace>(() => {
    const requested = new URLSearchParams(window.location.search).get("view");
    if (requested === "discovery") return requested;
    if (requested === "system" || requested === "map") return "system";
    return project.navigation.lastConceptionWorkspace === "discovery" ? "discovery" : "system";
  });
  function selectWorkspace(next: Workspace) {
    setWorkspace(next);
    onProjectChange({ ...project, navigation: { ...project.navigation, lastConceptionWorkspace: next } });
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(window.history.state, "", url);
  }
  const title = preliminary ? language === "pt" ? "PROJETO PRELIMINAR" : "PRELIMINARY DESIGN" : ux(language, "conceptionRoom");
  const tabs = [
    { id: "system" as const, label: language === "pt" ? "Sistema" : "System", Icon: Network },
    { id: "discovery" as const, label: language === "pt" ? "Descoberta" : "Discovery", Icon: Lightbulb }
  ];
  return <div className="brain-shell brain-v2 engineering-conception">
    <main className="brain-main">
      <header className="brain-topbar">
        <div className="brain-top-left"><div className="brain-breadcrumb"><span>{project.name}</span><span>›</span><strong>{preliminary ? language === "pt" ? "Projeto preliminar" : "Preliminary design" : language === "pt" ? "Concepção" : "Conception"}</strong></div></div>
        <div className="brain-top-actions"><LanguageToggle language={language} onChange={onLanguageChange} /><UserBadge connectedLabel={t("common.connected")} /></div>
      </header>
      <section className="brain-workspace">
        <div className="brain-title-row">
          <div className="brain-title-stack">
            <div className="brain-title"><h1>{title}</h1></div>
            {!preliminary && <div className="brain-mode-tabs" role="tablist" aria-label={ux(language, "conceptionRoom")}>
              {tabs.map(({ id, label, Icon }, index) => <button key={id} id={`workspace-tab-${id}`} type="button" role="tab" aria-controls="conception-workspace" aria-selected={workspace === id} tabIndex={workspace === id ? 0 : -1} className={workspace === id ? "active" : ""} onClick={() => selectWorkspace(id)} onKeyDown={(event) => {
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
                selectWorkspace(tabs[next].id);
                document.getElementById(`workspace-tab-${tabs[next].id}`)?.focus();
              }}><Icon aria-hidden="true" />{label}{id === "discovery" && <em>BETA</em>}</button>)}
            </div>}
          </div>
          <div className="conception-actions"><button type="button" className="conception-memory-action" onClick={onBackSetup}><FileText />{language === "pt" ? "Editar memória" : "Edit memory"}</button>{!preliminary && <button type="button" className="conception-memory-action conception-next-action" onClick={onNextPhase}>{language === "pt" ? "Próxima fase" : "Next phase"}<ArrowRight /></button>}</div>
        </div>
        <div id="conception-workspace" className="conception-workspace-content" role={preliminary ? undefined : "tabpanel"} aria-labelledby={preliminary ? undefined : `workspace-tab-${workspace}`}>
          {preliminary ? <section className="preliminary-preview"><DraftingCompass /><h2>{language === "pt" ? "Detalhar o conceito escolhido" : "Develop the chosen concept"}</h2><p>{language === "pt" ? "Esta fase reunirá o dimensionamento dos subsistemas, as interfaces e as decisões de projeto. O espaço está em preparação; sua memória e arquitetura continuam disponíveis na concepção." : "This phase will bring together subsystem sizing, interfaces and design decisions. This workspace is in preparation; your memory and architecture remain available in Conception."}</p><button type="button" className="conception-memory-action" onClick={onConception}>{language === "pt" ? "Voltar à concepção" : "Return to conception"}</button></section> : workspace === "system" ? <SystemWorkspace key={project.engineeringSystem?.entities.map((item) => `${item.id}:${item.parentId ?? ""}`).join("|")} language={language} project={project} onProjectChange={onProjectChange} onBackSetup={onBackSetup} /> : <BrainstormLab language={language} project={project} onProjectChange={onProjectChange} />}
        </div>
      </section>
    </main>
  </div>;
}
