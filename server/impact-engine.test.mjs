import assert from "node:assert/strict";
import test from "node:test";
import { analyzeImpact, impactEdges, normalizeQuantity } from "../shared/impact-engine.mjs";
import { validateEngineeringSystem } from "../shared/engineering-schema.mjs";
import { createEngineeringValidationModel, validationChange } from "../examples/engineering-validation.mjs";

const impact = (result, id) => result.impacts.find((item) => item.entityId === id);
test("1.2 A against 800 mA produces an auditable critical and preserves baseline", () => {
  const model = createEngineeringValidationModel();
  const original = JSON.stringify(model);
  const result = analyzeImpact(model, validationChange());
  const regulator = impact(result, "regulator");
  assert.equal(regulator.status, "critical");
  assert.equal(regulator.calculation.expression, "1.2 A > 0.8 A");
  assert.deepEqual(regulator.path, ["radio", "regulator"]);
  assert.deepEqual(regulator.traversedRelationIds, ["regulator-radio"]);
  assert.equal(JSON.stringify(model), original);
  for (const item of result.impacts.filter((item) => item.status === "critical")) {
    assert.ok(item.calculation.ruleId);
    assert.ok(item.calculation.inputs.every((input) => input.evidenceRefs.length > 0 && input.evidenceRefs.every((ref) => result.evidence.some((evidence) => evidence.id === ref))));
    assert.equal(item.reasoning.type, "calculation");
  }
});
test("600 mA remains compatible with an 800 mA regulator", () => {
  assert.equal(impact(analyzeImpact(createEngineeringValidationModel(), validationChange("peak_current", 600, "mA")), "regulator").status, "valid");
});
test("explicit energy/power formulas recalculate 80 min and fail a 90 min requirement", () => {
  const result = analyzeImpact(createEngineeringValidationModel(), validationChange("operating_power", 1, "W"));
  assert.equal(impact(result, "autonomy").calculation.result, 80);
  assert.equal(impact(result, "REQ-07").status, "critical");
  assert.equal(impact(result, "REQ-07").calculation.expression, "80 min < 90 min");
});
test("mass aggregation uses grams and kilograms before checking a requirement", () => {
  const result = analyzeImpact(createEngineeringValidationModel(), validationChange("mass", 0.28, "kg", "payload"));
  assert.equal(impact(result, "total-mass").calculation.result, 380);
  assert.equal(impact(result, "REQ-01").status, "critical");
  assert.equal(impact(result, "radio").status, "unaffected");
});
test("thermal coupling without a thermal model is review, never invented critical", () => {
  const thermal = impact(analyzeImpact(createEngineeringValidationModel(), validationChange()), "thermal");
  assert.equal(thermal.status, "review");
  assert.equal(thermal.reasonCode, "thermal_model_missing");
});
test("unknown units and missing baseline source facts cannot justify critical", () => {
  const model = createEngineeringValidationModel();
  model.entities.find((item) => item.id === "regulator").properties[0].evidenceRefs = [];
  assert.equal(impact(analyzeImpact(model, validationChange()), "regulator").status, "review");
  assert.equal(impact(analyzeImpact(createEngineeringValidationModel(), validationChange("peak_current", 1.2, "bananas")), "regulator").status, "review");
  assert.equal(normalizeQuantity(1, "Ah"), null);
});
test("inferred relations retain supporting evidence and confidence, never claim critical", () => {
  const model = createEngineeringValidationModel();
  model.relations[0].source = "inferred";
  model.relations[0].confidence = 0.6;
  model.model = "fixture-inference-model";
  const result = impact(analyzeImpact(model, validationChange()), "regulator");
  assert.equal(result.status, "review");
  assert.equal(result.reasoning.type, "inference");
  assert.ok(result.reasoning.sourceRefs.length);
  assert.ok(result.reasoning.shortExplanation);
  assert.equal(result.reasoning.model, model.model);
  assert.equal(result.confidence, 0.6);
});
test("source reference validation rejects dangling evidence, entities, duplicate IDs and cycles", () => {
  for (const mutate of [
    (model) => { model.entities[0].evidenceRefs = ["missing"]; },
    (model) => { model.relations[0].to = "missing"; },
    (model) => { model.entities[1].id = model.entities[0].id; },
    (model) => { model.entities[0].parentId = "radio"; },
    (model) => { model.entities[0].kind = "requirement"; }
  ]) {
    const model = createEngineeringValidationModel(); mutate(model); assert.equal(validateEngineeringSystem(model), false);
  }
});
test("containment is not a causal dependency and derived_from flows input to calculation", () => {
  const model = createEngineeringValidationModel();
  model.relations.push({ id: "contains", from: "system", to: "radio", kind: "contains", label: "contains", source: "documented", evidenceRefs: ["architecture"], confidence: 1 });
  assert.equal(impactEdges(model).some((edge) => edge.id === "contains"), false);
  assert.ok(impactEdges(model).some((edge) => edge.from === "power-budget" && edge.to === "autonomy"));
  assert.equal(impactEdges(model).some((edge) => edge.from === "autonomy" && edge.to === "power-budget"), false);
});
test("current changes invalidate stale mean-power and autonomy estimates", () => {
  const result = analyzeImpact(createEngineeringValidationModel(), validationChange());
  assert.equal(impact(result, "power-budget").status, "review");
  assert.equal(impact(result, "autonomy").status, "review");
  assert.equal(impact(result, "REQ-07").status, "review");
});
test("component replacement cannot silently reuse the previous component's specifications", () => {
  const change = { ...validationChange(), kind: "replace_component", newValues: [], replacementName: "Unknown candidate" };
  const result = analyzeImpact(createEngineeringValidationModel(), change);
  assert.equal(impact(result, "regulator").status, "review");
});
test("a stricter autonomy requirement evaluates its explicitly traced performance", () => {
  const model = createEngineeringValidationModel();
  model.evidence.push({ id: "measured-autonomy", artifactId: "validation-memory", artifactLabel: "Explicit engineering validation fixture", excerpt: "Verified autonomy is 100 min.", kind: "fact" });
  model.entities.find((item) => item.id === "autonomy").properties = [{ key: "estimated_autonomy", name: "Verified autonomy", value: 100, unit: "min", source: "documented", evidenceRefs: ["measured-autonomy"] }];
  const requirement = model.requirements.find((item) => item.id === "REQ-07");
  const change = { id: "requirement-change", targetEntityId: requirement.id, kind: "requirement", oldValues: requirement.properties, newValues: [{ key: "minimum_autonomy", name: "Minimum autonomy", value: 120, unit: "min", source: "user", evidenceRefs: [] }], description: "Require 120 min instead of 90 min", createdAt: "2026-01-01T00:00:00.000Z" };
  const result = analyzeImpact(model, change);
  assert.equal(impact(result, "autonomy").status, "critical");
  assert.equal(impact(result, "autonomy").calculation.expression, "100 min < 120 min");
  assert.equal(impact(result, requirement.id).status, "changed");
  assert.equal(impact(result, requirement.id).calculation.expression, "100 min < 120 min");
});
