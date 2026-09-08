const str = (maxLength = 500, minLength = 0) => ({ type: "string", maxLength, minLength });
const list = (items, maxItems = 200) => ({ type: "array", items, maxItems });
const obj = (properties, required = Object.keys(properties)) => ({ type: "object", additionalProperties: false, properties, required });
const refs = () => list(str(140, 1));
const source = { type: "string", enum: ["documented", "calculated", "inferred", "user"] };
const confidence = { type: "number", minimum: 0, maximum: 1 };
export const propertySchema = obj({ key: str(100, 1), name: str(140, 1), value: { anyOf: [{ type: "number" }, str(500)] }, unit: str(30), source, evidenceRefs: refs() }, ["key", "name", "value", "source", "evidenceRefs"]);
export const evidenceSchema = obj({ id: str(140, 1), artifactId: str(140, 1), artifactLabel: str(160, 1), locator: str(160), excerpt: str(600, 1), kind: { type: "string", enum: ["fact", "calculation", "inference", "user"] } }, ["id", "artifactId", "artifactLabel", "excerpt", "kind"]);
export const entitySchema = obj({ id: str(100, 1), name: str(140, 1), kind: { type: "string", enum: ["system", "subsystem", "component", "parameter", "calculation", "performance", "interface"] }, parentId: str(100), description: str(600), properties: list(propertySchema, 40), source, evidenceRefs: refs(), confidence }, ["id", "name", "kind", "description", "properties", "source", "evidenceRefs", "confidence"]);
export const relationSchema = obj({ id: str(100, 1), from: str(100, 1), to: str(100, 1), kind: { type: "string", enum: ["contains", "powers", "connects_to", "depends_on", "affects", "contributes_to", "constrained_by", "satisfies", "requires", "produces", "consumes", "measured_by", "derived_from", "communicates_with", "mounted_on", "thermal_coupling", "unknown"] }, label: str(160), source, evidenceRefs: refs(), confidence });
export const requirementSchema = obj({ id: str(100, 1), title: str(160, 1), statement: str(1200, 1), originalStatement: str(1200), category: str(100), subsystemTags: list(str(80), 20), reviewTags: list(str(80), 20), status: { type: "string", enum: ["unreviewed", "accepted", "review", "verified"] }, sourceRefs: refs(), originalSourceRefs: refs(), relatedEntityIds: refs(), relatedRelationIds: refs(), relatedPropertyRefs: list(obj({ entityId: str(100, 1), propertyKey: str(100, 1) })), properties: list(propertySchema, 40), classificationSource: source }, ["id", "title", "statement", "subsystemTags", "reviewTags", "status", "sourceRefs", "relatedEntityIds", "relatedRelationIds", "properties"]);
export const changeSchema = obj({ id: str(100, 1), targetEntityId: str(100, 1), kind: { type: "string", enum: ["replace_component", "parameter", "requirement"] }, oldValues: list(propertySchema, 40), newValues: list(propertySchema, 40), replacementName: str(140), description: str(600), createdAt: str(40, 1) }, ["id", "targetEntityId", "kind", "oldValues", "newValues", "description", "createdAt"]);
const inputSchema = obj({ entityId: str(100, 1), propertyKey: str(100, 1), value: { type: "number" }, unit: str(30), evidenceRefs: refs() });
const calculationSchema = obj({ ruleId: str(100, 1), expression: str(800), inputs: list(inputSchema), result: { anyOf: [{ type: "number" }, { type: "boolean" }] }, unit: str(30), evidenceRefs: refs() }, ["ruleId", "expression", "inputs", "result", "evidenceRefs"]);
const reasoningSchema = obj({ type: { type: "string", enum: ["fact", "calculation", "inference", "unknown"] }, sourceRefs: refs(), inputFacts: list(inputSchema), traversedRelationIds: refs(), ruleId: str(100), calculation: calculationSchema, shortExplanation: str(800), confidence, model: str(100), createdAt: str(40, 1) }, ["type", "sourceRefs", "inputFacts", "traversedRelationIds", "shortExplanation", "confidence", "createdAt"]);
const impactSchema = obj({ entityId: str(100, 1), status: { type: "string", enum: ["changed", "valid", "review", "critical", "unaffected"] }, reasonCode: str(100), shortExplanation: str(800), path: refs(), traversedRelationIds: refs(), evidenceRefs: refs(), calculation: calculationSchema, reasoning: reasoningSchema, confidence }, ["entityId", "status", "reasonCode", "shortExplanation", "path", "traversedRelationIds", "evidenceRefs", "reasoning", "confidence"]);
export const analysisSchema = obj({ id: str(140, 1), changeId: str(100, 1), changedEntityId: str(100, 1), change: changeSchema, impacts: list(impactSchema, 400), calculations: list(calculationSchema, 400), evidence: list(evidenceSchema, 500), unresolvedQuestions: list(str(800), 400), createdAt: str(40, 1), model: str(100), metrics: obj({ impacted: { type: "integer" }, critical: { type: "integer" }, review: { type: "integer" }, evidenced: { type: "integer" }, inferred: { type: "integer" } }) }, ["id", "changeId", "changedEntityId", "change", "impacts", "calculations", "unresolvedQuestions", "createdAt", "metrics"]);
const correctionSnapshotSchema = { anyOf: [{ type: "null" }, obj({ entity: entitySchema }), obj({ relation: relationSchema }), obj({ requirement: requirementSchema })] };
export const correctionSchema = obj({
  id: str(100, 1), transactionId: str(100, 1), objectKind: { type: "string", enum: ["entity", "relation", "requirement"] }, operation: { type: "string", enum: ["create", "update", "delete"] }, targetId: str(100, 1),
  suggested: correctionSnapshotSchema, previous: correctionSnapshotSchema, corrected: correctionSnapshotSchema,
  context: obj({ baselineId: str(100, 1), baselineRevision: { type: "integer", minimum: 0 }, generatedFromRevision: { type: "integer", minimum: 0 }, projectId: str(100, 1), projectName: str(200), projectType: str(140), entities: list(entitySchema, 8), entitiesTruncated: { type: "boolean" } }, ["baselineId", "baselineRevision", "generatedFromRevision", "entities", "entitiesTruncated"]),
  suggestedEvidence: list(evidenceSchema, 500), previousEvidence: list(evidenceSchema, 500), correctedEvidence: list(evidenceSchema, 500), createdAt: str(40, 1)
});
export const engineeringSystemSchema = obj({ schemaVersion: { type: "integer", enum: [1] }, id: str(100, 1), name: str(140, 1), entities: list(entitySchema), relations: list(relationSchema, 400), requirements: list(requirementSchema), evidence: list(evidenceSchema, 500), artifactSources: list(obj({ artifactId: str(140, 1), artifactLabel: str(160, 1), status: { type: "string", enum: ["parsed", "pdf", "metadata_only", "not_parsed"] }, reason: str(500) }, ["artifactId", "artifactLabel", "status"])), generatedAt: str(40, 1), generatedFromRevision: { type: "integer", minimum: 0 }, model: str(100), revision: { type: "integer", minimum: 0 }, scenarios: list(analysisSchema, 30), corrections: list(correctionSchema, 1000) }, ["schemaVersion", "id", "name", "entities", "relations", "requirements", "evidence", "artifactSources", "generatedAt", "generatedFromRevision"]);
export const generationRequestSchema = obj({ projectId: str(100, 1), language: { type: "string", enum: ["pt", "en"] } }, ["projectId"]);
export const analysisRequestSchema = obj({ engineeringSystem: engineeringSystemSchema, change: changeSchema, language: { type: "string", enum: ["pt", "en"] } }, ["engineeringSystem", "change"]);

