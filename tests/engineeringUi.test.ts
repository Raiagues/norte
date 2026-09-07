import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuthProvider } from "../src/lib/auth";
import type { EngineeringEntity, EngineeringSystemModel } from "../src/lib/engineeringSystem";
import { correctEngineeringEntity, correctEngineeringRequirement, editEngineeringRequirement, engineeringInitialScale, filterEngineeringRequirements, layoutEngineeringGraph, projectEngineeringScenario, removeEngineeringRelation, requirementTrace, systemVisibleEntities } from "../src/lib/engineeringUi";
import { createEmptyProject } from "../src/lib/projectStore";
import { SystemWorkspace, EngineeringScenario, EngineeringWhatIf } from "../src/pages/SystemWorkspace";
import { EngineeringEntityInfo, EngineeringRequirements } from "../src/components/EngineeringDetails";
import { analyzeImpact } from "../src/lib/impactEngine";
import { createEngineeringValidationModel, validationChange } from "../examples/engineering-validation.mjs";

const entity = (id: string, kind: EngineeringEntity["kind"], parentId?: string): EngineeringEntity => ({ id, name: id, kind, ...(parentId ? { parentId } : {}), description: "", properties: [], source: "documented", confidence: 1, evidenceRefs: ["datasheet"] });
const model: EngineeringSystemModel = {
  schemaVersion: 1, id: "model", name: "Validation system", generatedAt: "2026-09-08T00:00:00Z", generatedFromRevision: 1,
  entities: [entity("system", "system"), entity("power", "subsystem", "system"), entity("communications", "subsystem", "system"), entity("regulator", "component", "power"), { ...entity("radio", "component", "communications"), properties: [{ key: "peak_current", name: "Peak current", value: .5, unit: "A", source: "documented", evidenceRefs: ["datasheet"] }] }],
  relations: [{ id: "supply", from: "regulator", to: "radio", kind: "powers", label: "", source: "documented", confidence: 1, evidenceRefs: ["datasheet"] }, { id: "radio-parent", from: "communications", to: "radio", kind: "contains", label: "", source: "documented", confidence: 1, evidenceRefs: ["datasheet"] }],
  requirements: [
    { id: "req-duration", title: "REQ-07", statement: "Autonomy at least 90 minutes", subsystemTags: ["Power"], reviewTags: ["CDR"], category: "Performance", status: "unreviewed", sourceRefs: ["datasheet"], relatedEntityIds: ["radio"], relatedRelationIds: ["supply"], properties: [] },
    { id: "req-mass", title: "REQ-01", statement: "Mass at most 400 g", subsystemTags: ["Structure"], reviewTags: ["PDR"], category: "Physical", status: "verified", sourceRefs: ["specification"], relatedEntityIds: ["system"], relatedRelationIds: [], properties: [] }
  ],
  evidence: [{ id: "datasheet", artifactId: "file", artifactLabel: "Radio datasheet", kind: "fact", excerpt: "Peak current: 0.5 A", locator: "Line 3" }, { id: "specification", artifactId: "spec", artifactLabel: "Specification", kind: "fact", excerpt: "Mass at most 400 g" }],
  artifactSources: []
};
const noop = () => undefined;
function render(child: ReturnType<typeof createElement>) { return renderToStaticMarkup(createElement(AuthProvider, { children: child })); }

