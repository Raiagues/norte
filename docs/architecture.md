# Architecture

Norte is a React and Vite engineering workspace backed by a Fastify API. Production serves both from one HTTPS origin. Existing project memory, account/team management, timeline, and canvas persistence remain the foundation.

## Project and navigation

`MissionProject` remains schema version 2. Optional `engineeringSystem` adds the typed baseline without replacing the historical mission board. Normalization fills missing `phaseProgress` and `memoryRevision`; old projects retain their boards and previously reached conception access. `phaseProgress.highestUnlockedStep` records access independently of the active route. `navigation.lastConceptionWorkspace` resumes System, Timeline, or Discovery; first initialization selects System. The active project's team supplies read-only sidebar context.

`Start conception` persists the current Project Memory before requesting initialization. `/api/system-ai/generate` resolves linked artifacts from the authenticated server store, builds architecture and requirements, then atomically persists the baseline and unlocks Conception. Concurrent initialization shares one operation; changes to memory during extraction produce a recoverable conflict. An existing model is returned unchanged. Memory revisions reveal later changes without rebuilding the baseline.

## Engineering representation

`src/lib/engineeringSystem.ts` defines entities, typed properties, directional engineering relations, independent requirements, short evidence references and auditable scenario records. `shared/engineering-schema.mjs` bounds inputs and validates references at HTTP and model-response boundaries. Requirements constrain the model through explicit trace references and are excluded from normal graph nodes.

System uses Dagre for a macro architecture and explicit subsystem drill-down. Node information and requirements open intentional overlays. Corrections preserve the original source and record changed values as team inputs. Discovery reuses the existing board format, local cache and API endpoints; it no longer calls the brainstorming organizer or treats card position as evidence. A conservative local recognizer offers the shared scenario editor only for a supported entity/value hypothesis.

Fully resolved numeric Discovery hypotheses run the deterministic engine immediately from the contextual impact action. Percent TX activity and continuous transmission resolve through generic property semantics. Ambiguous targets and component replacements still require clarification. The graph displays the proposed value and allows clearing the scenario without changing the baseline.

Expert edits increment an optional baseline revision and append bounded correction records. Each record retains the initial suggestion, immediately preceding state, corrected state, source snapshots, related context and timestamp. Relationship edits include endpoints and type; related containment/requirement changes share a transaction. Historical snapshots remain valid after deleting live objects. Contextual JSON export supports later review; no training pipeline is implemented.

## Extraction and evidence

`server/system-ai.mjs` has its own Gemini prompt and response schema. Only explicitly linked artifacts belonging to the project or its team are read. Bounded UTF-8 text, Markdown, JSON, CSV and code are decoded locally. Literal excerpts and their actual line locations are verified; documented numeric values must appear in the cited text. PDFs are sent inline but unverified quotes and properties remain inferred pending review. DOCX/XLSX remain unparsed; links provide metadata only. No external artifact URL is fetched. Document instructions are untrusted data.

The provider receives the structural response schema without nested length, count or numeric limits that exceed its supported decoding complexity. Extraction-specific enums match the server contract: source quotations are facts, while entity/relation uncertainty is represented by `source=inferred`. The server still applies the complete bounded schema and evidence validation before persistence. Formula inputs must connect in the declared direction, and containment must agree with parent references without cycles. An invalid response is rejected with a recoverable error; it never becomes a prebuilt fallback or an automatically repaired claim.

## Change analysis

`shared/impact-engine.mjs` is shared by the server and browser. It normalizes compatible units, follows the meaning of actual relationships, checks explicit electrical/mass/duration limits, and evaluates supported formulas only when sources and inputs exist. Missing data remains `review`; inferred causal premises cannot justify a deterministic `critical`. Each conclusion records the path, input values, rule, calculation and supporting evidence. Optional Gemini assistance refines evidenced review explanations and cannot override deterministic verdicts.

The generic operating-point rules include exclusive-mode TX/RX average power, active-load duty contribution, explicit design multipliers and generation-minus-demand balance. Average power is not peak current; an orbital mean is not proof of per-phase energy sufficiency. Deficit risks follow documented or explicitly inferred dependencies and retain uncertainty about battery charge, timing and reset behavior.

Changes and their evidence are temporary until explicitly saved in `engineeringSystem.scenarios`. They never promote themselves into the baseline. This is a bounded rule engine, not a general physics simulator. Saved analyses retain their original calculations and proposed change; full baseline version control is not implemented.

## Persistence and security

`server/app.mjs` owns cookie authentication, CSRF, authorization, artifacts and project/workspace persistence. Local development uses an atomic JSON file. `server/postgres-store.mjs` stores the same versioned state in PostgreSQL with transactions and row locking. Gemini credentials stay on the server. Local browser storage remains a fallback; normal startup preserves existing data.

Fresh validation seeds contain one neutral team and Quetzal-1 EPS + COMMS with curated design text from `benchmark/quetzal1/context/`. No generated baseline is seeded. Expectations and flight observations stay in `evaluation_reference/` pending independent engineering review; application imports never reach this evaluator directory. A0 measures supplied curated-context extraction predictions, B isolates deterministic changes, C1 compares historical causal effects and C2 exercises a separately authored masked structure with perturbed values. Private reports retain manifests and failures. The contamination probe runs without Project Memory or retrieval and is never scored. None of these results establishes blind historical prediction or raw-document ingestion quality.

`scripts/reset-validation-data.mjs` provides a guarded development/test reset with private backups and account preservation. It never runs during startup and refuses remote/production databases. The older synthetic examples remain isolated regression fixtures.

## Delivery and checks

GitHub Actions runs quality and security checks. GitHub Pages builds a separate browser-only demo, while Render and Neon support the full service. TypeScript, ESLint, Vitest, API/engine tests and production build form `npm run quality`. `npm run test:visual` uses an isolated temporary database, real React/API behavior and a mocked external extraction provider to verify the engineering workflow in Chromium.
