import { useState } from "react";
import { FileCheck2, Network, GitBranch, Boxes, TestTubeDiagonal, Lightbulb, FileText } from "lucide-react";
import { ProjectAreaShell, AreaPreviewNote, LINK_KINDS } from "../components/ProjectAreaShell";
import type { LinkKind } from "../components/ProjectAreaShell";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";

/** Every requirement carries the same five link kinds, whether or not each one is populated yet. */
const REQUIREMENT_LINKS: LinkKind[] = ["architecture", "decision", "artifact", "software", "verification"];

export function RequirementsPage({ language, project, onOpenConception }: { language: Language; project: MissionProject; onOpenConception: () => void }) {
  const pt = language === "pt";
  const model = project.engineeringSystem;
  const requirements = model?.requirements ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = requirements.find((item) => item.id === selectedId) ?? requirements[0];
  const entityName = (id: string) => model?.entities.find((item) => item.id === id)?.name ?? id;
  const c = pt ? {
    eyebrow: "Área do projeto", title: "Requisitos", subtitle: "O que o sistema precisa cumprir, e tudo que cada exigência toca ao longo do desenvolvimento.",
    empty: "Os requisitos aparecem aqui assim que a arquitetura for gerada na Concepção.", open: "Ir para a Concepção",
    tags: "Subsistemas", statement: "Enunciado", none: "Ainda sem vínculo",
    count: (value: number) => `${value} ${value === 1 ? "requisito" : "requisitos"}`
  } : {
    eyebrow: "Project area", title: "Requirements", subtitle: "What the system must satisfy, and everything each demand touches across development.",
    empty: "Requirements appear here once the architecture is generated in Conception.", open: "Go to Conception",
    tags: "Subsystems", statement: "Statement", none: "Not linked yet",
    count: (value: number) => `${value} ${value === 1 ? "requirement" : "requirements"}`
  };

  return <ProjectAreaShell language={language} project={project} icon={<FileCheck2 aria-hidden="true" />} eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle} counter={c.count(requirements.length)}>
    {!requirements.length
      ? <div className="area-empty"><Network aria-hidden="true" /><p>{c.empty}</p><button type="button" onClick={onOpenConception}>{c.open}</button></div>
      : <div className="area-split">
        <ul className="area-list" aria-label={c.title}>
          {requirements.map((requirement) => <li key={requirement.id}>
            <button type="button" className={selected?.id === requirement.id ? "area-list-item selected" : "area-list-item"} onClick={() => setSelectedId(requirement.id)}>
              <span className="area-list-id">{requirement.id}</span>
              <strong>{requirement.title}</strong>
              <span className="area-list-meta">{requirement.statement}</span>
              <span className="area-link-dots">{REQUIREMENT_LINKS.map((kind) => <i key={kind} className={`link-${kind}${kind === "architecture" && requirement.relatedEntityIds.length ? " on" : ""}`} title={LINK_KINDS[kind][pt ? 0 : 1]} />)}</span>
            </button>
          </li>)}
        </ul>
        {selected && <section className="area-detail" aria-label={selected.title}>
          <header><span className="area-list-id">{selected.id}</span><h2>{selected.title}</h2></header>
          <p className="area-detail-statement"><small>{c.statement}</small>{selected.statement}</p>
          {selected.properties.length > 0 && <ul className="area-chips">{selected.properties.map((property) => <li key={property.key}>{property.name}<em>{property.value} {property.unit ?? ""}</em></li>)}</ul>}
          {selected.subsystemTags.length > 0 && <p className="area-detail-tags"><small>{c.tags}</small>{selected.subsystemTags.join(" · ")}</p>}

          <div className="area-links">
            <article className="area-link-card live">
              <header><Network aria-hidden="true" />{LINK_KINDS.architecture[pt ? 0 : 1]}</header>
              {selected.relatedEntityIds.length ? <ul>{selected.relatedEntityIds.map((id) => <li key={id}>{entityName(id)}</li>)}</ul> : <p>{c.none}</p>}
            </article>
            <article className="area-link-card"><header><Lightbulb aria-hidden="true" />{LINK_KINDS.decision[pt ? 0 : 1]}</header><p>{pt ? "Hipóteses aceitas na Descoberta passam a justificar este requisito." : "Hypotheses accepted in Discovery will justify this requirement."}</p></article>
            <article className="area-link-card"><header><FileText aria-hidden="true" />{LINK_KINDS.artifact[pt ? 0 : 1]}</header><p>{pt ? "O documento da Memória do projeto que originou a exigência." : "The Project Memory document the demand came from."}</p></article>
            <article className="area-link-card"><header><Boxes aria-hidden="true" />{LINK_KINDS.software[pt ? 0 : 1]}</header><p>{pt ? "Os módulos que implementam ou monitoram este requisito." : "The modules that implement or monitor this requirement."}</p></article>
            <article className="area-link-card"><header><TestTubeDiagonal aria-hidden="true" />{LINK_KINDS.verification[pt ? 0 : 1]}</header><p>{pt ? "O ensaio, a simulação ou a análise que comprova o cumprimento." : "The test, simulation or analysis that proves compliance."}</p></article>
          </div>
          <AreaPreviewNote icon={<GitBranch aria-hidden="true" />} text={pt ? "Os vínculos com arquitetura já vêm do seu projeto. Decisões, artefatos, software e verificação entram nas próximas etapas." : "Architecture links already come from your project. Decisions, artifacts, software and verification arrive in the next steps."} />
        </section>}
      </div>}
  </ProjectAreaShell>;
}