describe("engineering architecture and traceability", () => {
  it("starts mobile graphs at a readable scale while keeping deliberate fit and desktop overview available", () => {
    const dimensions = { width: 1280, height: 450 };
    expect(engineeringInitialScale({ width: 316, height: 620 }, dimensions)).toBe(.72);
    expect(engineeringInitialScale({ width: 316, height: 620 }, dimensions, true)).toBeLessThan(.3);
    expect(engineeringInitialScale({ width: 1320, height: 740 }, dimensions)).toBe(engineeringInitialScale({ width: 1320, height: 740 }, dimensions, true));
  });
  it("keeps the macro view small and requirements outside every graph level", () => {
    expect(systemVisibleEntities(model, null).map((item) => item.id)).toEqual(["system", "power", "communications"]);
    expect(systemVisibleEntities(model, "communications").map((item) => item.id)).toEqual(["communications", "radio"]);
    const withLegacyRequirement = { ...model, entities: [...model.entities, { ...entity("req", "parameter"), kind: "requirement" } as unknown as EngineeringEntity] };
    expect(systemVisibleEntities(withLegacyRequirement, null, new Set(["radio", "req"])).map((item) => item.id)).toEqual(["radio"]);
  });

  it("lays out real relations without mutating the baseline or inventing impact relations from containment", () => {
    const original = JSON.stringify(model);
    const visible = systemVisibleEntities(model, "communications");
    const graph = layoutEngineeringGraph(model, visible);
    expect(graph.nodes.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y))).toBe(true);
    expect(graph.nodes.find((item) => item.entity.id === "radio")!.y).toBeGreaterThan(graph.nodes.find((item) => item.entity.id === "communications")!.y);
    expect(graph.edges.map((edge) => edge.relation.id)).toEqual(["radio-parent"]);
    expect(JSON.stringify(model)).toBe(original);
  });

  it("combines search and metadata facets and traces exact requirement relationships", () => {
    expect(filterEngineeringRequirements(model.requirements, { query: "autonomy", tag: "CDR", status: "unreviewed", source: "datasheet" }).map((item) => item.id)).toEqual(["req-duration"]);
    expect(filterEngineeringRequirements(model.requirements, { tag: "Power", status: "verified" })).toEqual([]);
    expect(filterEngineeringRequirements(model.requirements, { query: "structure" }).map((item) => item.id)).toEqual(["req-mass"]);
    const traced = requirementTrace(model, model.requirements[0]);
    expect([...traced.entities].sort()).toEqual(["radio", "regulator"]);
    expect([...traced.relations]).toEqual(["supply"]);
  });

  it("removes invalid relation trace references when the team removes a relationship, preserving source evidence", () => {
    const corrected = removeEngineeringRelation(model, "supply");
    expect(corrected.relations.some((relation) => relation.id === "supply")).toBe(false);
    expect(corrected.requirements[0].relatedRelationIds).toEqual([]);
    expect(corrected.requirements[0].sourceRefs).toEqual(["datasheet"]);
    expect(corrected.evidence).toEqual(model.evidence);
  });

  it("preserves original requirement text and provenance through successive corrections", () => {
    const requirement = model.requirements[0];
    const corrected = editEngineeringRequirement(requirement, { statement: "Autonomy at least 120 minutes", reviewTags: [" CDR ", ""] });
    const correctedAgain = editEngineeringRequirement(corrected, { status: "accepted" });
    expect(correctedAgain.originalStatement).toBe(requirement.statement);
    expect(correctedAgain.sourceRefs).toEqual(requirement.sourceRefs);
    expect(correctedAgain.originalSourceRefs).toEqual(requirement.sourceRefs);
    expect(correctedAgain.reviewTags).toEqual(["CDR"]);
    expect(model.requirements[0].statement).toBe(requirement.statement);
  });

  it("preserves original requirement sources while correcting quantitative values with explicit team provenance", () => {
    const baseline = createEngineeringValidationModel();
    const requirement = baseline.requirements[0];
    const corrected = correctEngineeringRequirement(baseline, requirement, { ...requirement, statement: "Autonomy ≥ 120 min", sourceRefs: [], properties: requirement.properties.map((property) => ({ ...property, value: 120 })) });
    const changed = corrected.requirements[0];
    expect(changed.originalSourceRefs).toEqual(requirement.sourceRefs);
    expect(changed.sourceRefs).toEqual([]);
    expect(changed.properties[0].source).toBe("user");
    expect(corrected.evidence.find((item) => item.id === changed.properties[0].evidenceRefs[0])?.kind).toBe("user");
  });

  it("projects scenario values into node information, clears unknown replacement characteristics, and exposes calculated outputs", () => {
    const baseline = createEngineeringValidationModel();
    const power = analyzeImpact(baseline, validationChange("operating_power", 2, "W"));
    const projected = projectEngineeringScenario(baseline, power);
    expect(projected.entities.find((item) => item.id === "radio")?.properties.find((property) => property.key === "operating_power")?.value).toBe(2);
    expect(projected.entities.find((item) => item.id === "power-budget")?.properties.find((property) => property.key === "total_power")?.value).toBe(7);
    expect(projected.entities.find((item) => item.id === "autonomy")?.properties.find((property) => property.key === "estimated_autonomy")?.value).toBeCloseTo(68.571, 2);
    const replacement = analyzeImpact(baseline, { ...validationChange(), kind: "replace_component", replacementName: "Radio R2", newValues: [] });
    expect(projectEngineeringScenario(baseline, replacement).entities.find((item) => item.id === "radio")).toMatchObject({ name: "Radio R2", properties: [], source: "user", description: "" });
    const current = analyzeImpact(baseline, validationChange());
    const currentModel = projectEngineeringScenario(baseline, current);
    const radio = currentModel.entities.find((item) => item.id === "radio")!;
    expect(radio.properties.some((property) => property.key === "operating_power")).toBe(false);
    expect(currentModel.evidence.find((item) => item.id === radio.properties.find((property) => property.key === "peak_current")?.evidenceRefs[0])?.kind).toBe("user");
    expect(baseline.entities.find((item) => item.id === "radio")?.properties.find((property) => property.key === "peak_current")?.value).toBe(400);
  });

  it("lays out impacts in causal order while retaining the real supply relationship for inspection", () => {
    const baseline = createEngineeringValidationModel();
    const analysis = analyzeImpact(baseline, validationChange());
    const projected = projectEngineeringScenario(baseline, analysis);
    const relevant = new Set(analysis.impacts.filter((impact) => impact.status !== "unaffected").flatMap((impact) => [impact.entityId, ...impact.path]));
    const graph = layoutEngineeringGraph(projected, systemVisibleEntities(projected, null, relevant), analysis);
    expect(graph.nodes.find((node) => node.entity.id === "radio")!.y).toBeLessThan(graph.nodes.find((node) => node.entity.id === "regulator")!.y);
    expect(graph.edges.find((edge) => edge.relation.id === "regulator-radio")).toMatchObject({ reversed: true, relation: { from: "regulator", to: "radio", kind: "powers" } });
  });

  it("records revised values as team inputs while retaining the original documentary source, and keeps containment consistent", () => {
    const original = model.entities.find((item) => item.id === "radio")!;
    const corrected = correctEngineeringEntity(model, original, { ...original, parentId: "power", properties: original.properties.map((item) => ({ ...item, value: 1.2 })) }, "2026-09-08T01:00:00Z");
    const radio = corrected.entities.find((item) => item.id === "radio")!;
    expect(radio.properties[0].source).toBe("user");
    expect(radio.properties[0].evidenceRefs).not.toContain("datasheet");
    expect(corrected.evidence.find((item) => item.id === radio.properties[0].evidenceRefs[0])).toMatchObject({ kind: "user", excerpt: expect.stringContaining("0.5 A → 1.2 A") });
    expect(radio.evidenceRefs).toContain("datasheet");
    expect(corrected.relations.find((item) => item.kind === "contains" && item.to === "radio")?.from).toBe("power");
    expect(model.entities.find((item) => item.id === "radio")?.properties[0].value).toBe(.5);
  });

  it("keeps correction IDs within persistence bounds even when source IDs and property keys are at their maximum lengths", () => {
    const baseline = createEngineeringValidationModel();
    const original = { ...entity("e".repeat(100), "component", "power"), properties: [{ key: "p".repeat(100), name: "Long-key property", value: 1, source: "documented" as const, evidenceRefs: ["radio"] }], evidenceRefs: ["radio"] };
    const extended = { ...baseline, entities: [...baseline.entities, original] };
    const corrected = correctEngineeringEntity(extended, original, { ...original, parentId: "communication", properties: original.properties.map((property) => ({ ...property, value: 2 })) });
    expect(corrected.evidence.every((evidence) => evidence.id.length <= 140 && evidence.excerpt.length <= 600)).toBe(true);
    expect(corrected.relations.every((relation) => relation.id.length <= 100)).toBe(true);
    expect(() => analyzeImpact(corrected, validationChange())).not.toThrow();
  });
});

