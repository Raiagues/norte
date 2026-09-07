import { graphlib, layout } from "@dagrejs/dagre";
import type { EngineeringAnalysis, EngineeringEntity, EngineeringRequirement, EngineeringSystemModel, EngineeringProperty } from "./engineeringSystem";
import type { Language } from "./types";

export const ENGINEERING_NODE_WIDTH = 206;
export const ENGINEERING_NODE_HEIGHT = 126;

export function engineeringInitialScale(viewport: { width: number; height: number }, graph: { width: number; height: number }, fitRequested = false): number {
  const overview = Math.min(1, Math.max(0.2, Math.min((viewport.width - 70) / graph.width, (viewport.height - 70) / graph.height)));
  return viewport.width < 600 && !fitRequested ? Math.max(0.72, overview) : overview;
}

function reviewId(prefix = "review"): string { return `${prefix}-${crypto.randomUUID()}`; }

export function engineeringLabel(value: string, language: Language): string {
  const labels: Record<string, [string, string]> = {
    system: ["Sistema", "System"], subsystem: ["Subsistema", "Subsystem"], component: ["Componente", "Component"],
    requirement: ["Requisito", "Requirement"], parameter: ["Parâmetro", "Parameter"], calculation: ["Cálculo", "Calculation"], performance: ["Desempenho", "Performance"], interface: ["Interface", "Interface"],
    changed: ["Alterado", "Changed"], valid: ["Compatível", "Compatible"], review: ["Revisar", "Review"], critical: ["Conflito", "Conflict"], unaffected: ["Fora do impacto", "Outside impact"],
    documented: ["Fato documentado", "Documented fact"], calculated: ["Cálculo", "Calculation"], inferred: ["Inferência IA", "AI inference"], user: ["Informado pela equipe", "Team input"], fact: ["Fato", "Fact"], inference: ["Inferência", "Inference"],
    unreviewed: ["Não revisado", "Unreviewed"], accepted: ["Aceito", "Accepted"], verified: ["Verificado", "Verified"],
    contains: ["contém", "contains"], powers: ["alimenta", "powers"], connects_to: ["conecta", "connects to"], depends_on: ["depende de", "depends on"], affects: ["afeta", "affects"], contributes_to: ["contribui para", "contributes to"], constrained_by: ["limitado por", "constrained by"], satisfies: ["satisfaz", "satisfies"], requires: ["requer", "requires"], produces: ["produz", "produces"], consumes: ["consome", "consumes"], measured_by: ["medido por", "measured by"], derived_from: ["derivado de", "derived from"], communicates_with: ["comunica com", "communicates with"], mounted_on: ["montado em", "mounted on"], thermal_coupling: ["acoplamento térmico", "thermal coupling"], unknown: ["A confirmar", "To confirm"]
  };
  return labels[value]?.[language === "pt" ? 0 : 1] ?? value.replaceAll("_", " ");
}

export function formatEngineeringValue(property: Pick<EngineeringProperty, "value" | "unit">): string {
  return `${property.value}${property.unit ? ` ${property.unit}` : ""}`;
}

export function systemVisibleEntities(model: EngineeringSystemModel, parentId: string | null, relevantIds?: Set<string>): EngineeringEntity[] {
  // Requirements are a separate traceability layer, including when migrating a legacy model.
  const entities = model.entities.filter((entity) => String(entity.kind) !== "requirement");
  if (relevantIds) return entities.filter((entity) => relevantIds.has(entity.id));
  if (parentId) return entities.filter((entity) => entity.id === parentId || entity.parentId === parentId || model.relations.some((relation) => relation.kind === "contains" && relation.from === parentId && relation.to === entity.id));
  const macro = entities.filter((entity) => entity.kind === "system" || entity.kind === "subsystem" && !entities.some((parent) => parent.id === entity.parentId && parent.kind === "subsystem"));
  return macro.length ? macro : entities.filter((entity) => !entity.parentId).slice(0, 12);
}

