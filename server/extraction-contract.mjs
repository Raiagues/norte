/** Shared extraction-only enum constraints for provider and runtime validation. */
export const EXTRACTED_SOURCE_KINDS = Object.freeze(["documented", "inferred"]);
export const EXTRACTED_EVIDENCE_KINDS = Object.freeze(["fact"]);
export function extractionEnums(schema) {
  const copy = structuredClone(schema);
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.properties?.source) node.properties.source.enum = [...EXTRACTED_SOURCE_KINDS];
    if (node.properties?.classificationSource) node.properties.classificationSource.enum = [...EXTRACTED_SOURCE_KINDS];
    if (node.properties?.excerpt && node.properties?.kind) node.properties.kind.enum = [...EXTRACTED_EVIDENCE_KINDS];
    Object.values(node).forEach((value) => { if (Array.isArray(value)) value.forEach(visit); else visit(value); });
  }
  visit(copy); return copy;
}