describe("calm and explicit engineering controls", () => {
  it("renders a full-width graph with explicit node information and an independent Requirements action", () => {
    const project = { ...createEmptyProject("en"), engineeringSystem: model };
    const html = render(createElement(SystemWorkspace, { language: "en", project, onProjectChange: noop, onBackSetup: noop }));
    expect(html).toContain('aria-label="Information about power"');
    expect(html).toContain("Requirements");
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('data-entity-id="req-duration"');
    expect(html).not.toContain("detail-drawer");
    expect(html).not.toContain("Generate initial architecture");
  });

  it("opens source provenance only inside explicit information and shows requirement filters independently", () => {
    const html = render(createElement(EngineeringEntityInfo, { language: "en", model, entity: model.entities[4], onClose: noop, onRelation: noop }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Documented fact");
    expect(html).toContain("Sources and evidence");
    const requirements = render(createElement(EngineeringRequirements, { language: "en", model, onClose: noop, onTrace: noop, onEdit: noop }));
    expect(requirements).toContain('type="search"');
    expect(requirements).toContain("Filter");
    expect(requirements).toContain("Autonomy at least 90 minutes");
    expect(requirements).not.toContain('class="engineering-graph"');
  });

  it("preselects an engineering hypothesis and uses inline values without change-type/entity select forms", () => {
    const html = render(createElement(EngineeringWhatIf, { language: "en", project: { ...createEmptyProject("en"), engineeringSystem: model }, suggestion: { targetEntityId: "radio", propertyKey: "peak_current", value: 1.2, unit: "A" }, onClose: noop, onAnalyzed: noop }));
    expect(html).toContain("radio");
    expect(html).toContain('value="1.2"');
    expect(html).toContain("See consequences");
    expect(html).not.toContain("<select");
  });

  it("shows only the relevant scenario graph and preserves its baseline", () => {
    const before = JSON.stringify(model);
    const change = { id: "change", targetEntityId: "radio", kind: "parameter" as const, oldValues: model.entities[4].properties, newValues: [{ key: "peak_current", name: "Peak current", value: 1.2, unit: "A", source: "user" as const, evidenceRefs: [] }], description: "Radio current: 0.5 A → 1.2 A", createdAt: "2026-09-08T00:00:00Z" };
    const analysis = analyzeImpact(model, change, "en");
    const html = render(createElement(EngineeringScenario, { language: "en", model, analysis, onClear: noop, onSave: noop }));
    expect(html).toContain("baseline preserved");
    expect(html).toContain("Save scenario");
    expect(html).toContain('data-entity-id="radio"');
    expect(html).not.toContain('data-entity-id="system"');
    expect(html).not.toContain('data-entity-id="req-duration"');
    expect(JSON.stringify(model)).toBe(before);
  });
});
