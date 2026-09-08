/** Decodes what Norte has actually stored for an artifact.
 *
 * This is the only place that decides whether a source can reach the
 * extraction model. `prepareProjectArtifacts` builds the model request from it
 * and the artifacts API publishes its verdict to the interface, so the page
 * can never promise readable memory the extraction service will reject.
 */
import { xlsxToCsv } from "./xlsx-text.mjs";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 12 * 1024 * 1024;
export const MAX_TEXT_CHARACTERS = 120_000;
export const TEXT_MIMES = new Set(["text/plain", "text/markdown", "text/csv", "application/json", "text/javascript", "application/javascript", "text/x-python", "text/x-c", "text/typescript"]);
export const SPREADSHEET_MIMES = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
const OPAQUE_OFFICE_FILE = /\.(docx?|xls|od[st]|rtf)$/iu;
const DATA_URL = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/u;

export const ARTIFACT_STATUS_REASONS = {
  metadata_only: "External links are metadata only; their contents have not been fetched.",
  invalid: "File content is invalid or exceeds the document processing limit.",
  budget: "Project memory exceeds the total document processing limit; this file was not read.",
  pdf: "PDF supplied to Gemini; excerpts need human source verification.",
  text: "Text encoding or size is unsupported. Use a smaller UTF-8 file.",
  spreadsheet: "The spreadsheet could not be read. Export it as CSV or PDF.",
  unsupported: "Not parsed yet. Export this document or spreadsheet as PDF, CSV, or UTF-8 text."
};

/**
 * Classify one stored artifact.
 *
 * `remainingBytes` applies the shared parsing budget while preparing a whole
 * project; the artifacts API omits it so each file is judged on its own.
 */
export function classifyArtifactSource(artifact, { remainingBytes = Number.POSITIVE_INFINITY } = {}) {
  const fileName = artifact?.fileName || "";
  const match = DATA_URL.exec(artifact?.url || "");
  if (!match) return { status: "metadata_only", reason: ARTIFACT_STATUS_REASONS.metadata_only, byteLength: 0 };
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.toString("base64") !== match[2] || bytes.length === 0 || bytes.length > MAX_FILE_BYTES) {
    return { status: "not_parsed", reason: ARTIFACT_STATUS_REASONS.invalid, byteLength: 0 };
  }
  if (bytes.length > remainingBytes) return { status: "not_parsed", reason: ARTIFACT_STATUS_REASONS.budget, byteLength: 0 };
  const mimeType = match[1];
  if (mimeType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { status: "pdf", reason: ARTIFACT_STATUS_REASONS.pdf, byteLength: bytes.length, inlineData: { mimeType: "application/pdf", data: match[2] } };
  }
  if (TEXT_MIMES.has(mimeType) && !OPAQUE_OFFICE_FILE.test(fileName)) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.includes("\0") || text.length > MAX_TEXT_CHARACTERS) throw new Error("Unsupported text.");
      return { status: "parsed", reason: "", byteLength: bytes.length, text };
    } catch {
      return { status: "not_parsed", reason: ARTIFACT_STATUS_REASONS.text, byteLength: 0 };
    }
  }
  if (SPREADSHEET_MIMES.has(mimeType)) {
    try {
      // Literal cell text only: no formula evaluation and no external references.
      const text = xlsxToCsv(bytes).map((sheet) => `# ${sheet.name}\n${sheet.csv}`).join("\n\n");
      if (!text.trim() || text.length > MAX_TEXT_CHARACTERS) throw new Error("Unsupported spreadsheet.");
      return { status: "parsed", reason: "", byteLength: bytes.length, text };
    } catch {
      return { status: "not_parsed", reason: ARTIFACT_STATUS_REASONS.spreadsheet, byteLength: 0 };
    }
  }
  return { status: "not_parsed", reason: ARTIFACT_STATUS_REASONS.unsupported, byteLength: 0 };
}

/** The verdict published to clients: no file bytes, only whether it is usable. */
export function artifactReadabilityRecord(artifact) {
  const { status, reason } = classifyArtifactSource(artifact);
  return { status, reason };
}