/** The same bounded JSON Schema is used at HTTP and provider response boundaries. */
export function matchesSchema(value, schema) {
  if (schema.anyOf) return schema.anyOf.some((alternative) => matchesSchema(value, alternative));
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === "string") return typeof value === "string" && value.length >= (schema.minLength ?? 0) && value.length <= (schema.maxLength ?? Infinity);
  if (schema.type === "number" || schema.type === "integer") return typeof value === "number" && Number.isFinite(value) && (schema.type !== "integer" || Number.isInteger(value)) && value >= (schema.minimum ?? -Infinity) && value <= (schema.maximum ?? Infinity);
  if (schema.type === "boolean") return typeof value === "boolean";
  if (schema.type === "null") return value === null;
  if (schema.type === "array") return Array.isArray(value) && value.length <= (schema.maxItems ?? Infinity) && value.every((item) => matchesSchema(item, schema.items));
  if (schema.type === "object") return value !== null && typeof value === "object" && !Array.isArray(value) && schema.required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => Object.hasOwn(schema.properties, key) && matchesSchema(value[key], schema.properties[key]));
  return false;
}

export function validateEngineeringSystem(model) {
  if (!matchesSchema(model, engineeringSystemSchema)) return false;
  const entities = new Map(model.entities.map((item) => [item.id, item]));
  const requirements = new Set(model.requirements.map((item) => item.id));
  const relations = new Set(model.relations.map((item) => item.id));
  const evidence = new Set(model.evidence.map((item) => item.id));
  if (entities.size !== model.entities.length || requirements.size !== model.requirements.length || relations.size !== model.relations.length || evidence.size !== model.evidence.length || [...requirements].some((id) => entities.has(id))) return false;
  const known = (refs) => refs.every((ref) => evidence.has(ref));
  const propertiesValid = (properties) => new Set(properties.map((item) => item.key)).size === properties.length && properties.every((item) => known(item.evidenceRefs));
  for (const entity of model.entities) {
    if (!known(entity.evidenceRefs) || !propertiesValid(entity.properties)) return false;
    const visited = new Set([entity.id]);
    let parent = entity.parentId;
    while (parent) { if (!entities.has(parent) || visited.has(parent)) return false; visited.add(parent); parent = entities.get(parent).parentId; }
  }
  if (model.relations.some((item) => (!entities.has(item.from) && !requirements.has(item.from)) || (!entities.has(item.to) && !requirements.has(item.to)) || item.from === item.to || !known(item.evidenceRefs))) return false;
  // Historical correction snapshots are self-contained. Their objects may have since been removed.
  const corrections = model.corrections || [];
  if (new Set(corrections.map((item) => item.id)).size !== corrections.length) return false;
  for (const correction of corrections) {
    if (correction.context.baselineId !== model.id || correction.context.baselineRevision > (model.revision || 0)) return false;
    if (correction.operation === "create" && (correction.previous !== null || correction.corrected === null) || correction.operation === "update" && (correction.previous === null || correction.corrected === null) || correction.operation === "delete" && (correction.previous === null || correction.corrected !== null)) return false;
    for (const [snapshot, sources] of [[correction.suggested, correction.suggestedEvidence], [correction.previous, correction.previousEvidence], [correction.corrected, correction.correctedEvidence]]) {
      if (!snapshot) continue;
      const object = snapshot[correction.objectKind];
      if (!object || object.id !== correction.targetId) return false;
      const sourceIds = new Set(sources.map((item) => item.id));
      const sourceRefs = [...(object.evidenceRefs || object.sourceRefs || []), ...(object.originalSourceRefs || []), ...(object.properties || []).flatMap((property) => property.evidenceRefs)];
      if (sourceRefs.some((id) => !sourceIds.has(id))) return false;
    }
    const contextSources = new Set([...correction.suggestedEvidence, ...correction.previousEvidence, ...correction.correctedEvidence].map((item) => item.id));
    if (correction.context.entities.some((entity) => [...entity.evidenceRefs, ...entity.properties.flatMap((property) => property.evidenceRefs)].some((id) => !contextSources.has(id)))) return false;
  }
  return model.requirements.every((item) => known(item.sourceRefs) && known(item.originalSourceRefs || []) && propertiesValid(item.properties) && item.relatedEntityIds.every((id) => entities.has(id)) && item.relatedRelationIds.every((id) => relations.has(id)) && (item.relatedPropertyRefs || []).every((ref) => entities.get(ref.entityId)?.properties.some((property) => property.key === ref.propertyKey)));
}
