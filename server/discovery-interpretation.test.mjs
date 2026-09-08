import assert from "node:assert/strict";
import test from "node:test";
import { createEngineeringValidationModel } from "../examples/engineering-validation.mjs";
import { interpretationPrompt, resolveInterpretation } from "./discovery-interpretation.mjs";
import { createSystemAiService } from "./system-ai.mjs";

const model = createEngineeringValidationModel();
const output = (update = {}) => ({ kind: "parameter", targetId: "radio", replacementName: "", question: "", summary: "Radio current becomes 1.2 A", updates: [{ propertyKey: "peak_current", operation: "set", value: 1.2, unit: "A", quote: "radio 1.2 A", ...update }] });
test("AI interpretation is a grounded temporary change, not a baseline edit", () => {
  const before = structuredClone(model);
  const result = resolveInterpretation(model, "What if radio 1.2 A?", output());
  assert.equal(result.status, "resolved");
  assert.equal(result.change.targetEntityId, "radio");
  assert.deepEqual(result.change.newValues[0], { ...model.entities.find((item) => item.id === "radio").properties[0], value: 1.2, unit: "A", source: "user", evidenceRefs: [] });
  assert.deepEqual(model, before);
});
test("relative quantities are computed with unit conversion and dimensionless scaling", () => {
  const added = resolveInterpretation(model, "raise radio by 0.2 A", output({ operation: "add", value: .2, quote: "by 0.2 A" }));
  assert.equal(added.change.newValues[0].value, 600);
  assert.equal(added.change.newValues[0].unit, "mA");
  const doubled = resolveInterpretation(model, "double the radio current", output({ operation: "scale", value: 2, unit: "1", quote: "double" }));
  assert.equal(doubled.change.newValues[0].value, 800);
  const reduced = resolveInterpretation(model, "reduce radio by 10%", output({ operation: "scale", value: .9, unit: "1", quote: "reduce radio by 10%" }));
  assert.equal(reduced.change.newValues[0].value, 360);
});
test("unknown targets, invented operands, wrong dimensions and duplicate updates need clarification", () => {
  for (const candidate of [
    { ...output(), targetId: "invented" }, output({ propertyKey: "invented" }), output({ quote: "invented quote" }), output({ unit: "kg" }), output({ operation: "scale", unit: "A" }),
    { ...output(), updates: [...output().updates, ...output().updates] }, output({ value: Infinity }), output({ value: 400, unit: "mA" }), { ...output(), updates: [] }
  ]) assert.equal(resolveInterpretation(model, "radio 1.2 A", candidate).status, "clarification");
});
test("replacement keeps unknown characteristics unknown, and requirements are legitimate targets", () => {
  const replacement = { ...output(), kind: "replace_component", updates: [], replacementName: "QX7" };
  const result = resolveInterpretation(model, "replace radio with QX7", replacement);
  assert.equal(result.change.kind, "replace_component");
  assert.deepEqual(result.change.newValues, []);
  assert.equal(resolveInterpretation(model, "replace radio", replacement).status, "clarification");
  const requirement = model.requirements[0];
  const request = { ...output(), kind: "requirement", targetId: requirement.id, updates: [{ propertyKey: requirement.properties[0].key, operation: "set", value: 120, unit: "min", quote: "120 min" }] };
  assert.equal(resolveInterpretation(model, "require 120 min", request).change.kind, "requirement");
});
test("vague ideas receive one question, while the prompt excludes evidence documents and canvas coordinates", () => {
  const vague = { ...output(), kind: "clarification", question: "What would change in the radio?", updates: [] };
  assert.deepEqual(resolveInterpretation(model, "better radio", vague), { status: "clarification", question: vague.question });
  const prompt = interpretationPrompt(model, "better radio", "en");
  assert.match(prompt, /untrusted data/);
  assert.match(prompt, /current architecture/);
  assert.doesNotMatch(prompt, /artifactLabel|evidenceRefs|baseline|scenarios|canvas-private/);
});
test("the configured AI receives free text and the current target inventory", async () => {
  let calls = 0;
  const service = createSystemAiService({ apiKey: "synthetic-test-key", fetch: async (url, options) => {
    calls++;
    assert.match(url, /^https:\/\/generativelanguage.googleapis.com\//);
    const request = JSON.parse(options.body);
    assert.match(request.contents[0].parts[0].text, /radio 1.2 A/);
    assert.match(request.contents[0].parts[0].text, /peak_current/);
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(output()) }] } }] }), { status: 200 });
  } });
  assert.equal((await service.interpret(model, "radio 1.2 A")).status, "resolved");
  assert.equal(calls, 1);
});
test("provider failure remains recoverable instead of guessing a change", async () => {
  let requests = 0;
  const service = createSystemAiService({ apiKey: "synthetic-test-key", fetch: async () => { requests++; return new Response("{}", { status: 503 }); } });
  await assert.rejects(service.interpret(model, "radio 1.2 A"), { code: "SYSTEM_AI_UNAVAILABLE" });
  assert.equal(requests, 1);
});
