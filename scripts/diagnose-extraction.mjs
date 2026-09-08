/** Evaluator data is read only after generation; never passed to the extraction pipeline. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID, createHash } from "node:crypto";
import { createSystemAiService, prepareProjectArtifacts, validateExtractedSystem, geminiResponseSchema } from "../server/system-ai.mjs";
import { geminiGenerate, classifyExtractionError } from "../server/gemini-transport.mjs";
import { runExtractionPipeline } from "../server/extraction-pipeline.mjs";
import { matchesSchema } from "../shared/engineering-schema.mjs";
import { createValidationProject } from "../server/data-store.mjs";
import { createQuetzalArtifacts, contextDocuments } from "../benchmark/quetzal1/context/design-context.mjs";
import { evaluateExtraction } from "./quetzal-evaluator.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const save = (file, value) => writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600 });
export async function diagnoseExtraction({ models = ["gemini-3.5-flash-lite", "gemini-3.8-flash"], runs = 2, timeoutMs = 90_000, outputDirectory, language = "en", seed, strategy = "A", internalLanguage = "en", ablation = 6 } = {}) {
  const directory = resolve(outputDirectory || `var/benchmarks/diagnose-${Date.now()}-${randomUUID().slice(0, 8)}`);
  await mkdir(resolve(directory, ".."), { recursive: true });
  await mkdir(directory, { mode: 0o700 });
  const project = createValidationProject();
  const artifacts = createQuetzalArtifacts(project.id);
  const parsed = prepareProjectArtifacts(project, artifacts);
  let template;
  // Capture the actual production request without sending it or modifying its prompt/schema.
  const capture = createSystemAiService({ apiKey: "capture-only", transportPolicy: { timeoutMs: 1000, totalDeadlineMs: 1000, maxAttempts: 1 }, fetch: async (_url, options) => { template = JSON.parse(options.body); throw new Error("capture only"); } });
  await capture.generate(project, artifacts, language).catch(() => {});
  if (seed !== undefined) template.generationConfig.seed = seed;
  const manifest = { revision: "extraction-diagnostics-1", startedAt: new Date().toISOString(), strategy, language, internalLanguage, ablation, runsPerModel: runs, models, timeoutMs, parameters: template.generationConfig, contextHash: hash(contextDocuments), requestHash: hash(template), records: [], policy: "One physical request per stage, no automatic retries. Every output retained. Evaluator never sent to provider." };
  await save(join(directory, "manifest.json"), manifest);
  for (let run = 1; run <= runs; run += 1) for (const model of models) {
    const runDir = join(directory, `${model}-${run}`);
    await mkdir(runDir, { mode: 0o700 });
    const record = { model, run, strategy, provider: [], schemaStatus: "not_run", hierarchyStatus: "not_run", contractStatus: "not_run", a0Status: "not_run", categories: [] };
    let raw, prediction;
    try {
      const request = async (body, stage) => {
        const output = await geminiGenerate({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY, model, body, policy: { timeoutMs, totalDeadlineMs: timeoutMs + 1000, maxAttempts: 1 }, onAttempt: async (attempt, payload) => { record.provider.push({ ...attempt, stage }); await save(join(runDir, `request-${record.provider.length}.json`), payload.request); await save(join(runDir, `response-${record.provider.length}.json`), payload.response); await save(join(runDir, "metadata.json"), record); } });
        const valid = matchesSchema(output, body.generationConfig.responseJsonSchema);
        record.schemaStatus = valid ? "pass" : "fail";
        if (!valid) throw Object.assign(new Error("Stage schema invalid"), { code: "SYSTEM_RESPONSE_INVALID" });
        return output;
      };
      if (strategy === "A") raw = await request(template, "monolithic");
      else {
        const result = await runExtractionPipeline({ strategy, parsed, project, language, internalLanguage, ablation, request: (prompt, schema, stage) => request({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, maxOutputTokens: 16000, responseMimeType: "application/json", responseJsonSchema: geminiResponseSchema(schema), ...(seed === undefined ? {} : { seed }) } }, stage) });
        await save(join(runDir, "stages.json"), result.stageOutputs);
        raw = result.raw;
        if (result.partial) { record.partial = true; throw Object.assign(new Error("Partial scope; full contract and A0 not applicable"), { category: "partial_scope" }); }
      }
      await save(join(runDir, "raw.json"), raw);
      prediction = validateExtractedSystem(raw, project, parsed, model);
      record.contractStatus = "pass"; record.hierarchyStatus = "pass";
      await save(join(runDir, "prediction.json"), prediction);
    } catch (error) {
      record.categories.push(error.category || classifyExtractionError(error.code));
      record.errorCode = error.code || "DIAGNOSTIC_ERROR";
      if (raw && !record.partial) { record.contractStatus = "fail"; if (error.code === "SYSTEM_HIERARCHY_INVALID") record.hierarchyStatus = "fail"; }
    }
    if (raw && !record.partial) {
      const truth = JSON.parse(await readFile(new URL("../benchmark/quetzal1/evaluation_reference/expectations.json", import.meta.url), "utf8"));
      const evaluation = evaluateExtraction(prediction || raw, truth, contextDocuments);
      record.a0Status = evaluation.status;
      record.a0Metrics = evaluation.metrics;
      record.failures = evaluation.failures;
      record.missingEntities = evaluation.entities?.filter((entity) => !entity.predictedId);
      record.missingProperties = evaluation.entities?.flatMap((entity) => entity.properties.filter((property) => !property.correct).map((property) => ({ entity: entity.expectedId, ...property })));
      if (record.missingEntities?.length || record.missingProperties?.length) record.categories.push("missing_required_fact");
      if (evaluation.relations?.missing.length || evaluation.relations?.unexpected.length) record.categories.push("relation_semantic_failure");
      if (evaluation.requirements?.some((requirement) => !requirement.correctTrace)) record.categories.push("requirement_trace_failure");
      if (evaluation.unsupportedClaims?.length) record.categories.push("unsupported_evidence");
      record.relationErrors = evaluation.relations;
      record.requirementErrors = evaluation.requirements;
      record.evidenceErrors = evaluation.unsupportedClaims;
      await save(join(runDir, "a0.json"), evaluation);
    }
    record.elapsedMs = record.provider.reduce((sum, attempt) => sum + attempt.elapsedMs, 0);
    manifest.records.push(record);
    await save(join(runDir, "metadata.json"), record);
    await save(join(directory, "manifest.json"), manifest);
    const rows = manifest.records.map((item) => `| ${item.model} | ${item.run} | ${item.provider.map((p) => p.httpStatus || p.status).join(",")} | ${item.elapsedMs} | ${item.schemaStatus} | ${item.contractStatus} | ${item.a0Status} | ${item.categories.join(", ")} |`);
    await writeFile(join(directory, "report.md"), `# Extraction diagnostics\n\n| Model | Run | Provider | Latency ms | Schema | Contract | A0 | Failure |\n| --- | --- | --- | --- | --- | --- | --- | --- |\n${rows.join("\n")}\n\nDetailed missing facts, relations, requirements and evidence: each run's a0.json and metadata.json. No private thoughts or request headers retained.\n`, { mode: 0o600 });
    console.log(JSON.stringify({ model, run, strategy, provider: record.provider.map((p) => ({ status: p.status, http: p.httpStatus, ms: p.elapsedMs, requestChars: p.requestChars, schemaChars: p.schemaChars })), contract: record.contractStatus, a0: record.a0Status, categories: record.categories }));
  }
  return { directory, manifest };
}
async function main() {
  const options = {};
  const names = { "--models": "models", "--runs": "runs", "--timeout-ms": "timeoutMs", "--output-dir": "outputDirectory", "--language": "language", "--strategy": "strategy", "--seed": "seed", "--internal-language": "internalLanguage", "--ablation": "ablation" };
  for (let i = 2; i < process.argv.length; i += 2) {
    const name = names[process.argv[i]], value = process.argv[i + 1];
    if (!name || !value) throw new Error("Usage: diagnose:extraction -- --models ID,ID --runs N --timeout-ms N --language en|pt --strategy A --output-dir NEW_DIR");
    options[name] = name === "models" ? value.split(",") : ["runs", "timeoutMs", "seed", "ablation"].includes(name) ? Number(value) : value;
  }
  if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) throw new Error("Load the server Gemini key using --env-file=.env.local.");
  if (options.runs !== undefined && (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 10)) throw new Error("Use 1–10 runs.");
  if (options.strategy && !["A", "B", "C", "compact"].includes(options.strategy)) throw new Error("Use A, B, C or compact strategy.");
  if (options.internalLanguage && !["en", "pt"].includes(options.internalLanguage)) throw new Error("Use internal language en or pt.");
  const { directory } = await diagnoseExtraction(options); console.log(JSON.stringify({ directory }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
