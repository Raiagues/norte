import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, Check, ChevronRight, FileCheck2, LoaderCircle, Network, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import type { EngineeringAnalysis, EngineeringChange, EngineeringProperty, EngineeringRelation, EngineeringRequirement, EngineeringSystemModel } from "../lib/engineeringSystem";
import { analyzeImpact } from "../lib/impactEngine";
import { engineeringLabel, formatEngineeringValue, projectEngineeringScenario, requirementTrace, systemVisibleEntities } from "../lib/engineeringUi";
import type { MissionProject } from "../lib/projectStore";
import type { Language } from "../lib/types";
import { EngineeringDialog, EngineeringEntityInfo, EngineeringRelationInfo, EngineeringRequirementInfo, EngineeringRequirements } from "../components/EngineeringDetails";
import { SystemGraph } from "../components/SystemGraph";
import "../engineering-system.css";

export type EngineeringWhatIfSuggestion = { targetEntityId: string; propertyKey?: string; value?: number | string; unit?: string; replacementName?: string };
type Target = { id: string; name: string; kind: string; properties: EngineeringProperty[] };
const EXTRA_PROPERTIES = [
  { key: "peak_current", pt: "Corrente de pico", en: "Peak current", unit: "A" },
  { key: "mass", pt: "Massa", en: "Mass", unit: "g" },
  { key: "required_voltage", pt: "Tensão requerida", en: "Required voltage", unit: "V" },
  { key: "required_power", pt: "Potência requerida", en: "Required power", unit: "W" },
  { key: "minimum_autonomy", pt: "Autonomia mínima", en: "Minimum autonomy", unit: "min" }
];

