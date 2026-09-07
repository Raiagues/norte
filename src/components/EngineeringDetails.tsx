import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, ExternalLink, FileText, Pencil, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { useAuth } from "../lib/auth";
import { ENGINEERING_RELATION_KINDS } from "../lib/engineeringSystem";
import type { EngineeringEntity, EngineeringImpact, EngineeringProperty, EngineeringRelation, EngineeringRequirement, EngineeringSystemModel } from "../lib/engineeringSystem";
import { correctEngineeringEntity, correctEngineeringRequirement, engineeringLabel, engineeringParentCandidates, filterEngineeringRequirements, formatEngineeringValue, removeEngineeringRelation } from "../lib/engineeringUi";
import type { RequirementFilters } from "../lib/engineeringUi";
import type { ConnectedArtifact } from "../lib/team";
import type { Language } from "../lib/types";

export function EngineeringDialog({ title, eyebrow, language, onClose, children, wide = false }: { title: string; eyebrow?: string; language: Language; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const titleId = useId();
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const element = ref.current;
    element?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab" || !element) return;
      const focusable = Array.from(element.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]')).filter((item) => !item.hidden && item.getClientRects().length);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (!element.contains(document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === element)) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === element)) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); if (previous?.isConnected) previous.focus(); };
  }, []);
  const content = <div className="engineering-dialog-backdrop" onPointerDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <section className={`engineering-dialog${wide ? " wide" : ""}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header><div>{eyebrow && <small>{eyebrow}</small>}<h2 id={titleId}>{title}</h2></div><button type="button" onClick={onClose} aria-label={language === "pt" ? "Fechar" : "Close"}><X aria-hidden="true" /></button></header>
      <div className="engineering-dialog-body">{children}</div>
    </section>
  </div>;
  return typeof document === "undefined" ? content : createPortal(content, document.body);
}

export function EngineeringEvidenceList({ language, model, refs }: { language: Language; model: EngineeringSystemModel; refs: string[] }) {
  const { api } = useAuth();
  const [artifacts, setArtifacts] = useState<ConnectedArtifact[]>([]);
  const [opened, setOpened] = useState(false);
  const [error, setError] = useState("");
  const unique = [...new Set(refs)];
  const evidence = model.evidence.filter((item) => unique.includes(item.id));
  useEffect(() => {
    if (!opened) return;
    let active = true;
    void api<{ artifacts: ConnectedArtifact[] }>("/artifacts").then((result) => { if (active) setArtifacts(result.artifacts); }).catch(() => { if (active) setError(language === "pt" ? "Arquivo indisponível; o trecho preservado está abaixo." : "File unavailable; the preserved excerpt is below."); });
    return () => { active = false; };
  }, [api, opened, language]);
  if (!unique.length) return <p className="engineering-muted">{language === "pt" ? "Sem evidência documental vinculada." : "No documented evidence linked."}</p>;
  return <details className="engineering-evidence" onToggle={(event) => setOpened(event.currentTarget.open)}>
    <summary><FileText aria-hidden="true" />{language === "pt" ? "Fontes e evidências" : "Sources and evidence"}<span>{evidence.length}</span></summary>
    {opened && <div>{error && <p className="engineering-muted">{error}</p>}{evidence.map((item) => {
      const artifact = artifacts.find((source) => source.id === item.artifactId);
      const url = artifact?.url ?? "";
      const safeUrl = /^(https?:\/\/|data:(?:application\/(?:pdf|json|msword|vnd\.[a-z0-9.+-]+)|text\/(?:plain|csv|markdown))[;,])/iu.test(url);
      return <article key={item.id} className="engineering-source"><small>{engineeringLabel(item.kind, language)}</small><strong>{item.artifactLabel}</strong>{item.locator && <span>{item.locator}</span>}{item.excerpt && <blockquote><mark>{item.excerpt}</mark></blockquote>}{safeUrl && <a href={url} target="_blank" rel="noopener noreferrer" download={url.startsWith("data:") ? artifact?.fileName || artifact?.label : undefined}>{language === "pt" ? "Abrir fonte" : "Open source"}<ExternalLink aria-hidden="true" /></a>}</article>;
    })}{unique.some((id) => !evidence.some((item) => item.id === id)) && <p className="engineering-muted">{language === "pt" ? "Há referências ainda não disponíveis neste modelo." : "Some references are not available in this model yet."}</p>}</div>}
  </details>;
}

export function EngineeringImpactDetails({ language, model, impact }: { language: Language; model: EngineeringSystemModel; impact: EngineeringImpact }) {
  const pt = language === "pt";
  const calculation = impact.calculation ?? impact.reasoning.calculation;
  return <div className="engineering-impact-details">
    <span className={`engineering-status status-${impact.status}`}>{engineeringLabel(impact.status, language)}</span>
    <p>{impact.shortExplanation}</p>
    <small>{engineeringLabel(impact.reasoning.type, language)}{impact.reasoning.type === "inference" && ` · ${Math.round(impact.confidence * 100)}%`}</small>
    {calculation && <div className="engineering-calculation"><strong>{calculation.expression}</strong><dl>{calculation.inputs.map((input, index) => <div key={`${input.entityId}:${input.propertyKey}:${index}`}><dt>{model.entities.find((entity) => entity.id === input.entityId)?.name ?? input.entityId} · {model.entities.find((entity) => entity.id === input.entityId)?.properties.find((property) => property.key === input.propertyKey)?.name ?? input.propertyKey}</dt><dd>{input.value} {input.unit}</dd></div>)}</dl><small>{pt ? "Regra" : "Rule"}: {calculation.ruleId}</small></div>}
    {impact.path.length > 1 && <div className="engineering-impact-path" aria-label={pt ? "Caminho de impacto" : "Impact path"}>{impact.path.map((id, index) => <span key={`${id}:${index}`}>{index > 0 && <ArrowRight aria-hidden="true" />}{model.entities.find((entity) => entity.id === id)?.name ?? model.requirements.find((requirement) => requirement.id === id)?.title ?? id}</span>)}</div>}
    {impact.traversedRelationIds.length > 0 && <details className="engineering-disclosure"><summary>{pt ? "Por que este caminho?" : "Why this path?"}</summary>{impact.traversedRelationIds.map((id) => {
      const relation = model.relations.find((item) => item.id === id);
      return relation ? <div className="engineering-path-step" key={id}><p>{model.entities.find((entity) => entity.id === relation.from)?.name ?? relation.from} <span>{engineeringLabel(relation.kind, language)}</span> {model.entities.find((entity) => entity.id === relation.to)?.name ?? relation.to}</p><small>{engineeringLabel(relation.source, language)}</small><EngineeringEvidenceList language={language} model={model} refs={relation.evidenceRefs} /></div> : null;
    })}</details>}
    <EngineeringEvidenceList language={language} model={model} refs={[...impact.evidenceRefs, ...impact.reasoning.sourceRefs, ...(calculation?.evidenceRefs ?? [])]} />
    {impact.reasoning.type === "inference" && <small className="engineering-muted">{impact.reasoning.model ?? model.model ?? "AI"} · {new Date(impact.reasoning.createdAt).toLocaleString(language === "pt" ? "pt-BR" : "en-GB")}</small>}
  </div>;
}

export function EngineeringEntityInfo({ language, model, entity, impact, onClose, onModelChange, onWhatIf, onRelation }: { language: Language; model: EngineeringSystemModel; entity: EngineeringEntity; impact?: EngineeringImpact; onClose: () => void; onModelChange?: (model: EngineeringSystemModel) => void; onWhatIf?: () => void; onRelation: (relation: EngineeringRelation) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entity);
  const pt = language === "pt";
  const relations = model.relations.filter((relation) => relation.from === entity.id || relation.to === entity.id);
  function save() { if (!draft.name.trim()) return; onModelChange?.(correctEngineeringEntity(model, entity, draft)); setEditing(false); }
  function updateProperty(index: number, value: string) {
    setDraft((current) => ({ ...current, properties: current.properties.map((property, item) => item === index ? { ...property, value: value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value, source: "user" } : property) }));
  }
  return <EngineeringDialog title={entity.name} eyebrow={engineeringLabel(entity.kind, language)} language={language} onClose={onClose}>
    {impact && <EngineeringImpactDetails language={language} model={model} impact={impact} />}
    {editing ? <form className="engineering-form" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <label>{pt ? "Nome" : "Name"}<input value={draft.name} maxLength={140} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>{pt ? "Descrição" : "Description"}<textarea value={draft.description} maxLength={600} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
      {entity.kind !== "system" && <label>{pt ? "Subsistema" : "Subsystem"}<select value={draft.parentId ?? ""} onChange={(event) => setDraft({ ...draft, parentId: event.target.value || undefined })}><option value="">{pt ? "Sem grupo" : "Ungrouped"}</option>{engineeringParentCandidates(model, entity.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {draft.properties.map((property, index) => <label key={property.key}>{property.name}{property.unit && ` (${property.unit})`}<input value={String(property.value)} maxLength={500} onChange={(event) => updateProperty(index, event.target.value)} /></label>)}
      <footer><button type="button" onClick={() => setEditing(false)}>{pt ? "Cancelar" : "Cancel"}</button><button type="submit" className="primary"><Check aria-hidden="true" />{pt ? "Salvar correção" : "Save correction"}</button></footer>
    </form> : <>
      {entity.description && <p>{entity.description}</p>}
      {entity.parentId && <p className="engineering-muted">{engineeringLabel("subsystem", language)} · {model.entities.find((item) => item.id === entity.parentId)?.name}</p>}
      <dl className="engineering-properties">{entity.properties.map((property) => <div key={property.key}><dt>{property.name}<small>{engineeringLabel(property.source, language)}</small></dt><dd>{formatEngineeringValue(property)}</dd>{property.evidenceRefs.length > 0 && <EngineeringEvidenceList language={language} model={model} refs={property.evidenceRefs} />}</div>)}</dl>
      <div className="engineering-provenance"><small>{engineeringLabel(entity.source, language)}{entity.source === "inferred" && ` · ${Math.round(entity.confidence * 100)}%`}</small><EngineeringEvidenceList language={language} model={model} refs={entity.evidenceRefs} /></div>
      <details className="engineering-disclosure"><summary>{pt ? "Dependências diretas" : "Direct dependencies"} · {relations.length}</summary>{relations.map((relation) => <button key={relation.id} type="button" className="engineering-relation-row" onClick={() => onRelation(relation)}>{model.entities.find((item) => item.id === relation.from)?.name ?? relation.from}<span>{engineeringLabel(relation.kind, language)}</span>{model.entities.find((item) => item.id === relation.to)?.name ?? model.requirements.find((item) => item.id === relation.to)?.title ?? relation.to}</button>)}{onModelChange && <button type="button" className="engineering-text-button" onClick={() => onRelation({ id: "", from: entity.id, to: "", kind: "depends_on", label: "", source: "user", evidenceRefs: [], confidence: 1 })}><Plus aria-hidden="true" />{pt ? "Vincular elemento" : "Link an element"}</button>}</details>
      {(onWhatIf || onModelChange) && <footer className="engineering-dialog-actions">{onModelChange && <button type="button" onClick={() => { setDraft(entity); setEditing(true); }}><Pencil aria-hidden="true" />{pt ? "Corrigir" : "Correct"}</button>}{onWhatIf && <button type="button" className="primary" onClick={onWhatIf}>{pt ? "E se…" : "What if…"}</button>}</footer>}
    </>}
  </EngineeringDialog>;
}

export function EngineeringRelationInfo({ language, model, relation, onClose, onModelChange }: { language: Language; model: EngineeringSystemModel; relation: EngineeringRelation; onClose: () => void; onModelChange?: (model: EngineeringSystemModel) => void }) {
  const [draft, setDraft] = useState(relation);
  const pt = language === "pt";
  const [editing, setEditing] = useState(!relation.id);
  const from = model.entities.find((entity) => entity.id === relation.from);
  const targets = [...model.entities.map((entity) => ({ id: entity.id, name: entity.name })), ...model.requirements.map((requirement) => ({ id: requirement.id, name: requirement.title }))];
  const to = targets.find((item) => item.id === relation.to);
  return <EngineeringDialog language={language} title={pt ? "Relação técnica" : "Technical relationship"} onClose={onClose}>
    {editing ? <form className="engineering-form" onSubmit={(event) => {
      event.preventDefault();
      if (!draft.to || draft.to === draft.from) return;
      const id = relation.id || `relation-${crypto.randomUUID()}`;
      const evidenceId = `review-${crypto.randomUUID()}`;
      const corrected = { ...draft, id, source: "user" as const, evidenceRefs: [evidenceId] };
      onModelChange?.({ ...model, evidence: [...model.evidence, { id: evidenceId, artifactId: "team-review", artifactLabel: pt ? "Revisão da equipe" : "Team review", excerpt: `${targets.find((item) => item.id === draft.from)?.name ?? draft.from} · ${engineeringLabel(draft.kind, language)} · ${targets.find((item) => item.id === draft.to)?.name ?? draft.to}`, kind: "user" }], relations: relation.id ? model.relations.map((item) => item.id === relation.id ? corrected : item) : [...model.relations, corrected] }); onClose();
    }}><p>{from?.name}</p><label>{pt ? "Relação" : "Relationship"}<select value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as EngineeringRelation["kind"] })}>{ENGINEERING_RELATION_KINDS.map((kind) => <option key={kind} value={kind}>{engineeringLabel(kind, language)}</option>)}</select></label><label>{pt ? "Elemento" : "Element"}<select value={draft.to} required onChange={(event) => setDraft({ ...draft, to: event.target.value })}><option value="">{pt ? "Selecionar" : "Select"}</option>{targets.filter((item) => item.id !== draft.from).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{pt ? "Nota curta" : "Short note"}<input value={draft.label} maxLength={160} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></label><footer><button type="submit" className="primary">{pt ? "Salvar relação" : "Save relationship"}</button></footer></form> : <>
      <p className="engineering-relation-description">{from?.name}<span>{engineeringLabel(relation.kind, language)}</span>{to?.name}</p>{relation.label && <p>{relation.label}</p>}<small>{engineeringLabel(relation.source, language)}{relation.source === "inferred" && ` · ${Math.round(relation.confidence * 100)}%`}</small><EngineeringEvidenceList language={language} model={model} refs={relation.evidenceRefs} />{onModelChange && <footer className="engineering-dialog-actions"><button type="button" onClick={() => { onModelChange(removeEngineeringRelation(model, relation.id)); onClose(); }}><Trash2 aria-hidden="true" />{pt ? "Remover relação" : "Remove relationship"}</button><button type="button" onClick={() => setEditing(true)}><Pencil aria-hidden="true" />{pt ? "Corrigir" : "Correct"}</button></footer>}
    </>}
  </EngineeringDialog>;
}

export function EngineeringRequirements({ language, model, impacts = [], onClose, onTrace, onEdit }: { language: Language; model: EngineeringSystemModel; impacts?: EngineeringImpact[]; onClose: () => void; onTrace: (requirement: EngineeringRequirement) => void; onEdit: (requirement: EngineeringRequirement) => void }) {
  const [filters, setFilters] = useState<RequirementFilters>({});
  const [facets, setFacets] = useState(false);
  const pt = language === "pt";
  const requirements = filterEngineeringRequirements(model.requirements, filters);
  const tags = [...new Set(model.requirements.flatMap((item) => [...item.subsystemTags, ...item.reviewTags, item.category ?? ""]).filter(Boolean))].sort();
  const sources = model.evidence.filter((item) => model.requirements.some((requirement) => requirement.sourceRefs.includes(item.id)));
  const filterCount = [filters.tag, filters.source, filters.status].filter(Boolean).length;
  return <EngineeringDialog language={language} title={`${pt ? "Requisitos" : "Requirements"} · ${model.requirements.length}`} onClose={onClose} wide>
    <div className="engineering-requirements-search"><label><span className="engineering-sr-only">{pt ? "Buscar requisitos" : "Search requirements"}</span><input type="search" value={filters.query ?? ""} placeholder={pt ? "Buscar texto, referência ou disciplina" : "Search text, reference or discipline"} onChange={(event) => setFilters({ ...filters, query: event.target.value })} /></label><button type="button" aria-expanded={facets} onClick={() => setFacets(!facets)}><SlidersHorizontal aria-hidden="true" />{pt ? "Filtrar" : "Filter"}{filterCount ? ` · ${filterCount}` : ""}</button></div>
    {facets && <div className="engineering-requirement-facets"><label>{pt ? "Disciplina / revisão" : "Discipline / review"}<select value={filters.tag ?? ""} onChange={(event) => setFilters({ ...filters, tag: event.target.value })}><option value="">{pt ? "Todas" : "All"}</option>{tags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}</select></label><label>Status<select value={filters.status ?? ""} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">{pt ? "Todos" : "All"}</option>{["unreviewed", "accepted", "review", "verified"].map((status) => <option value={status} key={status}>{engineeringLabel(status, language)}</option>)}</select></label><label>{pt ? "Fonte" : "Source"}<select value={filters.source ?? ""} onChange={(event) => setFilters({ ...filters, source: event.target.value })}><option value="">{pt ? "Todas" : "All"}</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.artifactLabel}{source.locator ? ` · ${source.locator}` : ""}</option>)}</select></label>{filterCount > 0 && <button type="button" onClick={() => setFilters({ query: filters.query })}>{pt ? "Limpar filtros" : "Clear filters"}</button>}</div>}
    <div className="engineering-requirements-list">{requirements.map((requirement) => {
      const impact = impacts.find((item) => item.entityId === requirement.id);
      return <article key={requirement.id} className="engineering-requirement-row"><button type="button" className="engineering-requirement-main" onClick={() => onTrace(requirement)}><span><strong>{requirement.title}</strong><small className={impact ? `status-${impact.status}` : ""}>{engineeringLabel(impact?.status ?? requirement.status, language)}</small></span><p>{requirement.statement}</p><em>{[...requirement.subsystemTags, ...requirement.reviewTags].join(" · ")}</em></button><button className="engineering-text-button" type="button" onClick={() => onEdit(requirement)} aria-label={`${pt ? "Inspecionar e corrigir" : "Inspect and correct"} ${requirement.title}`}><Pencil aria-hidden="true" /></button></article>;
    })}</div>
    {!requirements.length && <p className="engineering-muted">{model.requirements.length ? pt ? "Nenhum requisito corresponde aos filtros." : "No requirements match these filters." : pt ? "A memória ainda não contém requisitos identificáveis." : "The memory does not contain identifiable requirements yet."}</p>}
    {requirements.length > 0 && <p className="engineering-muted">{pt ? "Selecione um requisito para ver o que ele restringe no sistema." : "Select a requirement to see what it constrains in the system."}</p>}
  </EngineeringDialog>;
}

export function EngineeringRequirementInfo({ language, model, requirement, impact, onClose, onModelChange, onTrace, onWhatIf }: { language: Language; model: EngineeringSystemModel; requirement: EngineeringRequirement; impact?: EngineeringImpact; onClose: () => void; onModelChange?: (model: EngineeringSystemModel) => void; onTrace: () => void; onWhatIf?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(requirement);
  const pt = language === "pt";
  function propertyValue(property: EngineeringProperty, value: string): EngineeringProperty { return { ...property, value: value.trim() && Number.isFinite(Number(value)) ? Number(value) : value, source: "user" }; }
  return <EngineeringDialog language={language} eyebrow={pt ? "Requisito" : "Requirement"} title={requirement.title} onClose={onClose}>
    {impact && <EngineeringImpactDetails language={language} model={model} impact={impact} />}
    {editing ? <form className="engineering-form" onSubmit={(event) => { event.preventDefault(); onModelChange?.(correctEngineeringRequirement(model, requirement, draft)); setEditing(false); }}>
      <label>{pt ? "Título" : "Title"}<input value={draft.title} required maxLength={160} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
      <label>{pt ? "Enunciado revisado" : "Reviewed statement"}<textarea value={draft.statement} required maxLength={1200} onChange={(event) => setDraft({ ...draft, statement: event.target.value })} /></label>
      <label>{pt ? "Categoria" : "Category"}<input value={draft.category ?? ""} maxLength={100} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
      <label>{pt ? "Disciplinas (separadas por vírgula)" : "Disciplines (comma separated)"}<input value={draft.subsystemTags.join(", ")} onChange={(event) => setDraft({ ...draft, subsystemTags: event.target.value.split(",").map((tag) => tag.trim()) })} /></label>
      <label>{pt ? "Revisões (separadas por vírgula)" : "Reviews (comma separated)"}<input value={draft.reviewTags.join(", ")} onChange={(event) => setDraft({ ...draft, reviewTags: event.target.value.split(",").map((tag) => tag.trim()) })} /></label>
      <label>Status<select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as EngineeringRequirement["status"] })}>{["unreviewed", "accepted", "review", "verified"].map((status) => <option key={status} value={status}>{engineeringLabel(status, language)}</option>)}</select></label>
      {draft.properties.map((property, index) => <label key={property.key}>{property.name} {property.unit}<input value={String(property.value)} maxLength={500} onChange={(event) => setDraft({ ...draft, properties: draft.properties.map((item, position) => position === index ? propertyValue(item, event.target.value) : item) })} /></label>)}
      <fieldset className="engineering-source-choices"><legend>{pt ? "Evidências vinculadas" : "Linked evidence"}</legend>{model.evidence.map((source) => <label key={source.id}><input type="checkbox" checked={draft.sourceRefs.includes(source.id)} onChange={(event) => setDraft({ ...draft, sourceRefs: event.target.checked ? [...draft.sourceRefs, source.id] : draft.sourceRefs.filter((id) => id !== source.id) })} />{source.artifactLabel}{source.locator ? ` · ${source.locator}` : ""}</label>)}</fieldset>
      <footer><button type="button" onClick={() => setEditing(false)}>{pt ? "Cancelar" : "Cancel"}</button><button type="submit" className="primary">{pt ? "Salvar correção" : "Save correction"}</button></footer>
    </form> : <><p>{requirement.statement}</p><small>{engineeringLabel(requirement.status, language)}</small>{requirement.originalStatement && <details className="engineering-disclosure"><summary>{pt ? "Extração original" : "Original extraction"}</summary><blockquote>{requirement.originalStatement}</blockquote><EngineeringEvidenceList language={language} model={model} refs={requirement.originalSourceRefs ?? requirement.sourceRefs} /></details>}
      <dl className="engineering-properties">{requirement.properties.map((property) => <div key={property.key}><dt>{property.name}<small>{engineeringLabel(property.source, language)}</small></dt><dd>{formatEngineeringValue(property)}</dd></div>)}</dl>
      <p className="engineering-muted">{[requirement.category, ...requirement.subsystemTags, ...requirement.reviewTags].filter(Boolean).join(" · ")}{requirement.classificationSource && ` · ${engineeringLabel(requirement.classificationSource, language)}`}</p><EngineeringEvidenceList language={language} model={model} refs={requirement.sourceRefs} />
      <footer className="engineering-dialog-actions">{onModelChange && <button type="button" onClick={() => { setDraft(requirement); setEditing(true); }}><Pencil aria-hidden="true" />{pt ? "Corrigir" : "Correct"}</button>}<button type="button" onClick={onTrace}>{pt ? "Ver no sistema" : "Trace in system"}</button>{onWhatIf && <button type="button" className="primary" onClick={onWhatIf}>{pt ? "E se…" : "What if…"}</button>}</footer>
    </>}
  </EngineeringDialog>;
}
