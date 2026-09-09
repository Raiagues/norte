import { TestTubeDiagonal, FileCheck2, FlaskConical, Calculator, FileText, Eye, History, ArrowRight } from "lucide-react";
import { ProjectAreaShell, AreaPreviewNote } from "../components/ProjectAreaShell";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";

/** The four classical verification methods, in the order a review board reads them. */
const METHODS = [
  { id: "test", Icon: FlaskConical, pt: "Ensaio", en: "Test", pt_hint: "Bancada, ambiental, integração.", en_hint: "Bench, environmental, integration." },
  { id: "analysis", Icon: Calculator, pt: "Análise", en: "Analysis", pt_hint: "Orçamentos, margens e cálculo.", en_hint: "Budgets, margins and calculation." },
  { id: "simulation", Icon: History, pt: "Simulação", en: "Simulation", pt_hint: "Órbita, térmica, atitude.", en_hint: "Orbit, thermal, attitude." },
  { id: "inspection", Icon: Eye, pt: "Inspeção", en: "Inspection", pt_hint: "Conferência física e documental.", en_hint: "Physical and documentary check." }
];

const methodFor = (index: number) => METHODS[index % METHODS.length];

export function VerificationPage({ language, project, onOpenRequirements }: { language: Language; project: MissionProject; onOpenRequirements: () => void }) {
  const pt = language === "pt";
  const model = project.engineeringSystem;
  const requirements = model?.requirements ?? [];
  const scenarios = model?.scenarios ?? [];
  const corrections = model?.corrections ?? [];
  // A verification is only as current as the elements it was run against: an
  // explored change or a correction on those elements makes it worth revisiting.
  const touched = new Set([
    ...scenarios.flatMap((scenario) => [scenario.changedEntityId, ...scenario.impacts.filter((impact) => impact.status !== "unaffected").map((impact) => impact.entityId)]),
    ...corrections.map((correction) => correction.targetId)
  ]);
  const stale = (relatedEntityIds: string[]) => relatedEntityIds.filter((id) => touched.has(id));
  const staleCount = requirements.filter((requirement) => stale(requirement.relatedEntityIds).length).length;
  const entityName = (id: string) => model?.entities.find((item) => item.id === id)?.name ?? id;
  const c = pt ? {
    eyebrow: "Área do projeto", title: "Verificação", subtitle: "Como cada requisito é comprovado, e o que deixa de valer quando o projeto muda.",
    empty: "A verificação se organiza em torno dos requisitos. Gere a arquitetura na Concepção para começar.", open: "Ver requisitos",
    method: "Método", planned: "Planejada", review: "Revisar", current: "Sem pendência",
    reviewWhy: "Mudou desde a última verificação:", legend: "Uma mudança anterior no projeto marca a verificação para revisão.",
    counter: (total: number) => `${total} ${total === 1 ? "requisito" : "requisitos"}${staleCount ? ` · ${staleCount} a revisar` : ""}`,
    evidenceHint: "Relatório, log de ensaio ou saída de simulação anexada como artefato."
  } : {
    eyebrow: "Project area", title: "Verification", subtitle: "How each requirement is proven, and what stops holding when the project changes.",
    empty: "Verification is organised around requirements. Generate the architecture in Conception to begin.", open: "See requirements",
    method: "Method", planned: "Planned", review: "Review", current: "Nothing pending",
    reviewWhy: "Changed since the last verification:", legend: "An earlier change in the project marks a verification for review.",
    counter: (total: number) => `${total} ${total === 1 ? "requirement" : "requirements"}${staleCount ? ` · ${staleCount} to review` : ""}`,
    evidenceHint: "Report, test log or simulation output attached as an artifact."
  };

  return <ProjectAreaShell language={language} project={project} icon={<TestTubeDiagonal aria-hidden="true" />} eyebrow={c.eyebrow} title={c.title} subtitle={c.subtitle} counter={c.counter(requirements.length)}>
    <div className="area-method-strip" aria-label={c.method}>
      {METHODS.map(({ id, Icon, pt: ptLabel, en, pt_hint, en_hint }) => <span key={id}><Icon aria-hidden="true" /><strong>{pt ? ptLabel : en}</strong><small>{pt ? pt_hint : en_hint}</small></span>)}
    </div>
    {!requirements.length
      ? <div className="area-empty"><TestTubeDiagonal aria-hidden="true" /><p>{c.empty}</p><button type="button" onClick={onOpenRequirements}>{c.open}</button></div>
      : <><div className="area-grid verification-grid">
        {requirements.map((requirement, index) => {
          const method = methodFor(index);
          const changed = stale(requirement.relatedEntityIds);
          return <article className={changed.length ? "area-card verification-card stale" : "area-card verification-card"} key={requirement.id}>
            <header>
              <span className="area-list-id">{requirement.id}</span>
              <span className={changed.length ? "verification-state review" : "verification-state"}>{changed.length ? c.review : c.current}</span>
            </header>
            <strong>{requirement.title}</strong>
            <p className="verification-statement">{requirement.statement}</p>
            <div className="verification-chain">
              <span><FileCheck2 aria-hidden="true" />{requirement.id}</span>
              <ArrowRight aria-hidden="true" />
              <span><method.Icon aria-hidden="true" />{pt ? method.pt : method.en}</span>
              <ArrowRight aria-hidden="true" />
              <span className="planned"><FileText aria-hidden="true" />{c.planned}</span>
            </div>
            {changed.length > 0 && <p className="verification-why"><History aria-hidden="true" /><span>{c.reviewWhy} {changed.map(entityName).join(", ")}</span></p>}
          </article>;
        })}
      </div>
      <p className="area-legend"><History aria-hidden="true" />{c.legend}</p></>}
    <AreaPreviewNote text={pt
      ? `Os requisitos e o sinal de revisão vêm deste projeto (${scenarios.length} cenários explorados, ${corrections.length} correções). Ensaios, relatórios e evidências anexadas entram nas próximas etapas — ${c.evidenceHint.toLowerCase()}`
      : `The requirements and the review signal come from this project (${scenarios.length} explored scenarios, ${corrections.length} corrections). Tests, reports and attached evidence arrive in the next steps — ${c.evidenceHint.toLowerCase()}`} />
  </ProjectAreaShell>;
}
