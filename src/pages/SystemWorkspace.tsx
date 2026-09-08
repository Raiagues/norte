import { useMemo, useState } from "react";
import { ArrowLeft, Bookmark, Check, FileCheck2, Network, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import type { EngineeringAnalysis, EngineeringRelation, EngineeringRequirement, EngineeringSystemModel } from "../lib/engineeringSystem";
import { engineeringAncestors, engineeringParentId, engineeringLabel, projectEngineeringScenario, requirementTrace, systemVisibleEntities, expandedSystemEntities, engineeringFocus } from "../lib/engineeringUi";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";
import { EngineeringEntityInfo, EngineeringRelationInfo, EngineeringRequirementInfo, EngineeringRequirements } from "../components/EngineeringDetails";
import { EngineeringExplorer } from "../components/EngineeringExplorer";
import { SystemGraph } from "../components/SystemGraph";
import "../engineering-system.css";

type Inspection = { kind: "entity"; id: string } | { kind: "relation"; relation: EngineeringRelation } | { kind: "requirement"; id: string } | null;

export function EngineeringScenario({ language, model, analysis, onClear, onSave, saved = false }: { language: Language; model: EngineeringSystemModel; analysis: EngineeringAnalysis; onClear: () => void; onSave?: () => void; saved?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(analysis.changedEntityId);
  const [inspection, setInspection] = useState<Inspection>(null);
  const [trace, setTrace] = useState<EngineeringRequirement | null>(null);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const pt = language === "pt";
  const scenarioModel = useMemo(() => projectEngineeringScenario(model, analysis), [model, analysis]);
  const relevantIds = useMemo(() => new Set(analysis.impacts.filter((impact) => impact.status !== "unaffected").flatMap((impact) => [impact.entityId, ...impact.path])), [analysis]);
  const entities = useMemo(() => systemVisibleEntities(scenarioModel, null, relevantIds), [scenarioModel, relevantIds]);
  const requirementPriority = (id: string) => ({ critical: 0, review: 1, changed: 2, valid: 3, unaffected: 4 })[analysis.impacts.find((impact) => impact.entityId === id)?.status ?? "unaffected"];
  const affectedRequirements = scenarioModel.requirements.filter((requirement) => analysis.impacts.some((impact) => impact.entityId === requirement.id && impact.status !== "unaffected")).sort((first, second) => requirementPriority(first.id) - requirementPriority(second.id));
  const highlighted = trace ? requirementTrace(scenarioModel, trace) : null;
  const entity = inspection?.kind === "entity" ? scenarioModel.entities.find((item) => item.id === inspection.id) : undefined;
  const requirement = inspection?.kind === "requirement" ? scenarioModel.requirements.find((item) => item.id === inspection.id) : undefined;
  function traceRequirement(next: EngineeringRequirement) { setTrace(next); setInspection(null); }
  return <section className="engineering-workspace engineering-scenario">
    <header className="engineering-workspace-bar"><div className="engineering-scenario-title"><small>{pt ? "Cenário · baseline preservado" : "Scenario · baseline preserved"}</small><strong>{analysis.change.description}</strong></div><div className="engineering-bar-actions">{onSave && <button type="button" disabled={saved} onClick={onSave}>{saved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{saved ? pt ? "Salvo" : "Saved" : pt ? "Salvar cenário" : "Save scenario"}</button>}<button type="button" onClick={onClear}><X aria-hidden="true" />{pt ? "Limpar análise" : "Clear analysis"}</button></div></header>
    <div className="engineering-workspace-body"><div className="engineering-canvas-shell">
      <SystemGraph key={analysis.id} language={language} model={scenarioModel} entities={entities} selectedId={selectedId} highlightIds={highlighted?.entities} highlightRelationIds={highlighted?.relations} analysis={analysis} onSelect={(item) => setSelectedId(item.id)} onInfo={(item) => setInspection({ kind: "entity", id: item.id })} onRelation={(relation) => setInspection({ kind: "relation", relation })} />
      {trace && <div className="engineering-trace-bar"><FileCheck2 aria-hidden="true" /><strong>{trace.title}</strong><span>{trace.statement}</span><button type="button" onClick={() => setTrace(null)} aria-label={pt ? "Limpar destaque do requisito" : "Clear requirement highlight"}><X aria-hidden="true" /></button></div>}
      {affectedRequirements.length > 0 && <div className="engineering-scenario-requirements"><button type="button" className="engineering-requirements-trigger" onClick={() => setRequirementsOpen(!requirementsOpen)}><FileCheck2 aria-hidden="true" />{affectedRequirements.length} {pt ? affectedRequirements.length === 1 ? "requisito afetado" : "requisitos afetados" : affectedRequirements.length === 1 ? "requirement affected" : "requirements affected"}</button>{affectedRequirements.slice(0, 3).map((item) => <button type="button" key={item.id} className={`engineering-requirement-impact status-${analysis.impacts.find((impact) => impact.entityId === item.id)?.status}`} onClick={() => setInspection({ kind: "requirement", id: item.id })}>{item.title}<span>{engineeringLabel(analysis.impacts.find((impact) => impact.entityId === item.id)?.status ?? "review", language)}</span></button>)}</div>}
      {analysis.unresolvedQuestions.length > 0 && <details className="engineering-missing-information"><summary>{pt ? "Informação necessária" : "Information needed"} · {analysis.unresolvedQuestions.length}</summary><ul>{analysis.unresolvedQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></details>}
    </div>
    {requirementsOpen && <EngineeringRequirements docked language={language} model={{ ...scenarioModel, requirements: affectedRequirements }} impacts={analysis.impacts} onClose={() => setRequirementsOpen(false)} onTrace={traceRequirement} onEdit={(item) => setInspection({ kind: "requirement", id: item.id })} />}</div>
    {entity && <EngineeringEntityInfo language={language} model={scenarioModel} entity={entity} impact={analysis.impacts.find((impact) => impact.entityId === entity.id)} onClose={() => setInspection(null)} onRelation={(relation) => setInspection({ kind: "relation", relation })} />}
    {inspection?.kind === "relation" && <EngineeringRelationInfo language={language} model={scenarioModel} relation={inspection.relation} onClose={() => setInspection(null)} />}
    {requirement && <EngineeringRequirementInfo language={language} model={scenarioModel} requirement={requirement} impact={analysis.impacts.find((impact) => impact.entityId === requirement.id)} onClose={() => setInspection(null)} onTrace={() => traceRequirement(requirement)} />}
  </section>;
}

export function SystemWorkspace({ language, project, onProjectChange, onBackSetup }: { language: Language; project: MissionProject; onProjectChange: (project: MissionProject) => void; onBackSetup: () => void }) {
  const model = project.engineeringSystem;
  const [treeOpen, setTreeOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(model?.entities.filter((entity) => !engineeringParentId(model, entity)).map((entity) => entity.id)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection>(null);
  const pt = language === "pt";
  const entities = useMemo(() => model ? expandedSystemEntities(model, expanded) : [], [model, expanded]);
  const highlightIds = useMemo(() => model && selectedId ? engineeringFocus(model, selectedId) : undefined, [model, selectedId]);
  const entity = inspection?.kind === "entity" ? model?.entities.find((item) => item.id === inspection.id) : undefined;
  function updateModel(next: EngineeringSystemModel) { onProjectChange({ ...project, engineeringSystem: next }); }
  function toggle(id: string) {
    setSelectedId(id);
    setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function selectTree(id: string) {
    if (!model) return;
    setExpanded((current) => new Set([...current, ...engineeringAncestors(model, id).slice(0, -1).map((item) => item.id)]));
    setSelectedId(id);
  }
  if (!model || !model.entities.length) return <section className="engineering-workspace engineering-empty"><Network aria-hidden="true" /><h2>{pt ? "O sistema começa na memória do projeto" : "The system starts with Project Memory"}</h2><p>{pt ? "Ainda não há informação suficiente para construir a arquitetura. Vincule fontes que descrevam componentes, interfaces ou requisitos." : "There is not enough information to build the architecture yet. Link sources describing components, interfaces or requirements."}</p>{model?.artifactSources.length ? <ul>{model.artifactSources.map((source) => <li key={source.artifactId}>{source.artifactLabel}{source.reason ? ` · ${source.reason}` : ""}</li>)}</ul> : <small>{project.context.projectArtifactIds.length + project.context.teamArtifactIds.length} {pt ? "artefatos vinculados" : "linked artifacts"}</small>}<button type="button" onClick={onBackSetup}><ArrowLeft aria-hidden="true" />{pt ? "Voltar à memória do projeto" : "Return to Project Memory"}</button></section>;
  return <section className="engineering-workspace">
    <header className="engineering-workspace-bar"><div className="engineering-model-title"><Network /><strong>{project.name}</strong><small>{entities.length} / {model.entities.length}</small></div>
      <div className="engineering-bar-actions"><button type="button" onClick={() => { setExpanded(new Set(model.entities.map((item) => item.id))); setSelectedId(null); }}>{pt ? "Expandir tudo" : "Expand all"}</button><button type="button" onClick={() => { setExpanded(new Set()); setSelectedId(null); }}>{pt ? "Recolher tudo" : "Collapse all"}</button></div>
    </header>
    <div className="engineering-workspace-body">
      <div className={`engineering-hierarchy-panel ${treeOpen ? "open" : "closed"}`}>
        <button type="button" className="engineering-hierarchy-toggle" aria-label={pt ? treeOpen ? "Recolher hierarquia" : "Expandir hierarquia" : treeOpen ? "Collapse hierarchy" : "Expand hierarchy"} aria-expanded={treeOpen} onClick={() => setTreeOpen(!treeOpen)}>{treeOpen ? <PanelLeftClose /> : <PanelLeftOpen />}{treeOpen && <span>{pt ? "Hierarquia" : "Hierarchy"}</span>}</button>
        {treeOpen && <EngineeringExplorer model={model} language={language} selectedId={selectedId} expandedIds={expanded} onToggle={toggle} onSelect={selectTree} onOverview={() => setSelectedId(null)} />}
      </div>
      <div className="engineering-canvas-shell">
        <SystemGraph key={model.generatedAt} positions={project.navigation.systemLayouts?.architecture} onPositionsChange={(positions) => onProjectChange({ ...project, navigation: { ...project.navigation, systemLayouts: { ...project.navigation.systemLayouts, architecture: positions } } })} language={language} model={model} entities={entities} selectedId={selectedId} highlightIds={highlightIds} onSelect={(item) => setSelectedId(item.id)} onClearSelection={() => setSelectedId(null)} onInfo={(item) => setInspection({ kind: "entity", id: item.id })} expandedIds={expanded} onToggleChildren={(item) => toggle(item.id)} onRelation={(relation) => setInspection({ kind: "relation", relation })} />
      </div>
    </div>
    {entity && <EngineeringEntityInfo language={language} model={model} entity={entity} onClose={() => setInspection(null)} onModelChange={updateModel} onRelation={(relation) => setInspection({ kind: "relation", relation })} correctionContext={{ projectId: project.id, projectName: project.name }} />}
    {inspection?.kind === "relation" && <EngineeringRelationInfo language={language} model={model} relation={inspection.relation} onClose={() => setInspection(null)} onModelChange={updateModel} correctionContext={{ projectId: project.id, projectName: project.name }} />}
  </section>;
}
