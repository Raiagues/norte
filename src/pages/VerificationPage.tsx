import { useMemo } from "react";
import { ShieldCheck, History, ArrowRight, FileText } from "lucide-react";
import { ProjectAreaShell } from "../components/ProjectAreaShell";
import type { RailNavigation } from "../components/ProjectHeader";
import { RequirementTable } from "../components/RequirementTable";
import type { RequirementColumn } from "../components/RequirementTable";
import { METHOD_LABELS, projectRequirements } from "../lib/projectRequirements";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";

export function VerificationPage({ language, project, navigation }: { language: Language; project: MissionProject; navigation: RailNavigation }) {
  const pt = language === "pt";
  const requirements = useMemo(() => projectRequirements(project, language), [project, language]);
  const staleCount = requirements.filter((requirement) => requirement.changed.length).length;
  const c = pt ? {
    title: "Verificação",
    empty: "A verificação se organiza em torno dos requisitos. Gere a arquitetura na Concepção para começar.",
    noMatch: "Nenhuma verificação corresponde aos filtros.", open: "Ver requisitos",
    id: "ID", requirement: "Requisito", method: "Método", evidence: "Evidência", state: "Situação", why: "Mudou desde a verificação",
    planned: "Planejada", review: "Revisar", current: "Sem pendência", stateFilter: "Situação", none: "—",
    counter: (total: number) => `${total} ${total === 1 ? "verificação" : "verificações"}${staleCount ? ` · ${staleCount} a revisar` : ""}`
  } : {
    title: "Verification",
    empty: "Verification is organised around requirements. Generate the architecture in Conception to begin.",
    noMatch: "No verification matches the filters.", open: "See requirements",
    id: "ID", requirement: "Requirement", method: "Method", evidence: "Evidence", state: "State", why: "Changed since verification",
    planned: "Planned", review: "Review", current: "Nothing pending", stateFilter: "State", none: "—",
    counter: (total: number) => `${total} ${total === 1 ? "verification" : "verifications"}${staleCount ? ` · ${staleCount} to review` : ""}`
  };

  const columns: RequirementColumn[] = [
    { id: "id", head: c.id, className: "col-id", cell: (requirement) => <span className="requirement-id">{requirement.id}</span> },
    { id: "requirement", head: c.requirement, className: "col-main", cell: (requirement) => <><strong>{requirement.title}</strong><small>{requirement.subsystem}</small></> },
    { id: "chain", head: c.method, className: "col-chain", cell: (requirement) => <span className="verification-chain">
      <span className={`requirement-method method-${requirement.method}`}>{METHOD_LABELS[requirement.method][pt ? 0 : 1]}</span>
      <ArrowRight aria-hidden="true" />
      <span className="requirement-muted"><FileText aria-hidden="true" />{c.planned}</span>
    </span> },
    { id: "state", head: c.state, cell: (requirement) => requirement.changed.length ? <span className="requirement-review">{c.review}</span> : <span className="verification-ok">{c.current}</span> },
    { id: "why", head: c.why, className: "col-why", cell: (requirement) => requirement.changed.length
      ? <span className="verification-why"><History aria-hidden="true" />{requirement.changed.join(", ")}</span>
      : <span className="requirement-muted">{c.none}</span> }
  ];

  return <ProjectAreaShell language={language} project={project} area="verification" navigation={navigation} counter={c.counter(requirements.length)}>
    {!requirements.length
      ? <div className="area-empty"><ShieldCheck aria-hidden="true" /><p>{c.empty}</p><button type="button" onClick={() => navigation.onOpen("requirements")}>{c.open}</button></div>
      : <>
        <RequirementTable language={language} requirements={requirements} columns={columns} empty={c.noMatch}
          extraFilter={{ label: c.stateFilter, options: [{ value: "review", label: c.review }, { value: "current", label: c.current }], match: (requirement, value) => value === "review" ? requirement.changed.length > 0 : requirement.changed.length === 0 }} />
      </>}
  </ProjectAreaShell>;
}
