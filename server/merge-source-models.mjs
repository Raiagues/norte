import { describeEngineeringSystemViolation } from "../shared/engineering-schema.mjs";

const key = (name) => name.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/gu, "");

/** Add verified source fragments without replacing existing technical values. */
export function mergeSourceModels(baseline, fragments) {
  const result = structuredClone(baseline);
  const initialRoots = result.entities.filter((entity) => !entity.parentId && !result.relations.some((relation) => relation.kind === "contains" && relation.to === entity.id));
  let missionRoot;
  for (const { id, model } of fragments) {
    const prefix = `source-${id.toLowerCase()}-`;
    const entityIds = new Map(), evidenceIds = new Map(model.evidence.map((item) => [item.id, prefix + item.id]));
    const relationIds = new Map(model.relations.map((item) => [item.id, prefix + item.id]));
    for (const entity of model.entities) {
      const matches = result.entities.filter((item) => key(item.name) === key(entity.name) && item.kind === entity.kind);
      entityIds.set(entity.id, matches.length === 1 ? matches[0].id : prefix + entity.id);
    }
    // Overview extractions sometimes call an already documented subsystem a
    // component. Reuse a unique exact name under the same resolved parent;
    // the existing detailed classification and values take precedence.
    for (const entity of model.entities) {
      if (!entity.parentId || !["subsystem", "component"].includes(entity.kind) || result.entities.some((item) => item.id === entityIds.get(entity.id))) continue;
      const matches = result.entities.filter((item) => key(item.name) === key(entity.name) && ["subsystem", "component"].includes(item.kind) && item.parentId === entityIds.get(entity.parentId));
      if (matches.length === 1) entityIds.set(entity.id, matches[0].id);
    }
    const refs = (ids) => ids.map((id) => evidenceIds.get(id));
    const properties = (items) => items.map((item) => ({ ...item, evidenceRefs: refs(item.evidenceRefs) }));
    result.evidence.push(...model.evidence.map((item) => ({ ...item, id: evidenceIds.get(item.id) })));
    for (const entity of model.entities) {
      const mapped = { ...entity, id: entityIds.get(entity.id), evidenceRefs: refs(entity.evidenceRefs), properties: properties(entity.properties), ...(entity.parentId ? { parentId: entityIds.get(entity.parentId) } : {}) };
      const existing = result.entities.find((item) => item.id === mapped.id);
      if (!existing) result.entities.push(mapped);
      else {
        existing.evidenceRefs = [...new Set([...existing.evidenceRefs, ...mapped.evidenceRefs])];
        existing.properties.push(...mapped.properties.filter((property) => !existing.properties.some((item) => item.key === property.key)));
      }
      if (!entity.parentId && entity.kind === "system") missionRoot ??= mapped.id;
    }
    for (const relation of model.relations) {
      const from = entityIds.get(relation.from), to = entityIds.get(relation.to);
      const existing = result.relations.find((item) => item.from === from && item.to === to && item.kind === relation.kind);
      if (existing) relationIds.set(relation.id, existing.id);
      else result.relations.push({ ...relation, id: relationIds.get(relation.id), from, to, evidenceRefs: refs(relation.evidenceRefs) });
    }
    result.requirements.push(...model.requirements.map((item) => ({ ...item, id: prefix + item.id, sourceRefs: refs(item.sourceRefs), originalSourceRefs: refs(item.originalSourceRefs ?? item.sourceRefs), relatedEntityIds: item.relatedEntityIds.map((id) => entityIds.get(id)), relatedRelationIds: item.relatedRelationIds.map((id) => relationIds.get(id)), ...(item.relatedPropertyRefs ? { relatedPropertyRefs: item.relatedPropertyRefs.map((ref) => ({ ...ref, entityId: entityIds.get(ref.entityId) })) } : {}), properties: properties(item.properties) })));
    for (const source of model.artifactSources) if (!result.artifactSources.some((item) => item.artifactId === source.artifactId)) result.artifactSources.push(source);
  }
  // This is organizational grouping inside the same project, not a new causal edge.
  if (missionRoot) for (const root of initialRoots) if (root.id !== missionRoot) root.parentId = missionRoot;
  const snapshot = { entities: baseline.entities, relations: baseline.relations, requirements: baseline.requirements, evidence: baseline.evidence };
  if (baseline.scenarios) result.scenarios = baseline.scenarios.map((scenario) => ({ ...scenario, baseline: scenario.baseline ?? structuredClone(snapshot) }));
  result.revision = (baseline.revision || 0) + 1;
  const violation = describeEngineeringSystemViolation(result);
  if (violation) throw new Error(`Source extension violates the engineering model contract: ${violation}`);
  return result;
}