export function EngineeringWhatIf({ language, project, targetEntityId, suggestion, onClose, onAnalyzed }: { language: Language; project: MissionProject; targetEntityId?: string; suggestion?: EngineeringWhatIfSuggestion; onClose: () => void; onAnalyzed: (analysis: EngineeringAnalysis) => void }) {
  const auth = useAuth();
  const model = project.engineeringSystem;
  const targets: Target[] = [...(model?.entities.map((entity) => ({ ...entity })) ?? []), ...(model?.requirements.map((requirement) => ({ id: requirement.id, name: requirement.title, kind: "requirement", properties: requirement.properties })) ?? [])];
  const [targetId, setTargetId] = useState(suggestion?.targetEntityId ?? targetEntityId ?? "");
  const [query, setQuery] = useState("");
  const initialTarget = targets.find((target) => target.id === (suggestion?.targetEntityId ?? targetEntityId));
  const [propertyKey, setPropertyKey] = useState(suggestion?.propertyKey ?? initialTarget?.properties[0]?.key ?? "");
  const [value, setValue] = useState(suggestion?.value !== undefined ? String(suggestion.value) : "");
  const [unit, setUnit] = useState(suggestion?.unit ?? initialTarget?.properties.find((property) => property.key === suggestion?.propertyKey)?.unit ?? initialTarget?.properties[0]?.unit ?? "");
  const [replacing, setReplacing] = useState(Boolean(suggestion?.replacementName));
  const [replacementName, setReplacementName] = useState(suggestion?.replacementName ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [extra, setExtra] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => { requestRef.current?.abort(); }, []);
  const pt = language === "pt";
  const target = targets.find((item) => item.id === targetId);
  const property = target?.properties.find((item) => item.key === propertyKey);
  const extraProperty = EXTRA_PROPERTIES.find((item) => item.key === propertyKey);
  const propertyName = property?.name ?? (extraProperty ? extraProperty[language] : propertyKey);
  const canAnalyze = Boolean(target && ((replacing && replacementName.trim()) || propertyKey && value.trim()));

  function chooseTarget(next: Target) {
    setTargetId(next.id); setPropertyKey(next.properties[0]?.key ?? ""); setUnit(next.properties[0]?.unit ?? ""); setValue(""); setReplacementName(""); setReplacing(false); setExtra(false); setError("");
  }
  function chooseProperty(key: string, nextUnit: string) { setPropertyKey(key); setUnit(nextUnit); setValue(""); }
  async function run(localOnly = false) {
    if (!model || !target || !canAnalyze || busy) return;
    const nextValue = Number(value.replace(",", "."));
    const newValues: EngineeringProperty[] = propertyKey && value.trim() ? [{ key: propertyKey, name: propertyName, value: Number.isFinite(nextValue) ? nextValue : value.trim(), ...(unit.trim() ? { unit: unit.trim() } : {}), source: "user", evidenceRefs: [] }] : [];
    const description = (replacing ? `${target.name} → ${replacementName.trim()}${newValues.length ? ` · ${propertyName}: ${formatEngineeringValue(newValues[0])}` : ""}` : `${target.name} · ${propertyName}: ${property ? formatEngineeringValue(property) : "?"} → ${formatEngineeringValue(newValues[0])}`).slice(0, 600);
    const change: EngineeringChange = { id: `change-${crypto.randomUUID()}`, targetEntityId: target.id, kind: target.kind === "requirement" ? "requirement" : replacing ? "replace_component" : "parameter", oldValues: target.properties, newValues, description, createdAt: new Date().toISOString(), ...(replacing ? { replacementName: replacementName.trim() } : {}) };
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true); setError("");
    try {
      const analysis = auth.isDemo || localOnly ? analyzeImpact(model, change, language) : await auth.api<EngineeringAnalysis>("/system-ai/analyze-change", { method: "POST", body: JSON.stringify({ engineeringSystem: model, change, language }), signal: controller.signal });
      if (controller.signal.aborted) return;
      onAnalyzed(analysis);
    } catch (reason) { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : pt ? "Não foi possível analisar a alteração." : "This change could not be analyzed."); }
    finally { setBusy(false); }
  }

  return <EngineeringDialog language={language} title={pt ? "E se…" : "What if…"} eyebrow={pt ? "Cenário temporário" : "Temporary scenario"} onClose={onClose}>
    {!model ? <p>{pt ? "Conclua a memória do projeto para explorar mudanças no sistema." : "Complete Project Memory to explore changes to the system."}</p> : !target ? <div className="engineering-target-picker"><label className="engineering-form-label">{pt ? "O que você quer mudar?" : "What would you like to change?"}<input type="search" value={query} placeholder={pt ? "Componente, parâmetro ou requisito" : "Component, parameter or requirement"} onChange={(event) => setQuery(event.target.value)} /></label><div>{targets.filter((item) => `${item.name} ${item.properties.map((p) => p.name).join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map((item) => <button key={item.id} type="button" onClick={() => chooseTarget(item)}><span><small>{engineeringLabel(item.kind, language)}</small><strong>{item.name}</strong></span><ChevronRight aria-hidden="true" /></button>)}</div></div> : <form className="engineering-whatif-form" onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <div className="engineering-whatif-target"><div><small>{engineeringLabel(target.kind, language)}</small><strong>{target.name}</strong></div><button type="button" disabled={busy} onClick={() => setTargetId("")}>{pt ? "Trocar alvo" : "Change target"}</button></div>
      {target.kind === "component" && <div className="engineering-whatif-mode"><button type="button" className={!replacing ? "active" : ""} aria-pressed={!replacing} disabled={busy} onClick={() => setReplacing(false)}>{pt ? "Mudar um valor" : "Change a value"}</button><button type="button" className={replacing ? "active" : ""} aria-pressed={replacing} disabled={busy} onClick={() => setReplacing(true)}>{pt ? "Substituir componente" : "Replace component"}</button></div>}
      {replacing && <label className="engineering-form-label">{pt ? "Novo componente" : "New component"}<input value={replacementName} onChange={(event) => setReplacementName(event.target.value)} placeholder={pt ? "Nome ou modelo do candidato" : "Candidate name or model"} maxLength={140} required disabled={busy} /></label>}
      <div className="engineering-property-picker" role="group" aria-label={pt ? "Propriedade a alterar" : "Property to change"}>{target.properties.map((item) => <button type="button" key={item.key} disabled={busy} className={propertyKey === item.key ? "active" : ""} aria-pressed={propertyKey === item.key} onClick={() => chooseProperty(item.key, item.unit ?? "")}>{item.name}</button>)}<button type="button" disabled={busy} aria-expanded={extra || !target.properties.length} onClick={() => setExtra(!extra)}>{pt ? "+ Dado técnico" : "+ Technical value"}</button></div>
      {(extra || !target.properties.length) && <div className="engineering-extra-properties">{EXTRA_PROPERTIES.filter((item) => !target.properties.some((existing) => existing.key === item.key)).map((item) => <button key={item.key} type="button" className={propertyKey === item.key ? "active" : ""} disabled={busy} onClick={() => chooseProperty(item.key, item.unit)}>{item[language]}</button>)}</div>}
      {propertyKey && <label className="engineering-inline-change"><span>{propertyName}</span><div><output>{property ? formatEngineeringValue(property) : pt ? "Não informado" : "Unknown"}</output><ArrowRight aria-hidden="true" /><input aria-label={pt ? "Novo valor" : "New value"} value={value} placeholder="…" onChange={(event) => setValue(event.target.value)} required={!replacing} disabled={busy} maxLength={200} /><input className="engineering-unit-input" aria-label={pt ? "Unidade" : "Unit"} value={unit} onChange={(event) => setUnit(event.target.value)} placeholder={pt ? "unidade" : "unit"} disabled={busy} maxLength={20} /></div></label>}
      <p className="engineering-muted">{pt ? "A alteração será simulada sobre o sistema atual. O baseline é preservado." : "The change is simulated against the current system. The baseline is preserved."}</p>
      {error && <div role="alert" className="engineering-error"><p>{error}</p><button type="button" onClick={() => void run(true)} disabled={busy}>{pt ? "Analisar com os dados disponíveis" : "Analyze with available data"}</button></div>}
      <footer><button type="submit" disabled={!canAnalyze || busy} className="primary">{busy && <LoaderCircle className="engineering-spin" aria-hidden="true" />}{busy ? pt ? "Seguindo dependências…" : "Following dependencies…" : pt ? "Ver consequências" : "See consequences"}</button></footer>
    </form>}
  </EngineeringDialog>;
}

type Inspection = { kind: "entity"; id: string } | { kind: "relation"; relation: EngineeringRelation } | { kind: "requirement"; id: string } | { kind: "requirements" } | null;

export function EngineeringScenario({ language, model, analysis, onClear, onSave, saved = false }: { language: Language; model: EngineeringSystemModel; analysis: EngineeringAnalysis; onClear: () => void; onSave?: () => void; saved?: boolean }) {
  const [selectedId, setSelectedId] = useState<string | null>(analysis.changedEntityId);
  const [inspection, setInspection] = useState<Inspection>(null);
  const [trace, setTrace] = useState<EngineeringRequirement | null>(null);
  const pt = language === "pt";
  const scenarioModel = useMemo(() => projectEngineeringScenario(model, analysis), [model, analysis]);
  const relevantIds = useMemo(() => new Set(analysis.impacts.filter((impact) => impact.status !== "unaffected").flatMap((impact) => [impact.entityId, ...impact.path])), [analysis]);
  const entities = useMemo(() => systemVisibleEntities(scenarioModel, null, relevantIds), [scenarioModel, relevantIds]);
  const requirementPriority = (id: string) => ({ critical: 0, review: 1, changed: 2, valid: 3, unaffected: 4 })[analysis.impacts.find((impact) => impact.entityId === id)?.status ?? "unaffected"];
  const affectedRequirements = model.requirements.filter((requirement) => analysis.impacts.some((impact) => impact.entityId === requirement.id && impact.status !== "unaffected")).sort((first, second) => requirementPriority(first.id) - requirementPriority(second.id));
  const highlighted = trace ? requirementTrace(scenarioModel, trace) : null;
  const entity = inspection?.kind === "entity" ? scenarioModel.entities.find((item) => item.id === inspection.id) : undefined;
  const requirement = inspection?.kind === "requirement" ? scenarioModel.requirements.find((item) => item.id === inspection.id) : undefined;
  function traceRequirement(next: EngineeringRequirement) { setTrace(next); setInspection(null); }
  return <section className="engineering-workspace engineering-scenario">
    <header className="engineering-workspace-bar"><div className="engineering-scenario-title"><small>{pt ? "Cenário · baseline preservado" : "Scenario · baseline preserved"}</small><strong>{analysis.change.description}</strong></div><div className="engineering-bar-actions">{onSave && <button type="button" disabled={saved} onClick={onSave}>{saved ? <Check aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{saved ? pt ? "Salvo" : "Saved" : pt ? "Salvar cenário" : "Save scenario"}</button>}<button type="button" onClick={onClear}><X aria-hidden="true" />{pt ? "Limpar análise" : "Clear analysis"}</button></div></header>
    <div className="engineering-canvas-shell">
      <SystemGraph key={analysis.id} language={language} model={scenarioModel} entities={entities} selectedId={selectedId} highlightIds={highlighted?.entities} highlightRelationIds={highlighted?.relations} analysis={analysis} onSelect={(item) => setSelectedId(item.id)} onInfo={(item) => setInspection({ kind: "entity", id: item.id })} onRelation={(relation) => setInspection({ kind: "relation", relation })} />
      {trace && <div className="engineering-trace-bar"><FileCheck2 aria-hidden="true" /><strong>{trace.title}</strong><span>{trace.statement}</span><button type="button" onClick={() => setTrace(null)} aria-label={pt ? "Limpar destaque do requisito" : "Clear requirement highlight"}><X aria-hidden="true" /></button></div>}
      {affectedRequirements.length > 0 && <div className="engineering-scenario-requirements"><button type="button" className="engineering-requirements-trigger" onClick={() => setInspection({ kind: "requirements" })}><FileCheck2 aria-hidden="true" />{affectedRequirements.length} {pt ? affectedRequirements.length === 1 ? "requisito afetado" : "requisitos afetados" : affectedRequirements.length === 1 ? "requirement affected" : "requirements affected"}</button>{affectedRequirements.slice(0, 3).map((item) => <button type="button" key={item.id} className={`engineering-requirement-impact status-${analysis.impacts.find((impact) => impact.entityId === item.id)?.status}`} onClick={() => setInspection({ kind: "requirement", id: item.id })}>{item.title}<span>{engineeringLabel(analysis.impacts.find((impact) => impact.entityId === item.id)?.status ?? "review", language)}</span></button>)}</div>}
      {analysis.unresolvedQuestions.length > 0 && <details className="engineering-missing-information"><summary>{pt ? "Informação necessária" : "Information needed"} · {analysis.unresolvedQuestions.length}</summary><ul>{analysis.unresolvedQuestions.map((question, index) => <li key={index}>{question}</li>)}</ul></details>}
    </div>
    {entity && <EngineeringEntityInfo language={language} model={scenarioModel} entity={entity} impact={analysis.impacts.find((impact) => impact.entityId === entity.id)} onClose={() => setInspection(null)} onRelation={(relation) => setInspection({ kind: "relation", relation })} />}
    {inspection?.kind === "relation" && <EngineeringRelationInfo language={language} model={scenarioModel} relation={inspection.relation} onClose={() => setInspection(null)} />}
    {inspection?.kind === "requirements" && <EngineeringRequirements language={language} model={{ ...scenarioModel, requirements: affectedRequirements }} impacts={analysis.impacts} onClose={() => setInspection(null)} onTrace={traceRequirement} onEdit={(item) => setInspection({ kind: "requirement", id: item.id })} />}
    {requirement && <EngineeringRequirementInfo language={language} model={scenarioModel} requirement={requirement} impact={analysis.impacts.find((impact) => impact.entityId === requirement.id)} onClose={() => setInspection(null)} onTrace={() => traceRequirement(requirement)} />}
  </section>;
}

export function SystemWorkspace({ language, project, onProjectChange, onBackSetup }: { language: Language; project: MissionProject; onProjectChange: (project: MissionProject) => void; onBackSetup: () => void }) {
  const [parentId, setParentId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection>(null);
  const [whatIf, setWhatIf] = useState<{ targetEntityId?: string } | null>(null);
  const [analysis, setAnalysis] = useState<EngineeringAnalysis | null>(null);
  const [trace, setTrace] = useState<EngineeringRequirement | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const model = project.engineeringSystem;
  const pt = language === "pt";
  const correctionContext = { projectId: project.id, projectName: project.name };
  const highlighted = model && trace ? requirementTrace(model, trace) : null;
  const entities = useMemo(() => model ? systemVisibleEntities(model, parentId, highlighted?.entities.size ? highlighted.entities : undefined) : [], [model, parentId, highlighted]);
  const entity = inspection?.kind === "entity" ? model?.entities.find((item) => item.id === inspection.id) : undefined;
  const requirement = inspection?.kind === "requirement" ? model?.requirements.find((item) => item.id === inspection.id) : undefined;
  function updateModel(next: EngineeringSystemModel) { onProjectChange({ ...project, engineeringSystem: next }); }
  function explore(id?: string) { setInspection(null); setWhatIf({ targetEntityId: id }); }
  function traceRequirement(next: EngineeringRequirement) { setTrace(next); setInspection(null); }
  const parent = model?.entities.find((item) => item.id === parentId);
  if (!model || !model.entities.length) return <section className="engineering-workspace engineering-empty"><Network aria-hidden="true" /><h2>{pt ? "O sistema começa na memória do projeto" : "The system starts with Project Memory"}</h2><p>{pt ? "Ainda não há informação suficiente para construir a arquitetura. Vincule fontes que descrevam componentes, interfaces ou requisitos." : "There is not enough information to build the architecture yet. Link sources describing components, interfaces or requirements."}</p>{model?.artifactSources.length ? <ul>{model.artifactSources.map((source) => <li key={source.artifactId}>{source.artifactLabel}{source.reason ? ` · ${source.reason}` : ""}</li>)}</ul> : <small>{project.context.projectArtifactIds.length + project.context.teamArtifactIds.length} {pt ? "artefatos vinculados" : "linked artifacts"}</small>}<button type="button" onClick={onBackSetup}><ArrowLeft aria-hidden="true" />{pt ? "Voltar à memória do projeto" : "Return to Project Memory"}</button></section>;

  return <>
    {analysis ? <EngineeringScenario language={language} model={model} analysis={analysis} onClear={() => setAnalysis(null)} saved={model.scenarios?.some((scenario) => scenario.id === analysis.id)} onSave={() => updateModel({ ...model, scenarios: [...(model.scenarios ?? []).filter((scenario) => scenario.id !== analysis.id), analysis] })} /> : <section className="engineering-workspace">
      <header className="engineering-workspace-bar"><nav className="engineering-breadcrumb" aria-label={pt ? "Nível do sistema" : "System level"}><button type="button" onClick={() => { setParentId(null); setTrace(null); }}><Network aria-hidden="true" />{model.name}</button>{parent && <><ChevronRight aria-hidden="true" /><span>{parent.name}</span></>}</nav><button type="button" className="engineering-requirements-trigger" onClick={() => setInspection({ kind: "requirements" })}><FileCheck2 aria-hidden="true" />{pt ? "Requisitos" : "Requirements"}<span>{model.requirements.length}</span></button></header>
      <div className="engineering-canvas-shell">
        <SystemGraph key={`${parentId ?? "macro"}:${trace?.id ?? ""}`} language={language} model={model} entities={entities} selectedId={selectedId} highlightIds={highlighted?.entities} highlightRelationIds={highlighted?.relations} onSelect={(item) => setSelectedId(item.id)} onInfo={(item) => setInspection({ kind: "entity", id: item.id })} onDrillDown={(item) => { if (item.id !== parentId) { setParentId(item.id); setSelectedId(item.id); setTrace(null); } }} onWhatIf={(item) => explore(item.id)} onRelation={(relation) => setInspection({ kind: "relation", relation })} />
        {trace && <div className="engineering-trace-bar"><button type="button" onClick={() => setInspection({ kind: "requirement", id: trace.id })}><FileCheck2 aria-hidden="true" />{trace.title}</button><span>{trace.statement}</span><button type="button" onClick={() => setTrace(null)} aria-label={pt ? "Limpar destaque do requisito" : "Clear requirement highlight"}><X aria-hidden="true" /></button></div>}
        {!selectedId && !trace && <p className="engineering-canvas-hint"><span className="engineering-desktop-hint">{pt ? "Explore um subsistema. Selecione um elemento para testar uma mudança." : "Explore a subsystem. Select an element to test a change."}</span><span className="engineering-mobile-hint">{pt ? "Arraste para explorar. Toque num subsistema." : "Drag to explore. Tap a subsystem."}</span></p>}
        {project.memoryRevision > model.generatedFromRevision && <p className="engineering-memory-notice">{pt ? "Novas informações na memória · modelo atual preservado" : "New information in memory · current model preserved"}</p>}
        {(model.scenarios?.length ?? 0) > 0 && <div className="engineering-history"><button type="button" onClick={() => setHistoryOpen(true)}><Bookmark aria-hidden="true" />{model.scenarios?.length} {pt ? model.scenarios?.length === 1 ? "cenário salvo" : "cenários salvos" : model.scenarios?.length === 1 ? "saved scenario" : "saved scenarios"}</button></div>}
      </div>
    </section>}
    {entity && <EngineeringEntityInfo language={language} model={model} entity={entity} onClose={() => setInspection(null)} onModelChange={updateModel} onWhatIf={() => explore(entity.id)} onRelation={(relation) => setInspection({ kind: "relation", relation })} correctionContext={correctionContext} />}
    {inspection?.kind === "relation" && <EngineeringRelationInfo language={language} model={model} relation={inspection.relation} onClose={() => setInspection(null)} onModelChange={updateModel} correctionContext={correctionContext} />}
    {inspection?.kind === "requirements" && <EngineeringRequirements language={language} model={model} onClose={() => setInspection(null)} onTrace={traceRequirement} onEdit={(item) => setInspection({ kind: "requirement", id: item.id })} />}
    {requirement && <EngineeringRequirementInfo language={language} model={model} requirement={requirement} onClose={() => setInspection(null)} onModelChange={updateModel} onTrace={() => traceRequirement(requirement)} onWhatIf={() => explore(requirement.id)} correctionContext={correctionContext} />}
    {whatIf && <EngineeringWhatIf key={whatIf.targetEntityId ?? "picker"} language={language} project={project} targetEntityId={whatIf.targetEntityId} onClose={() => setWhatIf(null)} onAnalyzed={(next) => { setAnalysis(next); setWhatIf(null); }} />}
    {historyOpen && <EngineeringDialog language={language} title={pt ? "Cenários salvos" : "Saved scenarios"} onClose={() => setHistoryOpen(false)}><div className="engineering-scenario-history">{model.scenarios?.map((scenario) => <button type="button" key={scenario.id} onClick={() => { setAnalysis(scenario); setHistoryOpen(false); }}><strong>{scenario.change.description}</strong><span>{scenario.metrics.impacted} {pt ? "impactos" : "impacts"} · {new Date(scenario.createdAt).toLocaleDateString(language === "pt" ? "pt-BR" : "en-GB")}</span></button>)}</div></EngineeringDialog>}
  </>;
}
