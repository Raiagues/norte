import type { EngineeringSystemModel } from "./engineeringSystem";

export type DiscoveryHypothesis = { targetEntityId: string; propertyKey?: string; value?: number | string; unit?: string; replacementName?: string };
const clean = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
const aliases: Record<string, string[]> = {
  mass: ["mass", "massa"], required_current: ["current", "corrente", "consumo"], peak_current: ["current", "corrente", "consumo"],
  required_voltage: ["voltage", "tensao"], voltage: ["voltage", "tensao"], required_power: ["power", "potencia"], power: ["power", "potencia"],
  minimum_autonomy: ["autonomy", "autonomia", "duration", "duracao"], autonomy: ["autonomy", "autonomia"]
};
const dimensions: Record<string, string[]> = { mass: ["g", "kg", "mg"], current: ["A", "mA"], voltage: ["V", "mV"], power: ["W", "mW", "kW"], time: ["min", "h", "s"] };
function dimension(unit: string): string | undefined { return Object.keys(dimensions).find((key) => dimensions[key].includes(unit)); }

/** Recognition offers an editable proposal; it never asserts a physical dependency. */
export function recognizeEngineeringHypothesis(text: string, model?: EngineeringSystemModel): DiscoveryHypothesis | undefined {
  if (!model) return undefined;
  const normalized = clean(text);
  const candidates = model.entities.filter((entity) => {
    if (entity.kind === "system") return false;
    const terms = [entity.name, ...entity.properties.filter((property) => typeof property.value === "string").map((property) => String(property.value))];
    return terms.some((term) => clean(term).split(/\s+/u).filter((word) => word.length >= 3).some((word) => normalized.split(/[^\p{L}\p{N}-]+/u).includes(word)));
  });
  const numbers = [...text.matchAll(/(-?\d+(?:[.,]\d+)?)\s*(mA|mV|mW|kW|kg|mg|min|A|V|W|g|h|s)\b/gu)];
  const proposed = numbers.at(-1);
  const concrete = candidates.filter((entity) => entity.kind !== "subsystem");
  const eligible = concrete.length ? concrete : candidates;
  if (eligible.length !== 1) return undefined;
  const target = eligible[0];
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
