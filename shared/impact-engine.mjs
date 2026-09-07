import { changeSchema, matchesSchema, validateEngineeringSystem } from "./engineering-schema.mjs";

const UNITS = {
  A: ["current", 1, "A"], mA: ["current", 0.001, "A"], uA: ["current", 0.000001, "A"], "µA": ["current", 0.000001, "A"],
  V: ["voltage", 1, "V"], mV: ["voltage", 0.001, "V"],
  W: ["power", 1, "W"], mW: ["power", 0.001, "W"], kW: ["power", 1000, "W"],
  g: ["mass", 1, "g"], kg: ["mass", 1000, "g"], mg: ["mass", 0.001, "g"],
  min: ["time", 1, "min"], h: ["time", 60, "min"], s: ["time", 1 / 60, "min"],
  Wh: ["energy", 1, "Wh"], mWh: ["energy", 0.001, "Wh"], kWh: ["energy", 1000, "Wh"], J: ["energy", 1 / 3600, "Wh"]
};
const unique = (items) => [...new Set(items)];
const tidy = (value) => Math.round(value * 1e9) / 1e9;
const key = (value) => value.replace(/([a-z])([A-Z])/gu, "$1_$2").toLowerCase().replace(/[ -]+/gu, "_");
export function normalizeQuantity(value, unit) {
  const definition = UNITS[unit];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && definition ? { value: tidy(value * definition[1]), dimension: definition[0], unit: definition[2] } : null;
}

/** Causal directions follow relation meaning, never visual position or graph proximity. */
export function impactEdges(model) {
  const edges = [];
  for (const relation of model.relations) {
    if (["contains", "unknown"].includes(relation.kind)) continue;
    const add = (from, to) => edges.push({ from, to, id: relation.id, source: relation.source, evidenceRefs: relation.evidenceRefs });
    if (["depends_on", "requires", "derived_from", "consumes", "mounted_on"].includes(relation.kind)) add(relation.to, relation.from);
    else if (["powers", "connects_to", "communicates_with", "thermal_coupling"].includes(relation.kind)) { add(relation.from, relation.to); add(relation.to, relation.from); }
    else add(relation.from, relation.to);
  }
  for (const requirement of model.requirements) {
    const related = unique([...requirement.relatedEntityIds, ...model.relations.filter((relation) => requirement.relatedRelationIds.includes(relation.id)).flatMap((relation) => [relation.from, relation.to])]);
    for (const entityId of related) edges.push({ from: entityId, to: requirement.id, id: `trace:${requirement.id}:${entityId}`, source: "documented", evidenceRefs: requirement.sourceRefs });
  }
  return edges;
}

function reachable(model, targetId) {
  const edges = impactEdges(model);
  // A changed requirement starts at the objects that are explicitly traced to it.
  if (model.requirements.some((item) => item.id === targetId)) edges.push(...edges.filter((edge) => edge.to === targetId).map((edge) => ({ ...edge, from: edge.to, to: edge.from })));
  const paths = new Map([[targetId, { path: [targetId], edges: [] }]]);
  const queue = [targetId];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const edge of edges.filter((item) => item.from === current)) {
      if (paths.has(edge.to)) continue;
      const previous = paths.get(current);
      paths.set(edge.to, { path: [...previous.path, edge.to], edges: [...previous.edges, edge] });
      queue.push(edge.to);
    }
  }
  return paths;
}

