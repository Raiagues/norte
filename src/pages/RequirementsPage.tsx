import { useMemo } from "react";
import { ListChecks, Network } from "lucide-react";
import { ProjectAreaShell, AreaPreviewNote } from "../components/ProjectAreaShell";
import { RequirementTable } from "../components/RequirementTable";
import type { RequirementColumn } from "../components/RequirementTable";
import { METHOD_LABELS, projectRequirements } from "../lib/projectRequirements";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";

export function RequirementsPage({ language, project, onOpenConception }: { language: Language; project: MissionProject; onOpenConception: () => void }) {
  const pt = language === "pt";
  const requirements = useMemo(() => projectRequirements(project, language), [project, language]);
  const c = pt ? {
    eyebrow: "Área do projeto", title: "Requisitos", subtitle: "Requisitos do sistema e do programa numa lista só, com o que cada um exige e onde é verificado.",
    empty: "Nenhum requisito ainda. Gere a arquitetura na Concepção ou escolha um programa de referência na Memória do projeto.",
    noMatch: "Nenhum requisito corresponde aos filtros.", open: "Ir para a Concepção",
    id: "ID", requirement: "Requisito", subsystem: "Subsistema", method: "Verificação", origin: "Origem", linked: "Arquitetura", tests: "Testes",
    none: "—", planned: "A planejar", review: "Revisar",
    count: (value: number) => `${value} ${value === 1 ? "requisito" : "requisitos"}`
  } : {
    eyebrow: "Project area", title: "Requirements", subtitle: "System and programme requirements in one list, with what each demands and where it is verified.",
    empty: "No requirements yet. Generate the architecture in Conception, or pick a reference programme in Project Memory.",
    noMatch: "No requirement matches the filters.", open: "Go to Conception",
    id: "ID", requirement: "Requirement", subsystem: "Subsystem", method: "Verification", origin: "Source", linked: "Architecture", tests: "Tests",
    none: "—", planned: "To plan", review: "Review",
    count: (value: number) => `${value} ${value === 1 ? "requirement" : "requirements"}`
  };

  const columns: RequirementColumn[] = [
    { id: "id", head: c.id, className: "col-id", cell: (requirement) => <span className="requirement-id">{requirement.id}</span> },
    { id: "requirement", head: c.requirement, className: "col-main", cell: (requirement) => <><strong>{requirement.title}</strong>{requirement.statement !== requirement.title && <small>{requirement.statement}</small>}</> },
    { id: "subsystem", head: c.subsystem, cell: (requirement) => <span className="requirement-tag">{requirement.subsystem}</span> },
    { id: "method", head: c.method, cell: (requirement) => <span className={`requirement-method method-${requirement.method}`}>{METHOD_LABELS[requirement.method][pt ? 0 : 1]}</span> },
    { id: "origin", head: c.origin, className: "col-origin", cell: (requirement) => <span className={`requirement-source source-${requirement.source}`}>{requirement.origin}</span> },
    { id: "linked", head: c.linked, className: "col-linked", cell: (requirement) => requirement.linked.length ? <ul className="requirement-links">{requirement.linked.map((name) => <li key={name}>{name}</li>)}</ul> : <span className="requirement-muted">{c.none}</span> },
    { id: "tests", head: c.tests, cell: (requirement) => requirement.changed.length ? <span className="requirement-review">{c.review}</span> : <span className="requirement-muted">{c.planned}</span> }
  ];

  return <ProjectAreaShell language={language} project={project} icon={<ListChecks aria-hidden="true" />} eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle} counter={c.count(requirements.length)}>
    {!requirements.length
      ? <div className="area-empty"><Network aria-hidden="true" /><p>{c.empty}</p><button type="button" onClick={onOpenConception}>{c.open}</button></div>
      : <>
        <RequirementTable language={language} requirements={requirements} columns={columns} empty={c.noMatch} />
        <AreaPreviewNote text={pt
          ? "Os requisitos e os vínculos com a arquitetura vêm deste projeto; os do programa vêm do edital selecionado. Testes, evidências e alocação a software entram nas próximas etapas."
          : "Requirements and architecture links come from this project; programme rows come from the selected rules. Tests, evidence and software allocation arrive in the next steps."} />
      </>}
  </ProjectAreaShell>;
}