export function layoutEngineeringGraph(model: EngineeringSystemModel, entities: EngineeringEntity[], analysis?: EngineeringAnalysis | null) {
  const visible = new Set(entities.map((entity) => entity.id));
  const relations = model.relations.filter((relation) => visible.has(relation.from) && visible.has(relation.to));
  const graph = new graphlib.Graph({ directed: true, multigraph: true }).setGraph({ rankdir: "TB", nodesep: 42, ranksep: 90, marginx: 40, marginy: 40 }).setDefaultEdgeLabel(() => ({}));
  entities.forEach((entity) => graph.setNode(entity.id, { width: ENGINEERING_NODE_WIDTH, height: ENGINEERING_NODE_HEIGHT }));
  const reversedIds = new Set(relations.filter((relation) => analysis?.impacts.some((impact) => impact.path.some((id, index) => id === relation.to && impact.path[index + 1] === relation.from))).map((relation) => relation.id));
  relations.forEach((relation) => graph.setEdge(reversedIds.has(relation.id) ? relation.to : relation.from, reversedIds.has(relation.id) ? relation.from : relation.to, { weight: relation.kind === "contains" ? 3 : 1 }, relation.id));
  // A parentId carries containment too. This affects layout only; it is never evidence for impact.
  const containmentIds = new Set<string>();
  entities.forEach((entity) => {
    if (!analysis && entity.parentId && visible.has(entity.parentId) && !relations.some((relation) => relation.from === entity.parentId && relation.to === entity.id)) {
      graph.setEdge(entity.parentId, entity.id, { weight: 3 }, `parent:${entity.id}`);
      containmentIds.add(entity.id);
    }
  });
  layout(graph);
  return {
    width: Math.max(286, graph.graph().width ?? 286), height: Math.max(206, graph.graph().height ?? 206),
    nodes: entities.map((entity) => ({ entity, x: graph.node(entity.id).x - ENGINEERING_NODE_WIDTH / 2, y: graph.node(entity.id).y - ENGINEERING_NODE_HEIGHT / 2 })),
    edges: relations.map((relation) => ({ relation, reversed: reversedIds.has(relation.id), points: graph.edge({ v: reversedIds.has(relation.id) ? relation.to : relation.from, w: reversedIds.has(relation.id) ? relation.from : relation.to, name: relation.id }).points as Array<{ x: number; y: number }> })),
    containments: entities.filter((entity) => containmentIds.has(entity.id)).map((entity) => ({ id: entity.id, points: graph.edge({ v: entity.parentId!, w: entity.id, name: `parent:${entity.id}` }).points as Array<{ x: number; y: number }> }))
  };
}

export type RequirementFilters = { query?: string; tag?: string; status?: string; source?: string };
export function filterEngineeringRequirements(requirements: EngineeringRequirement[], filters: RequirementFilters): EngineeringRequirement[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  return requirements.filter((requirement) => {
    const tags = [...requirement.subsystemTags, ...requirement.reviewTags, requirement.category ?? ""];
    return (!query || [requirement.id, requirement.title, requirement.statement, ...tags].join(" ").toLocaleLowerCase().includes(query))
      && (!filters.tag || tags.includes(filters.tag)) && (!filters.status || requirement.status === filters.status)
      && (!filters.source || requirement.sourceRefs.includes(filters.source));
  });
}

export function requirementTrace(model: EngineeringSystemModel, requirement: EngineeringRequirement): { entities: Set<string>; relations: Set<string> } {
  const relations = new Set(requirement.relatedRelationIds);
  const entities = new Set([...requirement.relatedEntityIds, ...(requirement.relatedPropertyRefs ?? []).map((ref) => ref.entityId)]);
  model.relations.forEach((relation) => {
    if (relation.from === requirement.id || relation.to === requirement.id || relations.has(relation.id)) {
      entities.add(relation.from); entities.add(relation.to); relations.add(relation.id);
    }
  });
  return { entities, relations };
}

