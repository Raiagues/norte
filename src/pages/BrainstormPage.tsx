import { ArrowLeft, ArrowRight, Lock, Waypoints } from "lucide-react";
import { LanguageToggle } from "../components/LanguageToggle";
import { UserBadge } from "../components/UserBadge";
import { SystemWorkspace } from "./SystemWorkspace";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";
import { ux } from "../lib/uxCopy";

type Props = {
  language: Language; project: MissionProject; t: (path: string) => string;
  onLanguageChange: (language: Language) => void;
  onProjectChange: (project: MissionProject) => void; onHome: () => void; onBackSetup: () => void;
  onOpenDiscovery: () => void; discoveryOpen: boolean;
};

export function BrainstormPage({ language, project, t, onLanguageChange, onProjectChange, onBackSetup, onOpenDiscovery, discoveryOpen }: Props) {
  const pt = language === "pt";
  const c = pt
    ? { previous: "Fase anterior", previousName: "Memória do projeto", next: "Próxima fase", nextName: "Projeto preliminar", soon: "Em breve", explore: "Explorar impacto", exploreHint: "Escreva uma mudança e veja o que ela afeta" }
    : { previous: "Previous phase", previousName: "Project memory", next: "Next phase", nextName: "Preliminary design", soon: "Coming soon", explore: "Explore impact", exploreHint: "Write a change and see what it affects" };

  return <div className="brain-shell brain-v2 engineering-conception">
    <main className="brain-main">
      <header className="brain-topbar">
        <div className="brain-top-left"><div className="brain-breadcrumb"><span>{project.name}</span><span>›</span><strong>{pt ? "Concepção" : "Conception"}</strong></div></div>
        <div className="brain-top-actions"><LanguageToggle language={language} onChange={onLanguageChange} /><UserBadge connectedLabel={t("common.connected")} /></div>
      </header>
      <section className="brain-workspace">
        <div className="brain-title-row">
          <div className="brain-title-stack">
            <div className="brain-title"><h1>{ux(language, "conceptionRoom")}</h1></div>
          </div>
          <div className="conception-actions">
            <button type="button" className="phase-step" onClick={onBackSetup}><ArrowLeft aria-hidden="true" /><span><small>{c.previous}</small>{c.previousName}</span></button>
            <button type="button" className="phase-step disabled" disabled title={c.soon}><span><small>{c.next}</small>{c.nextName}</span><em>{c.soon}</em><Lock aria-hidden="true" /></button>
            <button type="button" className={`explore-impact-action${discoveryOpen ? " open" : ""}`} onClick={onOpenDiscovery} aria-pressed={discoveryOpen}>
              <Waypoints aria-hidden="true" /><span><strong>{c.explore}</strong><small>{c.exploreHint}</small></span><ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="conception-workspace-content">
          {/* Remounting on a changed architecture re-derives which branches are open. */}
          <SystemWorkspace key={project.engineeringSystem?.entities.map((item) => `${item.id}:${item.parentId ?? ""}`).join("|")} language={language} project={project} onProjectChange={onProjectChange} onBackSetup={onBackSetup} />
        </div>
      </section>
    </main>
  </div>;
}
