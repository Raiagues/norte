import type { EngineeringChange, EngineeringSystemModel } from "./engineeringSystem";

export type DiscoveryHypothesis = { targetEntityId: string; propertyKey?: string; value?: number | string; unit?: string; replacementName?: string };
const clean = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const aliases: Record<string, string[]> = {
  mass: ["mass", "massa"], required_current: ["current", "corrente", "consumo"], peak_current: ["current", "corrente", "consumo"],
  required_voltage: ["voltage", "tensao"], voltage: ["voltage", "tensao"], required_power: ["power", "potencia"], power: ["power", "potencia"],
  minimum_autonomy: ["autonomy", "autonomia", "duration", "duracao"], autonomy: ["autonomy", "autonomia"],
  tx_duty_cycle: ["tx", "duty cycle", "duty-cycle", "ciclo de trabalho", "transmissao", "transmit", "transmitting", "transmitter"]
};
const dimensions: Record<string, string[]> = { mass: ["g", "kg", "mg"], current: ["A", "mA"], voltage: ["V", "mV"], power: ["W", "mW", "kW"], time: ["min", "h", "s"], ratio: ["%", "1"] };
function dimension(unit: string): string | undefined { return Object.keys(dimensions).find((key) => dimensions[key].includes(unit)); }

/** Recognition offers an editable proposal; it never asserts a physical dependency. */
export function recognizeEngineeringHypothesis(text: string, model?: EngineeringSystemModel): DiscoveryHypothesis | undefined {
  if (!model) return undefined;
  const normalized = clean(text);
  const candidates = model.entities.filter((entity) => {
    if (entity.kind === "system") return false;
    const terms = [entity.name, ...entity.properties.filter((property) => typeof property.value === "string").map((property) => String(property.value))];
    return terms.some((term) => clean(term).split(/\s+/u).filter((word) => word.length >= 3 || (word.length >= 2 && /\d/u.test(word))).some((word) => normalized.split(/[^\p{L}\p{N}-]+/u).includes(word)));
  });
  if (candidates.filter((entity) => entity.kind === "component").length > 1) return undefined;
  if (/\b(?:by|em)\s+\d+(?:[.,]\d+)?\s*%/u.test(normalized)) return undefined;
  const numbers = [...text.matchAll(/(-?\d+(?:[.,]\d+)?)\s*(%|mA\b|mV\b|mW\b|kW\b|kg\b|mg\b|min\b|A\b|V\b|W\b|g\b|h\b|s\b)/gu)];
  const proposed = numbers.at(-1);
  const continuous = /\b(continuously|continuous|continuamente|continuo|permanentemente|sempre)\b/u.test(normalized)
    && /\b(tx|transmitter|transmitting|transmit|transmissor|transmitindo|transmissao)\b/u.test(normalized);
  if (continuous && /\b(not|never|nao|nunca)\b/u.test(normalized)) return undefined;
  const relevant = proposed ? candidates.filter((entity) => entity.properties.some((property) => typeof property.value === "number" && dimension(property.unit ?? "") === dimension(proposed[2]))) : candidates;
  const concrete = relevant.filter((entity) => entity.kind !== "subsystem");
  let eligible = concrete.length ? concrete : relevant;
  if (continuous) {
    const scoped = eligible.length ? eligible : model.entities;
    eligible = scoped.filter((entity) => entity.properties.some((property) => property.key === "tx_duty_cycle"));
  }
  if (eligible.length !== 1) return undefined;
  const target = eligible[0];
  if (continuous && !proposed) {
    const property = target.properties.find((property) => property.key === "tx_duty_cycle");
    if (!property || typeof property.value !== "number" || !["%", "1"].includes(property.unit ?? "") || property.value === (property.unit === "%" ? 100 : 1)) return undefined;
    return { targetEntityId: target.id, propertyKey: property.key, value: 100, unit: "%" };
  }
  if (proposed) {
    const unit = proposed[2];
    const properties = target.properties.filter((property) => typeof property.value === "number" && dimension(property.unit ?? "") === dimension(unit));
    const named = properties.filter((property) => [clean(property.name), ...(aliases[property.key] ?? [])].some((term) => normalized.includes(term)));
    const property = named.length === 1 ? named[0] : properties.length === 1 ? properties[0] : undefined;
    if (!property) return undefined;
    const value = Number(proposed[1].replace(",", "."));
    if (!Number.isFinite(value) || (value === property.value && unit === property.unit)) return undefined;
    return { targetEntityId: target.id, propertyKey: property.key, value, unit };
  }
  if (target.kind !== "component" || !/\b(usar|trocar|substituir|use|replace|instead|swap)\b/u.test(normalized)) return undefined;
  const alternative = [...text.matchAll(/\b[A-Za-z][A-Za-z-]*\d+[A-Za-z0-9-]*\b/gu)].map((match) => match[0]).find((name) => !clean(target.name).includes(clean(name)) && !target.properties.some((property) => clean(String(property.value)) === clean(name)));
  return alternative ? { targetEntityId: target.id, replacementName: alternative } : undefined;
}

/** A fully resolved hypothesis is already a reviewable change. No extra wizard is needed. */
export function changeFromHypothesis(suggestion: DiscoveryHypothesis, model: EngineeringSystemModel, description: string): EngineeringChange | undefined {
  const target = model.entities.find((entity) => entity.id === suggestion.targetEntityId);
  const property = target?.properties.find((item) => item.key === suggestion.propertyKey);
  if (!property || typeof suggestion.value !== "number" || !Number.isFinite(suggestion.value) || suggestion.replacementName) return undefined;
  return { id: `change-${crypto.randomUUID()}`, targetEntityId: target!.id, kind: "parameter", oldValues: [property],
    newValues: [{ ...property, value: suggestion.value, unit: suggestion.unit ?? property.unit, source: "user", evidenceRefs: [] }],
    description: description.slice(0, 600), createdAt: new Date().toISOString() };
}