export function editEngineeringRequirement(original: EngineeringRequirement, patch: Partial<EngineeringRequirement>): EngineeringRequirement {
  return { ...original, ...patch, originalStatement: original.originalStatement ?? original.statement,
    originalSourceRefs: original.originalSourceRefs ?? original.sourceRefs,
    subsystemTags: (patch.subsystemTags ?? original.subsystemTags).map((tag) => tag.trim().slice(0, 80)).filter(Boolean).slice(0, 20),
    reviewTags: (patch.reviewTags ?? original.reviewTags).map((tag) => tag.trim().slice(0, 80)).filter(Boolean).slice(0, 20)
  };
}

/** Project the analyzed values for display; no scenario ever writes its baseline. */
export function projectEngineeringScenario(model: EngineeringSystemModel, analysis: EngineeringAnalysis): EngineeringSystemModel {
  const changed = analysis.change.newValues.map((property, index) => ({ ...property, source: "user" as const, evidenceRefs: property.evidenceRefs.length ? property.evidenceRefs : [`change:${analysis.change.id}:${index}`] }));
  const projectProperties = (id: string, properties: EngineeringProperty[]) => {
    let projected = properties;
    if (id === analysis.changedEntityId) {
      projected = analysis.change.kind === "replace_component" ? changed : [...properties.filter((property) => !changed.some((next) => next.key === property.key)), ...changed];
      if (changed.some((property) => /current|voltage/u.test(property.key))) projected = projected.filter((property) => !["operating_power", "power", "required_power"].includes(property.key) || changed.some((next) => next.key === property.key));
    }
    const impact = analysis.impacts.find((item) => item.entityId === id);
    const calculation = impact?.calculation;
    const resultKey = calculation && ({ sum_power: "total_power", sum_mass: "total_mass", energy_over_power: "estimated_autonomy" } as Record<string, string>)[calculation.ruleId];
    if (resultKey && calculation && typeof calculation.result === "number") projected = [...projected.filter((property) => property.key !== resultKey), { key: resultKey, name: resultKey.replaceAll("_", " "), value: calculation.result, unit: calculation.unit, source: "calculated", evidenceRefs: calculation.evidenceRefs }];
    if (impact?.status === "review" && projected.some((property) => property.key === "formula")) projected = projected.filter((property) => property.key === "formula" || property.source !== "calculated");
    return projected;
  };
  return {
    ...model, evidence: analysis.evidence ?? model.evidence,
    entities: model.entities.map((entity) => {
      const replacement = entity.id === analysis.changedEntityId && analysis.change.kind === "replace_component";
      return { ...entity, name: entity.id === analysis.changedEntityId && analysis.change.replacementName ? analysis.change.replacementName : entity.name, properties: projectProperties(entity.id, entity.properties), ...(replacement ? { description: "", source: "user" as const, evidenceRefs: changed.flatMap((property) => property.evidenceRefs) } : {}) };
    }),
    requirements: model.requirements.map((requirement) => ({ ...requirement, properties: projectProperties(requirement.id, requirement.properties) }))
  };
}

export function engineeringRelationDirectionLabel(kind: string, reversed: boolean, language: Language): string {
  if (!reversed) return engineeringLabel(kind, language);
  const labels: Record<string, [string, string]> = { powers: ["alimentado por", "powered by"], depends_on: ["sustenta", "supports"], derived_from: ["usado em", "used by"], constrained_by: ["restringe", "constrains"], requires: ["requerido por", "required by"], consumes: ["consumido por", "consumed by"], measured_by: ["mede", "measures"], mounted_on: ["suporta", "mounts"], contains: ["parte de", "part of"] };
  return labels[kind]?.[language === "pt" ? 0 : 1] ?? engineeringLabel(kind, language);
}