export function analyzeImpact(model, change, language = "en") {
  if (!validateEngineeringSystem(model) || !matchesSchema(change, changeSchema)) throw new Error("Invalid engineering model or change.");
  const originals = [...model.entities, ...model.requirements];
  const baselineTarget = originals.find((item) => item.id === change.targetEntityId);
  if (!baselineTarget) throw new Error("The changed object must exist in the baseline.");
  if ((change.kind === "requirement") !== model.requirements.some((item) => item.id === change.targetEntityId)) throw new Error("Change kind does not match its target.");
  if (change.kind === "replace_component" && baselineTarget.kind !== "component") throw new Error("Only a component may be replaced.");
  if (new Set(change.newValues.map((item) => item.key)).size !== change.newValues.length) throw new Error("Duplicate changed properties.");
  const createdAt = new Date().toISOString();
  const pt = language === "pt";
  const evidence = structuredClone(model.evidence);
  const changedValues = change.newValues.map((property, index) => {
    const evidenceId = `change:${change.id}:${index}`;
    evidence.push({ id: evidenceId, artifactId: change.id, artifactLabel: pt ? "Hipótese do cenário" : "Scenario assumption", excerpt: `${property.name}: ${property.value} ${property.unit || ""}`.trim(), kind: "user" });
    return { ...property, source: "user", evidenceRefs: [evidenceId] };
  });
  const evidenceById = new Map(evidence.map((item) => [item.id, item]));
  const objects = new Map(originals.map((item) => [item.id, structuredClone(item)]));
  const target = objects.get(change.targetEntityId);
  // Replacement characteristics are unknown unless the scenario supplies them.
  target.properties = change.kind === "replace_component" ? changedValues : [...target.properties.filter((property) => !changedValues.some((next) => next.key === property.key)), ...changedValues];
  if (changedValues.some((property) => /current|voltage/u.test(key(property.key)))) target.properties = target.properties.filter((property) => !["operating_power", "power", "required_power"].includes(key(property.key)) || changedValues.some((next) => next.key === property.key));
  if (change.replacementName) target.name = change.replacementName;
  const paths = reachable(model, target.id);
  const changedDimensions = new Set(change.newValues.flatMap((property) => {
    const propertyKey = key(property.key);
    return ["current", "voltage", "power", "mass", "autonomy", "energy"].filter((dimension) => propertyKey.includes(dimension));
  }));
  const relevantElectrical = (dimension) => change.kind === "replace_component" || changedDimensions.has(dimension);

  const evidenceValid = (refs) => refs.length > 0 && refs.every((ref) => ["fact", "user", "calculation"].includes(evidenceById.get(ref)?.kind));
  const find = (object, keys) => object?.properties.find((property) => keys.includes(key(property.key)));
  function input(object, keys, dimension) {
    const property = find(object, keys);
    const quantity = property && normalizeQuantity(property.value, property.unit);
    if (!quantity || quantity.dimension !== dimension || !["documented", "calculated", "user"].includes(property.source) || !evidenceValid(property.evidenceRefs)) return null;
    return { entityId: object.id, propertyKey: property.key, value: quantity.value, unit: quantity.unit, evidenceRefs: property.evidenceRefs };
  }
  const calculations = [];
  const results = new Map();
  function calculate(object, ruleId, inputs, value, unit, expression) {
    const calculation = { ruleId, inputs, expression, result: value, ...(unit ? { unit } : {}), evidenceRefs: unique(inputs.flatMap((item) => item.evidenceRefs)) };
    calculations.push(calculation);
    results.set(object.id, calculation);
    return calculation;
  }
  // A formula is only evaluated when the baseline explicitly declares it and its inputs.
  const formulaEntities = model.entities.filter((item) => paths.has(item.id) && find(item, ["formula"]));
  for (let pass = 0; pass < formulaEntities.length; pass += 1) {
    for (const original of formulaEntities) {
      const object = objects.get(original.id);
      if (results.has(object.id)) continue;
      const formulaProperty = find(object, ["formula"]);
      if (!evidenceValid(formulaProperty.evidenceRefs) || formulaProperty.source === "inferred") continue;
      const dependencies = model.relations.filter((relation) => (relation.to === object.id && relation.kind === "contributes_to") || (relation.from === object.id && ["derived_from", "depends_on"].includes(relation.kind)));
      if (!dependencies.length || dependencies.some((relation) => relation.source === "inferred" || !evidenceValid(relation.evidenceRefs))) continue;
      const dependenciesReady = dependencies.every((relation) => { const id = relation.from === object.id ? relation.to : relation.from; return !formulaEntities.some((item) => item.id === id) || results.has(id); });
      if (!dependenciesReady) continue;
      const sources = dependencies.map((relation) => objects.get(relation.from === object.id ? relation.to : relation.from));
      const formula = formulaProperty.value;
      let inputs;
      let result;
      let resultKey;
      let unit;
      if (formula === "sum_power" || formula === "sum_mass") {
        const mass = formula === "sum_mass";
        inputs = sources.map((source) => input(source, mass ? ["mass", "total_mass"] : ["operating_power", "required_power", "power", "total_power"], mass ? "mass" : "power"));
        if (inputs.some((item) => !item)) continue;
        result = tidy(inputs.reduce((total, item) => total + item.value, 0));
        resultKey = mass ? "total_mass" : "total_power";
        unit = mass ? "g" : "W";
      } else if (formula === "energy_over_power") {
        const energies = sources.map((source) => input(source, ["available_energy", "energy"], "energy")).filter(Boolean);
        const powers = sources.map((source) => input(source, ["total_power", "required_power", "power"], "power")).filter(Boolean);
        if (energies.length !== 1 || powers.length !== 1 || powers[0].value <= 0 || sources.length !== 2) continue;
        inputs = [energies[0], powers[0]];
        result = tidy(energies[0].value / powers[0].value * 60);
        resultKey = "estimated_autonomy";
        unit = "min";
      } else continue;
      const calc = calculate(object, formula, inputs, result, unit, formula === "energy_over_power" ? `${inputs[0].value} Wh / ${inputs[1].value} W × 60 = ${result} min` : `${inputs.map((item) => `${item.value} ${item.unit}`).join(" + ")} = ${result} ${unit}`);
      calc.evidenceRefs = unique([...calc.evidenceRefs, ...formulaProperty.evidenceRefs, ...dependencies.flatMap((relation) => relation.evidenceRefs)]);
      object.properties = [...object.properties.filter((property) => key(property.key) !== resultKey), { key: resultKey, name: resultKey, value: result, unit, source: "calculated", evidenceRefs: calc.evidenceRefs }];
    }
  }
  function comparison(object, actual, limit, ruleId, minimum = false) {
    const failed = minimum ? actual.value < limit.value : actual.value > limit.value;
    const calculation = calculate(object, ruleId, [actual, limit], failed, undefined, `${actual.value} ${actual.unit} ${failed ? (minimum ? "<" : ">") : (minimum ? "≥" : "≤")} ${limit.value} ${limit.unit}`);
    return { status: failed ? "critical" : "valid", calculation, reasonCode: ruleId, shortExplanation: calculation.expression };
  }
  const impacts = originals.map((original) => {
    const object = objects.get(original.id);
    const route = paths.get(object.id);
    let outcome = { status: route ? "review" : "unaffected", reasonCode: route ? "missing_data" : "no_dependency", shortExplanation: route ? (pt ? "Dependência identificada; faltam dados para verificar a compatibilidade." : "Dependency identified; more data is needed to verify compatibility.") : (pt ? "Sem dependência relevante neste cenário." : "No relevant dependency in this scenario.") };
    const checks = [];
    if (route) {
      // Evaluate electrical limits only across explicit supply interfaces.
      for (const relation of model.relations.filter((item) => item.kind === "powers" && (item.from === object.id || item.to === object.id))) {
        const supplier = objects.get(relation.from);
        const consumer = objects.get(relation.to);
        if (!paths.has(consumer.id) || !paths.has(supplier.id)) continue;
        for (const [dimension, requiredKeys, availableKeys] of [["current", ["required_current", "peak_current", "current"], ["available_current", "maximum_current", "max_current"]], ["power", ["required_power", "operating_power", "power"], ["available_power", "maximum_power", "max_power"]]]) {
          if (!relevantElectrical(dimension)) continue;
          const required = input(consumer, requiredKeys, dimension);
          const available = input(supplier, availableKeys, dimension);
          if (required && available && relation.source !== "inferred" && evidenceValid(relation.evidenceRefs)) checks.push(comparison(object, required, available, `required_${dimension}_within_available`));
        }
        const voltage = input(supplier, ["output_voltage", "voltage"], "voltage");
        const minimum = input(consumer, ["minimum_voltage", "min_voltage"], "voltage");
        const maximum = input(consumer, ["maximum_voltage", "max_voltage"], "voltage");
        if (relevantElectrical("voltage") && voltage && minimum && maximum && relation.source !== "inferred" && evidenceValid(relation.evidenceRefs)) {
          const failed = voltage.value < minimum.value || voltage.value > maximum.value;
          const calc = calculate(object, "voltage_in_supported_range", [voltage, minimum, maximum], failed, undefined, `${voltage.value} V ${failed ? "∉" : "∈"} [${minimum.value}, ${maximum.value}] V`);
          checks.push({ status: failed ? "critical" : "valid", calculation: calc, reasonCode: calc.ruleId, shortExplanation: calc.expression });
        }
      }
      if (model.requirements.some((item) => item.id === object.id)) {
        for (const entityId of unique([...object.relatedEntityIds, ...(object.relatedPropertyRefs || []).map((ref) => ref.entityId)])) {
          const related = objects.get(entityId);
          for (const [dimension, measuredKeys, limitKeys, minimum] of [["time", ["estimated_autonomy", "autonomy"], ["minimum_autonomy", "min_autonomy"], true], ["mass", ["total_mass", "mass"], ["maximum_mass", "max_mass"], false], ["power", ["total_power", "power"], ["maximum_power", "max_power"], false]]) {
            // Changed dependencies invalidate a cached performance value without a formula.
            const stale = change.kind !== "requirement" && paths.has(related.id) && related.id !== target.id && ["calculation", "performance"].includes(related.kind) && !results.has(related.id);
            const actual = !stale && input(related, measuredKeys, dimension);
            const limit = input(object, limitKeys, dimension);
            if (actual && limit && evidenceValid(object.sourceRefs)) checks.push(comparison(object, actual, limit, `${dimension}_requirement`, minimum));
          }
        }
      }
      if (change.kind === "requirement" && object.id !== target.id && unique([...target.relatedEntityIds, ...(target.relatedPropertyRefs || []).map((ref) => ref.entityId)]).includes(object.id)) {
        for (const [dimension, measuredKeys, limitKeys, minimum] of [["time", ["estimated_autonomy", "autonomy"], ["minimum_autonomy", "min_autonomy"], true], ["mass", ["total_mass", "mass"], ["maximum_mass", "max_mass"], false], ["power", ["total_power", "power"], ["maximum_power", "max_power"], false]]) {
          const actual = input(object, measuredKeys, dimension);
          const limit = input(target, limitKeys, dimension);
          if (actual && limit && evidenceValid(target.sourceRefs)) checks.push(comparison(object, actual, limit, `${dimension}_requirement`, minimum));
        }
      }
      const mass = input(object, ["mass", "total_mass"], "mass");
      const massLimit = input(object, ["maximum_mass", "max_mass"], "mass");
      if (mass && massLimit) checks.push(comparison(object, mass, massLimit, "mass_within_limit"));
      if (checks.length) outcome = checks.find((item) => item.status === "critical") || checks[0];
      else if (results.has(object.id)) {
        const calculation = results.get(object.id);
        outcome = { status: "valid", reasonCode: calculation.ruleId, shortExplanation: calculation.expression, calculation };
      }
      // Missing or inferred causal premises cannot produce a deterministic compatibility verdict.
      if (["critical", "valid"].includes(outcome.status) && route.edges.some((edge) => edge.source === "inferred" || !evidenceValid(edge.evidenceRefs))) outcome = { status: "review", reasonCode: "unverified_dependency", shortExplanation: pt ? "O caminho depende de uma relação ainda não comprovada." : "The impact path depends on an unverified relationship." };
      if (object.id === target.id) outcome = { ...outcome, status: "changed", reasonCode: "scenario_change", shortExplanation: change.description || (pt ? "Alteração proposta; o sistema atual foi preservado." : "Proposed change; the baseline is preserved.") };
      if (outcome.status === "review" && route.edges.some((edge) => model.relations.find((item) => item.id === edge.id)?.kind === "thermal_coupling")) outcome = { ...outcome, reasonCode: "thermal_model_missing", shortExplanation: pt ? "Modelo térmico e dissipação são necessários para avaliar esta dependência." : "Thermal model and dissipation data are needed to evaluate this dependency." };
    }
    const traversedRelationIds = route?.edges.map((edge) => edge.id) || [];
    const evidenceRefs = unique([...(outcome.calculation?.evidenceRefs || []), ...(route?.edges.flatMap((edge) => edge.evidenceRefs) || []), ...(object.evidenceRefs || object.sourceRefs || []), ...(object.id === target.id ? changedValues.flatMap((item) => item.evidenceRefs) : [])]);
    const inference = outcome.status === "review" && route?.edges.some((edge) => edge.source === "inferred") && evidenceRefs.length > 0;
    const confidence = outcome.calculation ? 1 : inference ? Math.min(0.65, ...model.relations.filter((item) => traversedRelationIds.includes(item.id)).map((item) => item.confidence)) : outcome.status === "changed" ? 1 : 0;
    const reasoning = { type: outcome.calculation ? "calculation" : inference ? "inference" : outcome.status === "changed" ? "fact" : "unknown", sourceRefs: evidenceRefs, inputFacts: outcome.calculation?.inputs || [], traversedRelationIds, ...(outcome.calculation ? { ruleId: outcome.calculation.ruleId, calculation: outcome.calculation } : {}), shortExplanation: outcome.shortExplanation, confidence, ...(inference && model.model ? { model: model.model } : {}), createdAt };
    return { entityId: object.id, ...outcome, path: route?.path || [], traversedRelationIds, evidenceRefs, reasoning, confidence };
  });
  const relevant = impacts.filter((impact) => !["unaffected", "changed"].includes(impact.status));
  return { id: `analysis:${change.id}`, changeId: change.id, changedEntityId: target.id, change: { ...structuredClone(change), newValues: changedValues }, impacts, calculations, evidence, unresolvedQuestions: impacts.filter((item) => item.status === "review").map((item) => `${objects.get(item.entityId).name || objects.get(item.entityId).title}: ${item.shortExplanation}`), createdAt, metrics: { impacted: relevant.length, critical: relevant.filter((item) => item.status === "critical").length, review: relevant.filter((item) => item.status === "review").length, evidenced: relevant.filter((item) => item.evidenceRefs.length > 0).length, inferred: relevant.filter((item) => item.reasoning.type === "inference").length } };
}