/** Corrections are explicit team inputs. The original document remains inspectable. */
export function correctEngineeringEntity(model: EngineeringSystemModel, original: EngineeringEntity, draft: EngineeringEntity, timestamp = new Date().toISOString()): EngineeringSystemModel {
  const evidence = [...model.evidence];
  const originalRefs = new Set(original.evidenceRefs);
  const properties = draft.properties.map((property) => {
    const previous = original.properties.find((item) => item.key === property.key);
    if (previous && previous.value === property.value && previous.unit === property.unit) return previous;
    previous?.evidenceRefs.forEach((ref) => originalRefs.add(ref));
    const id = reviewId();
    evidence.push({ id, artifactId: "team-review", artifactLabel: "Team review", kind: "user", excerpt: `${original.name} · ${property.name}: ${previous ? formatEngineeringValue(previous) : "?"} → ${formatEngineeringValue(property)} · ${timestamp}`.slice(0, 600) });
    return { ...property, source: "user" as const, evidenceRefs: [id] };
  });
  let relations = model.relations;
  if (original.parentId !== draft.parentId) {
    relations = relations.filter((relation) => !(relation.kind === "contains" && relation.to === original.id));
    if (draft.parentId) relations = [...relations, { id: reviewId("parent"), from: draft.parentId, to: original.id, kind: "contains", label: "", source: "user", confidence: 1, evidenceRefs: [] }];
  }
  const corrected: EngineeringEntity = { ...draft, name: draft.name.trim(), properties, evidenceRefs: [...originalRefs], source: original.name !== draft.name || original.description !== draft.description ? "user" : original.source };
  if (!corrected.parentId) delete corrected.parentId;
  const relationIds = new Set(relations.map((relation) => relation.id));
  return { ...model, evidence, relations, requirements: model.requirements.map((requirement) => ({ ...requirement, relatedRelationIds: requirement.relatedRelationIds.filter((id) => relationIds.has(id)) })), entities: model.entities.map((entity) => entity.id === original.id ? corrected : entity) };
}

export function removeEngineeringRelation(model: EngineeringSystemModel, id: string): EngineeringSystemModel {
  const removed = model.relations.find((relation) => relation.id === id);
  return { ...model, entities: model.entities.map((entity) => {
    if (removed?.kind !== "contains" || entity.id !== removed.to || entity.parentId !== removed.from) return entity;
    const corrected = { ...entity }; delete corrected.parentId; return corrected;
  }), relations: model.relations.filter((relation) => relation.id !== id), requirements: model.requirements.map((requirement) => ({ ...requirement, relatedRelationIds: requirement.relatedRelationIds.filter((relationId) => relationId !== id) })) };
}

export function engineeringParentCandidates(model: EngineeringSystemModel, entityId: string): EngineeringEntity[] {
  const descendants = new Set([entityId]);
  let changed = true;
  while (changed) {
    changed = false;
    model.entities.forEach((entity) => {
      if (!descendants.has(entity.id) && (entity.parentId && descendants.has(entity.parentId) || model.relations.some((relation) => relation.kind === "contains" && relation.to === entity.id && descendants.has(relation.from)))) { descendants.add(entity.id); changed = true; }
    });
  }
  return model.entities.filter((entity) => !descendants.has(entity.id) && (entity.kind === "system" || entity.kind === "subsystem"));
}

export function correctEngineeringRequirement(model: EngineeringSystemModel, original: EngineeringRequirement, draft: EngineeringRequirement, timestamp = new Date().toISOString()): EngineeringSystemModel {
  const evidence = [...model.evidence];
  const properties = draft.properties.map((property) => {
    const previous = original.properties.find((item) => item.key === property.key);
    if (previous?.value === property.value && previous.unit === property.unit) return previous;
    const id = reviewId();
    evidence.push({ id, artifactId: "team-review", artifactLabel: "Team review", kind: "user", excerpt: `${original.title} · ${property.name}: ${previous ? formatEngineeringValue(previous) : "?"} → ${formatEngineeringValue(property)} · ${timestamp}`.slice(0, 600) });
    return { ...property, source: "user" as const, evidenceRefs: [id] };
  });
  const corrected = editEngineeringRequirement(original, { ...draft, properties, classificationSource: "user" });
  return { ...model, evidence, requirements: model.requirements.map((requirement) => requirement.id === original.id ? corrected : requirement) };
}
